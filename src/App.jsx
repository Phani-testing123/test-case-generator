import React, { useState, useEffect, useMemo } from 'react';
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
  const [openaiSummary, setOpenaiSummary] = useState('');
  const [geminiSummary, setGeminiSummary] = useState('');
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
    if (!output || !output.trim()) return { cases: [], summary: '' };

    let summary = '';
    let casesText = output;
    const summaryMatch = output.match(/coverage summary:/i);
    if (summaryMatch) {
        const summaryIndex = summaryMatch.index;
        casesText = output.substring(0, summaryIndex);
        summary = output.substring(summaryIndex).replace(/coverage summary:/i, '').trim();
    }

    let testCaseChunks = [];
    if (isGherkin) {
      const chunks = casesText.split(/Scenario:/im);
      testCaseChunks = chunks.slice(1).map(chunk => "Scenario:" + chunk);
    } else {
      const firstTestIndex = casesText.search(/\d+\.\s/);
      const cleanOutput = firstTestIndex !== -1 ? casesText.substring(firstTestIndex) : casesText;
      testCaseChunks = cleanOutput.split(/\n(?=\d+\.\s)/).filter(s => s.trim());
    }

    if (testCaseChunks.length === 0 && casesText.trim()) {
      testCaseChunks.push(casesText);
    }

    const cases = testCaseChunks.map(textChunk => {
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

    return { cases, summary };
  };

  // --- GENERATION & PARSING LOGIC ---
  const handleGenerate = async () => {
    if (!input.trim() || !!countError) {
      toast.error('Please resolve errors before generating.');
      return;
    }
    if (!selectedModels.openai && !selectedModels.gemini) {
      toast.error('Please select at least one AI model.');
      return;
    }
    setLoading(true);
    setError(null);

    const personaText = loginCredentials.trim() ? `For a user with login credentials "${loginCredentials.trim()}", ` : '';
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in ${showGherkin ? 'Gherkin format' : 'plain text format'}. After generating all test cases, add a final section under the heading "Coverage Summary:" that briefly explains the scope and focus of the generated tests.`;

    try {
      const apiCalls = [];
      if (selectedModels.openai) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: prompt }));
      }
      if (selectedModels.gemini) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-gemini-test-cases', { input: prompt }));
      }

      const responses = await Promise.all(apiCalls);
      
      let newOpenaiData = { cases: [], summary: '' };
      let newGeminiData = { cases: [], summary: '' };
      let responseIndex = 0;

      if (selectedModels.openai) {
        newOpenaiData = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
        responseIndex++;
      }
      if (selectedModels.gemini) {
        newGeminiData = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
      }
      
      setOpenaiCases(newOpenaiData.cases);
      setGeminiCases(newGeminiData.cases);
      setOpenaiSummary(newOpenaiData.summary);
      setGeminiSummary(newGeminiData.summary);
      
      toast.success('Test cases generated!');
    } catch (err) {
      console.error('Error:', err);
      setError('❌ One or more AI models failed to generate. Check the console and your backend service.');
      toast.error('Generation failed.');
    } finally {
      setLoading(false);
    }
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
    
    // ✅ UPDATED: Simplified data for export
    const dataForExport = allCases.map(tc => ({ 
      'Test Case Title': tc.title, 
      'BDD Steps': tc.lines.join('\n'),
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 60 }, { wch: 60 }]; // Updated column widths
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, 'ai_generated_test_cases.xlsx');
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
    setOpenaiSummary('');
    setGeminiSummary('');
    setError(null);
    toast('Cleared all data.', { icon: '🗑️' });
  };
  
  // --- SUB-COMPONENT FOR RENDERING A SET OF TEST CASES ---
  const ResultsColumn = ({ title, cases, summary }) => {
    const modelKey = title.toLowerCase().includes('openai') ? 'openai' : 'gemini';
    if (!selectedModels[modelKey]) return null;

    if (cases.length === 0 && !loading) {
        return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from {title.split(' ')[0]}.</div>
    }

    return (
      <div className='space-y-4'>
        <h3 className='text-center font-bold text-lg text-blue-300'>{title}</h3>
        {cases.map((tc) => (
          <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="font-bold text-gray-200">{tc.title}</p>
            <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3 mt-3 border-t border-gray-700">
                {tc.isGherkin ? tc.lines.join('\n') : 
                  (<>
                    <p className="font-semibold text-gray-400">Test Steps:</p>
                    <div className="pl-2">{tc.lines.join('\n')}</div>
                    {tc.expectedResult && 
                      <>
                        <p className="font-semibold text-green-400 mt-2">Expected Result:</p>
                        <div className="pl-2">{tc.expectedResult}</div>
                      </>
                    }
                  </>)
                }
            </div>
          </div>
        ))}
        {summary && (
            <div className="mt-4 p-3 bg-gray-700/50 rounded-lg text-sm italic border border-gray-600">
                <p className="font-semibold mb-1 text-yellow-400">Coverage Summary:</p>
                <p className="text-gray-300">{summary}</p>
            </div>
        )}
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
                    <ResultsColumn title="OpenAI Results" cases={openaiCases} summary={openaiSummary} />
                    <ResultsColumn title="Gemini Results" cases={geminiCases} summary={geminiSummary} />
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