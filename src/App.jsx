import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'react-hot-toast';

// Helper function to generate a unique ID
const generateId = () => `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- NEW: Template Data ---
const templates = {
  login: "Feature: User login with email and password. It should have validation for incorrect credentials, empty fields, and a 'Forgot Password' link.",
  search: "Feature: A search bar with a filter dropdown. The search should handle no results found, partial matches, and filtering by category.",
  profile: "Feature: A user profile page where a user can update their name, profile picture, and bio. All fields should have validation.",
};

const App = () => {
  // --- STATE MANAGEMENT ---
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- NEW: History and Active State ---
  const [runs, setRuns] = useState([]);
  const [activeRunIndex, setActiveRunIndex] = useState(0);

  // --- NEW: Interactive UI State ---
  const [expandedIds, setExpandedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // --- ADVANCED OPTIONS STATE ---
  const [showGherkin, setShowGherkin] = useState(true);
  const [scenarioCount, setScenarioCount] = useState(5);
  const [userPersona, setUserPersona] = useState('');
  const [caseTypes, setCaseTypes] = useState({ positive: true, negative: true, edge: true });

  // --- DERIVED STATE: Get test cases for the active run ---
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
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases...`;

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
          title: `Scenario: ${cleanTitle}`,
          lines: lines,
        };
      });

      // --- NEW: Add a new run to history ---
      const newRun = {
        id: `run_${Date.now()}`,
        testCases: structuredTestCases,
        prompt: input, // Save the prompt for context
      };
      const newRuns = [...runs, newRun];
      setRuns(newRuns);
      setActiveRunIndex(newRuns.length - 1); // Switch to the new tab
      setExpandedIds(structuredTestCases.map(tc => tc.id)); // Expand all by default
      toast.success('New test run generated!');
    } catch (err) {
      console.error('Error:', err);
      setError('❌ Failed to generate test cases.');
      toast.error('Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // --- NEW: INTERACTIVE HANDLERS ---
  const toggleExpand = (id) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(expId => expId !== id) : [...prev, id]
    );
  };

  const deleteTestCase = (idToDelete) => {
    const updatedRuns = runs.map((run, index) => {
      if (index === activeRunIndex) {
        return {
          ...run,
          testCases: run.testCases.filter(tc => tc.id !== idToDelete),
        };
      }
      return run;
    });
    setRuns(updatedRuns);
    toast.error('Test case deleted.');
  };

  const handleEdit = (testCase) => {
    setEditingId(testCase.id);
    setEditingText(testCase.lines.join('\n'));
  };

  const saveEdit = () => {
    const updatedRuns = runs.map((run, index) => {
      if (index === activeRunIndex) {
        return {
          ...run,
          testCases: run.testCases.map(tc =>
            tc.id === editingId ? { ...tc, lines: editingText.split('\n') } : tc
          ),
        };
      }
      return run;
    });
    setRuns(updatedRuns);
    setEditingId(null);
    setEditingText('');
    toast.success('Test case updated!');
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
             {/* --- NEW: Templates --- */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-400">Start with a template:</span>
              {Object.entries(templates).map(([key, text]) => (
                <button key={key} onClick={() => setInput(text)} className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1 rounded-full capitalize transition">{key}</button>
              ))}
            </div>

            <textarea
              className="w-full rounded-lg p-4 bg-gray-900 text-white text-sm sm:text-base resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Paste acceptance criteria or start with a template..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            {/* Advanced Options */}
             <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Login Credentials(Optional)</label>
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

            {/* Action Buttons */}
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
                {/* --- NEW: History Tabs --- */}
                <div className="flex items-center border-b border-gray-700">
                    {runs.map((run, index) => (
                        <button key={run.id} onClick={() => setActiveRunIndex(index)} className={`px-4 py-2 text-sm font-medium transition ${activeRunIndex === index ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                            Run {index + 1}
                        </button>
                    ))}
                </div>

                <div className="flex justify-between items-center">
                    <h2 className='font-semibold text-green-400'>✅ Generated Test Cases (Run {activeRunIndex + 1})</h2>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition">📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition">📤 Export Excel</button>
                    </div>
                </div>

                {/* --- NEW: Interactive Test Case Cards with Accordion & Editing --- */}
                <div className="space-y-4">
                  {activeTestCases.map((tc) => (
                    <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg transition">
                      {/* Accordion Header */}
                      <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => toggleExpand(tc.id)}>
                        <p className="font-bold text-blue-300">{tc.title}</p>
                        <span className={`transform transition-transform ${expandedIds.includes(tc.id) ? 'rotate-180' : ''}`}>▼</span>
                      </div>

                      {/* Accordion Body */}
                      {expandedIds.includes(tc.id) && (
                        <div className="px-4 pb-4 border-t border-gray-700 space-y-3">
                          {editingId === tc.id ? (
                            // Edit Mode
                            <div className='space-y-2 pt-3'>
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full bg-gray-900 text-sm p-2 rounded-md resize-y min-h-[100px] focus:ring-1 focus:ring-blue-400"
                              />
                              <div className='flex gap-2'>
                                <button onClick={saveEdit} className="bg-green-600 hover:bg-green-700 text-xs px-3 py-1 rounded">Save</button>
                                <button onClick={() => setEditingId(null)} className="bg-gray-600 hover:bg-gray-500 text-xs px-3 py-1 rounded">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            // View Mode
                            <>
                              <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3">
                                {tc.lines.join('\n')}
                              </div>
                               <div className='flex items-center gap-2 pt-3 border-t border-gray-700/50'>
                                <button onClick={() => handleEdit(tc)} className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1 rounded transition">✏️ Edit</button>
                                <button onClick={() => deleteTestCase(tc.id)} className="bg-red-900/50 hover:bg-red-800/50 text-xs px-3 py-1 rounded transition">🗑️ Delete</button>
                              </div>
                            </>
                          )}
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