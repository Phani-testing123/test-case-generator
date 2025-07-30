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
  const [runs, setRuns] = useState([]);
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState({});

  // --- ADVANCED OPTIONS STATE ---
  const [showGherkin, setShowGherkin] = useState(true);
  const [scenarioCount, setScenarioCount] = useState(5);
  const [userPersona, setUserPersona] = useState('');
  const [selectedModels, setSelectedModels] = useState({ openai: true, gemini: false });

  // --- DERIVED STATE ---
  const activeRun = runs[activeRunIndex];

  // --- SESSION PERSISTENCE ---
  useEffect(() => {
    const savedRuns = localStorage.getItem('testCaseRuns');
    if (savedRuns) {
      setRuns(JSON.parse(savedRuns));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('testCaseRuns', JSON.stringify(runs));
  }, [runs]);

  // --- PARSING FUNCTION (REUSABLE) ---
  const parseAIOutput = (output, isGherkin) => {
    if (!output) return [];
    
    const chunks = output.split(/(Scenario:|Test Case:)/im);
    const scenarios = [];

    for (let i = 1; i < chunks.length; i += 2) {
      if (chunks[i + 1]) {
        const scenarioText = chunks[i] + chunks[i + 1];
        scenarios.push(scenarioText);
      }
    }

    return scenarios.map(scenarioText => {
      const lines = scenarioText.trim().split(/\r?\n/).map(l => l.trim());
      let rawTitle = lines.shift() || 'Untitled';
      let cleanTitle = rawTitle.replace(/(Scenario:|Test Case:)/i, '').trim();
      let steps = [];
      let expectedResult = '';
      if (isGherkin) {
        steps = lines;
      } else {
        const resultIndex = lines.findIndex(line => /expected result/i.test(line));
        if (resultIndex !== -1) {
          steps = lines.slice(0, resultIndex).filter(l => !/test steps/i.test(l));
          expectedResult = lines.slice(resultIndex + 1).join('\n');
        } else {
          steps = lines;
        }
      }
      return { id: generateId(), title: cleanTitle, lines, expectedResult, isGherkin };
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

    const personaText = userPersona.trim() ? `For a user persona of "${userPersona.trim()}", ` : '';
    const prompt = showGherkin
      ? `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in Gherkin format...`
      : `${input}\n\n${personaText}Please generate ${scenarioCount} test cases. For each, provide 'Test Steps' and a separate 'Expected Result'...`;

    try {
      const apiCalls = [];
      if (selectedModels.openai) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: prompt }));
      }
      if (selectedModels.gemini) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-gemini-test-cases', { input: prompt }));
      }

      const responses = await Promise.all(apiCalls);
      
      let openaiCases = [];
      let geminiCases = [];
      let responseIndex = 0;

      if (selectedModels.openai) {
        openaiCases = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
        responseIndex++;
      }
      if (selectedModels.gemini) {
        geminiCases = parseAIOutput(responses[responseIndex]?.data?.output, showGherkin);
      }

      const newRun = {
        id: `run_${Date.now()}`,
        openaiCases,
        geminiCases,
        modelsUsed: { ...selectedModels },
      };

      const newRuns = [...runs, newRun];
      setRuns(newRuns);
      setActiveRunIndex(newRuns.length - 1);

      // ✅ FIXED: Expand all newly generated cards by default
      const allNewCases = [...openaiCases, ...geminiCases];
      const initialExpansionState = allNewCases.reduce((acc, tc) => {
        acc[tc.id] = true; // Set each new test case to be expanded
        return acc;
      }, {});
      setExpandedIds(initialExpansionState);

      toast.success('New test run generated!');
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

  // --- EXPORT AND COPY FUNCTIONS ---
  const exportToExcel = () => {
    if (!activeRun || (!activeRun.openaiCases.length && !activeRun.geminiCases.length)) {
      toast.error('No results to export.');
      return;
    }
    
    const wb = XLSX.utils.book_new();
    
    const createSheet = (cases, sheetName) => {
        const data = cases.map(tc => ({ 
            'Test Case Title': tc.title, 
            'Steps': tc.lines.join('\n'), 
            'Expected Result': tc.expectedResult || 'N/A' 
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    if (activeRun.openaiCases.length > 0) {
        createSheet(activeRun.openaiCases, "OpenAI Results");
    }

    if (activeRun.geminiCases.length > 0) {
        createSheet(activeRun.geminiCases, "Gemini Results");
    }

    XLSX.writeFile(wb, 'consolidated_test_cases.xlsx');
    toast.success('Exported to Excel!');
  };

  const copyToClipboard = () => {
    if (!activeRun || (!activeRun.openaiCases.length && !activeRun.geminiCases.length)) {
      toast.error('No results to copy.');
      return;
    }
    let textToCopy = '';

    const formatCases = (cases, modelName) => {
        if (cases.length === 0) return '';
        let section = `--- ${modelName} Results ---\n\n`;
        section += cases.map(tc => {
            const title = tc.isGherkin ? `Scenario: ${tc.title}` : `Test Case: ${tc.title}`;
            const steps = tc.lines.join('\n');
            const result = tc.expectedResult ? `\n\nExpected Result:\n${tc.expectedResult}` : '';
            return `${title}\n${steps}${result}`;
        }).join('\n\n=====================\n\n');
        return section;
    };
    
    textToCopy += formatCases(activeRun.openaiCases, 'OpenAI');
    textToCopy += activeRun.geminiCases.length > 0 ? '\n\n' + formatCases(activeRun.geminiCases, 'Gemini') : '';

    navigator.clipboard.writeText(textToCopy.trim());
    toast.success('Results copied!');
  };

  const clearAll = () => {
    setInput('');
    setRuns([]);
    setError(null);
    setActiveRunIndex(0);
    toast('Cleared all data.', { icon: '🗑️' });
  };
  
  // --- SUB-COMPONENT FOR RENDERING A SET OF TEST CASES ---
  const TestCaseColumn = ({ title, cases }) => {
    if (!cases || cases.length === 0) {
        if (title === "OpenAI Results" && activeRun?.modelsUsed.openai) {
            return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from OpenAI.</div>
        }
        if (title === "Gemini Results" && activeRun?.modelsUsed.gemini) {
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
            <h1 className="text-3xl sm:text-4xl font-bold text-center">AI Test Case Co-Pilot</h1>
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
                <label className="block text-sm font-medium text-gray-400 mb-1">User Persona (Optional)</label>
                <input type="text" value={userPersona} onChange={e => setUserPersona(e.target.value)} placeholder="e.g., an admin user" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Case Count</label>
                 <input type="number" value={scenarioCount} onChange={e => setScenarioCount(Number(e.target.value))} min="1" max="20" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
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
                    <button onClick={handleGenerate} className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded shadow transition disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={loading || !input.trim()}>
                        {loading ? '🤖 Generating...' : 'Generate Cases'}
                    </button>
                </div>
            </div>
          </div>

          <div>
            {loading && <div className="text-center p-6"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto"></div><p className='mt-3'>AI is thinking...</p></div>}
            {error && <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-center border border-red-700">{error}</div>}
            {!loading && !error && runs.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
            {runs.length > 0 && activeRun && (
              <div className="space-y-4">
                <div className="flex items-center border-b border-gray-700">
                    {runs.map((run, index) => (
                        <button key={run.id} onClick={() => setActiveRunIndex(index)} className={`px-4 py-2 text-sm font-medium transition ${activeRunIndex === index ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                            Run {index + 1}
                        </button>
                    ))}
                </div>
                <div className="flex justify-between items-center pt-2">
                    <div>
                        <h2 className='text-lg font-semibold text-green-400'>✅ Consolidated Results (Run {activeRunIndex + 1})</h2>
                        <p className="text-sm text-yellow-400 mt-1">⚠️ AI can make mistakes. Please review with human intelligence.</p>
                    </div>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!activeRun.openaiCases.length && !activeRun.geminiCases.length}>📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!activeRun.openaiCases.length && !activeRun.geminiCases.length}>📤 Export Excel</button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TestCaseColumn title="OpenAI Results" cases={activeRun.openaiCases} />
                    <TestCaseColumn title="Gemini Results" cases={activeRun.geminiCases} />
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