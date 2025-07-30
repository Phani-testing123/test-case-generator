import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'react-hot-toast';

// Helper function to generate a unique ID
const generateId = () => `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const App = () => {
  // --- STATE MANAGEMENT ---
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openaiCases, setOpenaiCases] = useState([]);
  const [geminiCases, setGeminiCases] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});
  const [showGherkin, setShowGherkin] = useState(true);
  const [scenarioCount, setScenarioCount] = useState(5);
  const [loginCredentials, setLoginCredentials] = useState('');
  const [selectedModels, setSelectedModels] = useState({ openai: true, gemini: false });
  const [countError, setCountError] = useState(null);

  // --- SESSION PERSISTENCE ---
  useEffect(() => {
    const savedOpenai = localStorage.getItem('testCaseOpenai');
    const savedGemini = localStorage.getItem('testCaseGemini');
    if (savedOpenai) setOpenaiCases(JSON.parse(savedOpenai));
    if (savedGemini) setGeminiCases(JSON.parse(savedGemini));
  }, []);

  useEffect(() => {
    localStorage.setItem('testCaseOpenai', JSON.stringify(openaiCases));
    localStorage.setItem('testCaseGemini', JSON.stringify(geminiCases));
  }, [openaiCases, geminiCases]);

  // --- PARSING FUNCTION (REUSABLE) ---
  const parseAIOutput = (output, isGherkin) => {
    if (!output || !output.trim()) return [];

    let testCaseChunks = [];

    if (isGherkin) {
      // Gherkin format is reliably split by the "Scenario:" keyword
      const chunks = output.split(/Scenario:/im);
      testCaseChunks = chunks.slice(1).map(chunk => "Scenario:" + chunk);
    } else {
      // ✅ FINAL FIX: More reliably split non-gherkin by finding numbered list patterns
      const firstTestIndex = output.search(/\d+\.\s/);
      const cleanOutput = firstTestIndex !== -1 ? output.substring(firstTestIndex) : output;
      testCaseChunks = cleanOutput.split(/\n(?=\d+\.\s)/).filter(s => s.trim());
    }

    if (testCaseChunks.length === 0 && output.trim()) {
      // Fallback if splitting fails
      testCaseChunks.push(output);
    }

    return testCaseChunks.map(textChunk => {
      const lines = textChunk.trim().split('\n').map(l => l.trim());
      let title = lines.shift() || 'Untitled';
      
      title = title.replace(/^(Scenario:|Test Case:|\d+\.\s*)/i, '').trim();
      
      const remainingText = lines.join('\n');
      let stepsText = remainingText;
      let expectedResultText = '';
      let steps = [];

      if (!isGherkin) {
        const resultMatch = remainingText.match(/expected result:/i);
        if (resultMatch) {
            const resultIndex = resultMatch.index;
            stepsText = remainingText.substring(0, resultIndex);
            expectedResultText = remainingText.substring(resultIndex).replace(/expected result:/i, '').trim();
        }
        steps = stepsText.replace(/test steps:/i, '').trim().split('\n');
      } else {
        steps = remainingText.split('\n');
      }

      return {
        id: generateId(),
        title: title,
        lines: steps.filter(Boolean),
        expectedResult: expectedResultText,
        isGherkin: isGherkin,
      };
    });
  };

  // --- GENERATION & PARSING LOGIC ---
  const handleGenerate = async () => {
    if (!input.trim()) {
      toast.error('Please enter acceptance criteria first.');
      return;
    }
    if (!selectedModels.openai && !selectedModels.gemini) {
      toast.error('Please select at least one AI model.');
      return;
    }
    setLoading(true);
    setError(null);

    const personaText = loginCredentials.trim() ? `For a user with login credentials "${loginCredentials.trim()}", ` : '';
    const prompt = showGherkin
      ? `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in Gherkin format. Generate a comprehensive set of test cases...`
      : `${input}\n\n${personaText}Please generate ${scenarioCount} test cases. For each test case, start the title on a new line with a number and a period (e.g., '1. Test Case Title'). You MUST use the exact headings 'Test Steps:' and 'Expected Result:'.`;

    try {
      const apiCalls = [];
      if (selectedModels.openai) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: prompt }));
      }
      if (selectedModels.gemini) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-gemini-test-cases', { input: prompt }));
      }

      const responses = await Promise.all(apiCalls);
      
      let newOpenaiCases = [];
      let newGeminiCases = [];
      let responseIndex = 0;

      if (selectedModels.openai) {
        newOpenaiCases = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
        responseIndex++;
      }
      if (selectedModels.gemini) {
        newGeminiCases = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
      }
      
      setOpenaiCases(newOpenaiCases);
      setGeminiCases(newGeminiCases);
      
      const allNewCases = [...newOpenaiCases, ...newGeminiCases];
      const initialExpansionState = allNewCases.reduce((acc, tc) => {
        acc[tc.id] = true;
        return acc;
      }, {});
      setExpandedIds(initialExpansionState);

      toast.success('Test cases generated!');
    } catch (err) {
      console.error('Error:', err);
      setError('❌ One or more AI models failed to generate. Check the console and your backend service.');
      toast.error('Generation failed.');
    } finally {
      setLoading(false);
    }
  };
  
  // --- UI INTERACTION HANDLER ---
  const toggleExpand = (id) => {
    setExpandedIds(prev => ({...prev, [id]: !prev[id]}));
  };

  const handleCountChange = (e) => {
    const count = Number(e.target.value);
    setScenarioCount(count);
    if (count < 5 || count > 12) {
      setCountError('Count must be between 5 and 12.');
    } else {
      setCountError(null);
    }
  };

  // --- EXPORT AND COPY FUNCTIONS ---
  const exportToExcel = () => {
    const allCases = [...openaiCases, ...geminiCases];
    if (allCases.length === 0) {
      toast.error('No results to export.');
      return;
    }
    
    const dataForExport = allCases.map(tc => ({ 
      'Test Case Title': tc.title, 
      'Steps': tc.lines.join('\n'), 
      'Expected Result': tc.expectedResult || 'N/A' 
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Test Cases");
    XLSX.writeFile(wb, 'all_test_cases.xlsx');
    toast.success('Exported to Excel!');
  };

  const copyToClipboard = () => {
    const allCases = [...openaiCases, ...geminiCases];
    if (allCases.length === 0) {
      toast.error('No results to copy.');
      return;
    }
    
    const textToCopy = allCases.map(tc => {
        const title = tc.isGherkin ? `Scenario: ${tc.title}` : `Test Case: ${tc.title}`;
        const steps = tc.lines.join('\n');
        const result = tc.expectedResult ? `\n\nExpected Result:\n${tc.expectedResult}` : '';
        return `${title}\n${steps}${result}`;
    }).join('\n\n=====================\n\n');

    navigator.clipboard.writeText(textToCopy.trim());
    toast.success('Results copied!');
  };

  const clearAll = () => {
    setInput('');
    setOpenaiCases([]);
    setGeminiCases([]);
    setError(null);
    toast('Cleared all data.', { icon: '🗑️' });
  };
  
  // --- SUB-COMPONENT FOR RENDERING A SET OF TEST CASES ---
  const TestCaseColumn = ({ title, cases }) => {
    if (!cases || cases.length === 0) {
        if (title === "OpenAI Results" && selectedModels.openai) {
            return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from OpenAI.</div>
        }
        if (title === "Gemini Results" && selectedModels.gemini) {
            return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from Gemini.</div>
        }
        return null;
    }
    return (
      <div className='space-y-4'>
        <h3 className='text-center font-bold text-lg text-blue-300'>{title}</h3>
        {cases.map((tc) => (
          <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg transition">
            <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => toggleExpand(tc.id)}>
              <p className="font-bold text-gray-200">{tc.title}</p>
              <span className={`transform transition-transform ${expandedIds[tc.id] ? 'rotate-180' : ''}`}>▼</span>
            </div>
            {expandedIds[tc.id] && (
              <div className="px-4 pb-4 border-t border-gray-700 space-y-3 pt-3">
                {tc.isGherkin ? (
                  <div className="whitespace-pre-wrap text-sm text-gray-300">{tc.lines.join('\n')}</div>
                ) : (
                  <>
                    <div className='space-y-1'>
                      <p className="font-semibold text-gray-400 text-sm">Test Steps:</p>
                      <div className="whitespace-pre-wrap text-sm text-gray-300 pl-4 border-l-2 border-gray-600">{tc.lines.join('\n')}</div>
                    </div>
                    {tc.expectedResult && (
                      <div className='space-y-1'>
                        <p className="font-semibold text-green-400 text-sm">Expected Result:</p>
                        <div className="whitespace-pre-wrap text-sm text-gray-300 pl-4 border-l-2 border-green-800">{tc.expectedResult}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="min-h-screen bg-gray-900 text-white px-4 py-8 sm:px-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-4">
            <img src="/bk-icon.png" alt="App Logo" className="h-12 w-12" />
            <h1 className="text-3xl sm:text-4xl font-bold text-center">AI Test Case Generator</h1>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
            <textarea
              className="w-full rounded-lg p-4 bg-gray-900 text-white text-sm sm:text-base resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Paste acceptance criteria or feature description here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Login Credentials</label>
                <input type="text" value={loginCredentials} onChange={e => setLoginCredentials(e.target.value)} placeholder="e.g., an admin user" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Case Count</label>
                 <input type="number" value={scenarioCount} onChange={handleCountChange} min="5" max="12" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
                 {countError && <p className="text-red-500 text-xs mt-1">{countError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">AI Model(s)</label>
                <div className="flex items-center justify-around bg-gray-700 p-2 rounded-md text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={selectedModels.openai} onChange={() => setSelectedModels(prev => ({...prev, openai: !prev.openai}))} className="accent-blue-500 h-4 w-4" />
                      OpenAI
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={selectedModels.gemini} onChange={() => setSelectedModels(prev => ({...prev, gemini: !prev.gemini}))} className="accent-blue-500 h-4 w-4" />
                      Gemini
                    </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-700">
                <div className="flex items-center gap-2 text-sm">
                    <label htmlFor="toggleGherkin" className="font-medium">Gherkin Format</label>
                    <input id="toggleGherkin" type="checkbox" checked={showGherkin} onChange={() => setShowGherkin(!showGherkin)} className="accent-blue-500 w-5 h-5 cursor-pointer"/>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={clearAll} className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded shadow transition">Clear All</button>
                    <button onClick={handleGenerate} className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded shadow transition disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={loading || !input.trim() || !!countError}>
                        {loading ? '🤖 Generating...' : 'Generate Cases'}
                    </button>
                </div>
            </div>
          </div>

          <div>
            {loading && <div className="text-center p-6"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto"></div><p className='mt-3'>AI is thinking...</p></div>}
            {error && <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-center border border-red-700">{error}</div>}
            {!loading && !error && openaiCases.length === 0 && geminiCases.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
            {(openaiCases.length > 0 || geminiCases.length > 0) && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pt-2">
                    <h2 className='text-lg font-semibold text-green-400'>✅ Consolidated Results</h2>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={openaiCases.length === 0 && geminiCases.length === 0}>📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={openaiCases.length === 0 && geminiCases.length === 0}>📤 Export Excel</button>
                    </div>
                </div>

                <div className="p-3 rounded-md bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-base font-medium text-center">
                  ⚠️ AI can make mistakes. Please review with human intelligence.
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TestCaseColumn title="OpenAI Results" cases={openaiCases} />
                    <TestCaseColumn title="Gemini Results" cases={geminiCases} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default App;