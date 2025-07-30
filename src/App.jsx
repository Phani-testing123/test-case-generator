import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'react-hot-toast';

// Helper function to generate a unique ID
const generateId = () => `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const App = () => {
  // --- STATE MANAGEMENT ---
  const [input, setInput] = useState('');
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- NEW: ADVANCED OPTIONS STATE ---
  const [showGherkin, setShowGherkin] = useState(true);
  const [scenarioCount, setScenarioCount] = useState(5);
  const [userPersona, setUserPersona] = useState('');
  const [caseTypes, setCaseTypes] = useState({
    positive: true,
    negative: true,
    edge: true,
  });

  // --- NEW: SESSION PERSISTENCE HOOKS ---
  useEffect(() => {
    // Load state from localStorage on initial render
    const savedInput = localStorage.getItem('testCaseInput');
    const savedTestCases = localStorage.getItem('testCases');
    if (savedInput) setInput(savedInput);
    if (savedTestCases) setTestCases(JSON.parse(savedTestCases));
  }, []);

  useEffect(() => {
    // Save state to localStorage whenever it changes
    localStorage.setItem('testCaseInput', input);
    localStorage.setItem('testCases', JSON.stringify(testCases));
  }, [input, testCases]);


  // --- PARSING & GENERATION LOGIC ---
  const handleGenerate = async () => {
    if (!input.trim()) {
      toast.error('Please enter acceptance criteria first.');
      return;
    }
    setLoading(true);
    setError(null);
    setTestCases([]);

    const selectedTypes = Object.entries(caseTypes)
      .filter(([, isSelected]) => isSelected)
      .map(([type]) => type)
      .join(', ');

    const personaText = userPersona.trim() ? `For a user persona of "${userPersona.trim()}", ` : '';
    
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in ${showGherkin ? 'Gherkin format' : 'Normal plain text'}. Focus on the following types: ${selectedTypes || 'all'}. Ensure each test case has detailed steps.`;

    try {
      const response = await axios.post(
        'https://test-case-backend.onrender.com/generate-test-cases',
        { input: prompt }
      );

      const output = response.data.output;
      // ✅ FIXED LINE: Added 's &&' to prevent trim on undefined
      const scenarios = output.split(/Scenario:|^\d+\.\s*(Positive|Negative|Edge)\s+Test\s+Case:/im).filter(s => s && s.trim() !== '');
      
      const structuredTestCases = scenarios.map(scenarioText => {
        const lines = scenarioText.trim().split(/\r?\n/).map(l => l.trim());
        const title = lines.shift() || 'Untitled';
        const fullTitle = `Scenario: ${title}`;
        return {
          id: generateId(),
          title: fullTitle,
          lines: lines,
          status: 'pending', // 'pass', 'fail', 'skip'
          notes: ''
        };
      });
      setTestCases(structuredTestCases);
      toast.success('Test cases generated successfully!');

    } catch (err) {
      console.error('Error:', err);
      setError('❌ Failed to generate test cases. The service may be down. Please try again later.');
      toast.error('Generation failed.');
    } finally {
      setLoading(false);
    }
  };
  
  // --- NEW: HANDLERS FOR INTERACTIVE EXECUTION ---
  const handleStatusChange = (id, newStatus) => {
    setTestCases(prev =>
      prev.map(tc => (tc.id === id ? { ...tc, status: newStatus } : tc))
    );
  };
  
  const handleNotesChange = (id, newNotes) => {
    setTestCases(prev =>
      prev.map(tc => (tc.id === id ? { ...tc, notes: newNotes } : tc))
    );
  };

  // --- NEW: ENHANCED EXPORT & UTILITY FUNCTIONS ---
  const exportToExcel = () => {
    if (testCases.length === 0) return;
    
    // --- NEW: Map structured data to columns ---
    const dataForExport = testCases.map(tc => ({
      ID: tc.id,
      'Test Case': `${tc.title}\n${tc.lines.join('\n')}`,
      Status: tc.status.toUpperCase(),
      Notes: tc.notes
    }));
    
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    // Set column widths for better readability
    ws['!cols'] = [{ wch: 25 }, { wch: 60 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
    XLSX.writeFile(wb, 'test_case_execution_report.xlsx');
    toast.success('Exported to Excel successfully!');
  };

  const copyToClipboard = () => {
    if (testCases.length === 0) return;
    const textToCopy = testCases.map(tc => `${tc.title}\n${tc.lines.join('\n')}\n\n--- STATUS: ${tc.status.toUpperCase()} ---\nNOTES:\n${tc.notes}`).join('\n\n=====================\n\n');
    navigator.clipboard.writeText(textToCopy);
    toast.success('Results copied to clipboard!');
  };

  const clearAll = () => {
    setInput('');
    setTestCases([]);
    setError(null);
    toast('Cleared all data.', { icon: '🗑️' });
  }

  // --- RENDER LOGIC ---
  const statusStyles = {
    pending: 'border-gray-600',
    pass: 'border-green-500 bg-green-900/30',
    fail: 'border-red-500 bg-red-900/30',
    skip: 'border-yellow-500 bg-yellow-900/30',
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="min-h-screen bg-gray-900 text-white px-4 py-8 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-center gap-4">
            <img src="/bk-icon.png" alt="App Logo" className="h-12 w-12" />
            <h1 className="text-3xl sm:text-4xl font-bold text-center">Manual Tester's Co-Pilot</h1>
          </div>

          {/* Input & Controls */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
            <textarea
              className="w-full rounded-lg p-4 bg-gray-900 text-white text-sm sm:text-base resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Paste acceptance criteria or feature description here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            {/* --- NEW: Advanced Options Panel --- */}
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
            {!loading && !error && testCases.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
            {testCases.length > 0 && (
              <div className="space-y-4">
                {/* --- NEW: Result Header with Actions --- */}
                <div className="flex justify-between items-center">
                    <h2 className='font-semibold text-green-400'>✅ Review & Execute Test Cases</h2>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition">📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition">📤 Export Excel</button>
                    </div>
                </div>

                {/* --- NEW: Interactive Test Case Cards --- */}
                <div className="space-y-4">
                  {testCases.map((tc) => (
                    <div key={tc.id} className={`bg-gray-800/50 border rounded-lg p-4 space-y-3 transition ${statusStyles[tc.status]}`}>
                      <p className="font-bold text-blue-300">{tc.title}</p>
                      <div className="whitespace-pre-wrap text-sm text-gray-300 pl-4 border-l-2 border-gray-600">
                        {tc.lines.join('\n')}
                      </div>
                      <div className="pt-3 border-t border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        {/* Status Buttons */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-400">Status:</span>
                          {['pass', 'fail', 'skip', 'pending'].map(status => (
                            <button key={status} onClick={() => handleStatusChange(tc.id, status)} className={`px-3 py-1 text-xs rounded-full capitalize transition ${tc.status === status ? `bg-${status === 'pass' ? 'green' : status === 'fail' ? 'red' : status === 'skip' ? 'yellow' : 'gray'}-500 text-white font-bold` : 'bg-gray-700 hover:bg-gray-600'}`}>
                              {status}
                            </button>
                          ))}
                        </div>
                        {/* Notes Textarea */}
                        <textarea
                          placeholder="Add execution notes or bug ID..."
                          value={tc.notes}
                          onChange={(e) => handleNotesChange(tc.id, e.target.value)}
                          className="w-full bg-gray-700 text-sm p-2 rounded-md resize-y min-h-[40px] focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
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