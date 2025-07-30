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

  // --- PARSING FUNCTION (REUSABLE & SIMPLIFIED FOR GHERKIN) ---
  const parseAIOutput = (output) => {
    if (!output || !output.trim()) return [];

    const chunks = output.split(/Scenario:/im);
    const scenarios = chunks.slice(1).map(chunk => "Scenario:" + chunk);

    if (scenarios.length === 0 && output.trim()) {
      scenarios.push(output); // Fallback
    }

    return scenarios.map(scenarioText => {
      const lines = scenarioText.trim().split('\n').map(l => l.trim());
      let title = lines.shift() || 'Untitled';
      title = title.replace(/^(Scenario:)/i, '').trim();
      
      return {
        id: generateId(),
        title: title,
        lines: lines.filter(Boolean),
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

    const personaText = userPersona.trim() ? `For a user persona of "${userPersona.trim()}", ` : '';
    // ✅ PROMPT SIMPLIFIED: Always requests Gherkin format
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in Gherkin format. Generate a comprehensive set of test cases covering all possible combinations, including positive, negative, and edge-case scenarios.`;

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
        openaiCases = parseAIOutput(responses[responseIndex]?.data?.output);
        responseIndex++;
      }
      if (selectedModels.gemini) {
        geminiCases = parseAIOutput(responses[responseIndex]?.data?.output);
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
      
      const allNewCases = [...openaiCases, ...geminiCases];
      const initialExpansionState = allNewCases.reduce((acc, tc) => {
        acc[tc.id] = true;
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
            'Scenario Title': tc.title, 
            'Steps': tc.lines.join('\n'), 
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 60 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    if (activeRun.openaiCases.length > 0) {
        createSheet(activeRun.openaiCases, "OpenAI Results");
    }

    if (activeRun.geminiCases.length > 0) {
        createSheet(activeRun.geminiCases, "Gemini Results");
    }

    XLSX.writeFile(wb, 'gherkin_scenarios.xlsx');
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
            const title = `Scenario: ${tc.title}`;
            const steps = tc.lines.join('\n');
            return `${title}\n${steps}`;
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
              <div className="px-4 pb-4 border-t border-gray-700">
                <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3">{tc.lines.join('\n')}</div>
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
                <label className="block text-sm font-medium text-gray-400 mb-1">User Persona (Optional)</label>
                <input type="text" value={userPersona} onChange={e => setUserPersona(e.target.value)} placeholder="e.g., an admin user" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Case Count</label>
                 <input type="number" value={scenarioCount} onChange={(e) => setScenarioCount(Number(e.target.value))} min="1" max="20" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
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
                {/* ✅ Gherkin Toggle Removed */}
                <div></div>
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
            {!loading && !error && (!runs.length || (!activeRun.openaiCases.length && !activeRun.geminiCases.length)) && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
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
                    <h2 className='text-lg font-semibold text-green-400'>✅ Consolidated Results (Run {activeRunIndex + 1})</h2>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!activeRun.openaiCases.length && !activeRun.geminiCases.length}>📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!activeRun.openaiCases.length && !activeRun.geminiCases.length}>📤 Export Excel</button>
                    </div>
                </div>

                <div className="p-3 rounded-md bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-base font-medium text-center">
                  ⚠️ AI can make mistakes. Please review with human intelligence.
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