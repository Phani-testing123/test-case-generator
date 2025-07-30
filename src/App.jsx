import React, { useState } from 'react';
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
  const [scenarioCount, setScenarioCount] = useState(5);
  const [loginCredentials, setLoginCredentials] = useState('');
  const [selectedModels, setSelectedModels] = useState({ openai: true, gemini: false });
  const [countError, setCountError] = useState(null);

  // --- PARSING FUNCTION (GHERKIN ONLY) ---
  const parseAIOutput = (output) => {
    if (!output || !output.trim()) return { cases: [], summary: '' };

    let summary = '';
    let casesText = output;
    const summaryMatch = output.match(/coverage summary:/i);
    if (summaryMatch) {
        const summaryIndex = summaryMatch.index;
        casesText = output.substring(0, summaryIndex);
        summary = output.substring(summaryIndex).replace(/coverage summary:/i, '').trim();
    }

    const chunks = casesText.split(/Scenario:/im);
    const testCaseChunks = chunks.slice(1).map(chunk => "Scenario:" + chunk);

    if (testCaseChunks.length === 0 && casesText.trim()) {
      testCaseChunks.push(casesText);
    }

    const cases = testCaseChunks.map(textChunk => {
      const lines = textChunk.trim().split('\n').map(l => l.trim());
      let title = lines.shift() || 'Untitled';
      title = title.replace(/^(Scenario:)/i, '').trim();
      return {
        id: generateId(),
        title: title,
        lines: lines.filter(Boolean),
      };
    });
    return { cases, summary };
  };

  // --- GENERATION LOGIC ---
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
    const prompt = `${input}\n\n${personaText}Please generate ${scenarioCount} test cases in Gherkin format. After generating all scenarios, add a final section under the heading "Coverage Summary:" that briefly explains the scope and focus of the generated tests.`;

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
        newOpenaiData = parseAIOutput(responses[responseIndex]?.data?.output);
        responseIndex++;
      }
      if (selectedModels.gemini) {
        newGeminiData = parseAIOutput(responses[responseIndex]?.data?.output);
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

  // --- FORMATTING & UTILITY FUNCTIONS ---
  const formatCasesForDisplay = (cases) => {
    if (!cases || cases.length === 0) return '';
    return cases.map(tc => `Scenario: ${tc.title}\n${tc.lines.join('\n')}`)
                .join('\n\n=====================\n\n');
  };

  const openaiFormattedText = formatCasesForDisplay(openaiCases);
  const geminiFormattedText = formatCasesForDisplay(geminiCases);

  const exportToExcel = () => {
    const allCases = [...openaiCases, ...geminiCases];
    if (allCases.length === 0) {
      toast.error('No results to export.');
      return;
    }
    
    const dataForExport = allCases.map(tc => ({ 
      'Scenario Title': tc.title, 
      'BDD Steps': tc.lines.join('\n'),
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 60 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, 'ai_generated_test_cases.xlsx');
    toast.success('Exported to Excel!');
  };

  const copyToClipboard = () => {
    const textToCopy = [openaiFormattedText, geminiFormattedText].filter(Boolean).join('\n\n');
    if (!textToCopy) {
      toast.error('No results to copy.');
      return;
    }
    navigator.clipboard.writeText(textToCopy);
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
  
  // --- SUB-COMPONENT FOR RENDERING RESULTS ---
  const ResultsColumn = ({ title, formattedText, summary }) => {
    const modelKey = title.toLowerCase().includes('openai') ? 'openai' : 'gemini';
    if (!selectedModels[modelKey]) return null;

    if (!formattedText && !summary && !loading) {
        return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from {title.split(' ')[0]}.</div>
    }

    return (
      <div className='space-y-4'>
        <h3 className='text-center font-bold text-lg text-blue-300'>{title}</h3>
        {formattedText && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 h-[50vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">
                {formattedText}
              </pre>
            </div>
        )}
        {summary && (
            <div className="p-3 bg-gray-700/50 rounded-lg text-sm italic border border-gray-600">
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
                <input type="text" value={loginCredentials} onChange={e => setLoginCredentials(e.target.value)} placeholder="e.g., testuser@example.com" className="w-full bg-gray-700 p-2 rounded-md text-sm" />
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

            <div className="flex flex-wrap items-center justify-end gap-4 pt-4 border-t border-gray-700">
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
                    <ResultsColumn title="OpenAI Results" formattedText={openaiFormattedText} summary={openaiSummary} />
                    <ResultsColumn title="Gemini Results" formattedText={geminiFormattedText} summary={geminiSummary} />
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