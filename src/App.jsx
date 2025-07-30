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
  const [expandedIds, setExpandedIds] = useState([]);

  // --- ADVANCED OPTIONS STATE ---
  const [showGherkin, setShowGherkin] = useState(true);
  const [scenarioCount, setScenarioCount] = useState(5);
  const [userPersona, setUserPersona] = useState('');
  const [caseTypes, setCaseTypes] = useState({ positive: true, negative: true, edge: true });

  // --- DERIVED STATE ---
  const activeTestCases = runs[activeRunIndex]?.testCases || [];

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

  // --- GENERATION & PARSING LOGIC ---
  const handleGenerate = async () => {
    if (!input.trim()) {
      toast.error('Please enter acceptance criteria first.');
      return;
    }
    setLoading(true);
    setError(null);

    const selectedTypes = Object.entries(caseTypes).filter(([, isSelected]) => isSelected).map(([type]) => type).join(', ');
    const personaText = userPersona.trim() ? `For a user persona of "${userPersona.trim()}", ` : '';
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in ${showGherkin ? 'Gherkin format' : 'plain text format'}. Focus on the following types: ${selectedTypes || 'all'}. Ensure each test case has detailed steps.`;

    try {
      const response = await axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: prompt });
      const output = response.data.output;
      const scenarios = output.split(/Scenario:|^\d+\.\s*(Positive|Negative|Edge)\s+Test\s+Case:/im).filter(s => s && s.trim() !== '');

      const structuredTestCases = scenarios.map(scenarioText => {
        const lines = scenarioText.trim().split(/\r?\n/).map(l => l.trim());
        let rawTitle = lines.shift() || 'Untitled';
        let cleanTitle = rawTitle.replace(/(Scenario:)?\s*\d+\.\s*Test\s+Case:\s*/i, '').trim();
        return {
          id: generateId(),
          title: cleanTitle,
          lines: lines,
        };
      });

      const newRun = {
        id: `run_${Date.now()}`,
        testCases: structuredTestCases,
      };
      const newRuns = [...runs, newRun];
      setRuns(newRuns);
      setActiveRunIndex(newRuns.length - 1);
      setExpandedIds(structuredTestCases.map(tc => tc.id));
      toast.success('New test run generated!');
    } catch (err) {
      console.error('Error:', err);
      setError('❌ Failed to generate test cases.');
      toast.error('Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // --- UI INTERACTION HANDLER ---
  const toggleExpand = (id) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(expId => expId !== id) : [...prev, id]
    );
  };

  // --- UTILITY FUNCTIONS ---
  const exportToExcel = () => {
    if (activeTestCases.length === 0) return;
    const dataForExport = activeTestCases.map(tc => ({
      'Test Case Title': tc.title,
      'Steps': tc.lines.join('\n')
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 60 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
    XLSX.writeFile(wb, 'generated_test_cases.xlsx');
    toast.success('Exported to Excel!');
  };

  const copyToClipboard = () => {
    if (activeTestCases.length === 0) return;
    const textToCopy = activeTestCases.map(tc => `${tc.title}\n${tc.lines.join('\n')}`).join('\n\n=====================\n\n');
    navigator.clipboard.writeText(textToCopy);
    toast.success('Results copied!');
  };

  const clearAll = () => {
    setInput('');
    setRuns([]);
    setError(null);
    setActiveRunIndex(0);
    toast('Cleared all data.', { icon: '🗑️' });
  };
  
  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="min-h-screen bg-gray-900 text-white px-4 py-8 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-center gap-4">
            <img src="/bk-icon.png" alt="App Logo" className="h-12 w-12" />
            <h1 className="text-3xl sm:text-4xl font-bold text-center">AI Test Case Generator</h1>
          </div>

          {/* Input & Controls */}
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
                <label className="block text-sm font-medium text-gray-400 mb-1">Case Types</label>
                <div className="flex items-center justify-around bg-gray-700 p-2 rounded-md text-sm h-full">
                  {Object.keys(caseTypes).map(type => (
                    <label key={type} className="flex items-center gap-1.5 cursor-pointer capitalize">
                      <input type="checkbox" checked={caseTypes[type]} onChange={() => setCaseTypes(prev => ({ ...prev, [type]: !prev[type] }))} className="accent-blue-500 h-4 w-4" />
                      {type}
                    </label>
                  ))}
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

          {/* Results Area */}
          <div>
            {loading && <div className="text-center p-6"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto"></div><p className='mt-3'>AI is thinking...</p></div>}
            {error && <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-center border border-red-700">{error}</div>}
            {!loading && !error && runs.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
            {runs.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center border-b border-gray-700">
                    {runs.map((run, index) => (
                        <button key={run.id} onClick={() => setActiveRunIndex(index)} className={`px-4 py-2 text-sm font-medium transition ${activeRunIndex === index ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                            Run {index + 1}
                        </button>
                    ))}
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <h2 className='font-semibold text-green-400'>✅ Generated Test Cases (Run {activeRunIndex + 1})</h2>
                    {/* --- NEW: Warning Message --- */}
                    <p className="text-xs text-yellow-400 mt-1">⚠️ AI can make mistakes. Please review with human intelligence.</p>
                  </div>
                  <div className='flex gap-3'>
                      <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition">📋 Copy</button>
                      <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition">📤 Export Excel</button>
                  </div>
                </div>

                <div className="space-y-4">
                  {activeTestCases.map((tc) => (
                    <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg transition">
                      <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => toggleExpand(tc.id)}>
                        <p className="font-bold text-blue-300">{tc.title}</p>
                        <span className={`transform transition-transform ${expandedIds.includes(tc.id) ? 'rotate-180' : ''}`}>▼</span>
                      </div>

                      {expandedIds.includes(tc.id) && (
                        <div className="px-4 pb-4 border-t border-gray-700">
                          <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3">
                            {tc.lines.join('\n')}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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