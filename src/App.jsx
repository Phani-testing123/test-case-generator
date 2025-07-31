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
  const [claudeCases, setClaudeCases] = useState([]);
  const [openaiSummary, setOpenaiSummary] = useState('');
  const [geminiSummary, setGeminiSummary] = useState('');
  const [claudeSummary, setClaudeSummary] = useState('');
  const [scenarioCount, setScenarioCount] = useState(5);
  const [loginCredentials, setLoginCredentials] = useState('');
  const [selectedModels, setSelectedModels] = useState({ openai: true, gemini: false, claude: false });
  const [countError, setCountError] = useState(null);

  // --- PARSING FUNCTION (GHERKIN ONLY) ---
  const parseAIOutput = (output) => {
    if (!output || !output.trim()) return { cases: [], summary: '' };

    let summary = '';
    let casesText = output;
    // Find and extract the coverage summary
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
      
      const priorityMatch = textChunk.match(/Priority:\s*(High|Medium|Low)/i);
      const bddLines = lines.filter(line => !line.match(/Priority:/i));

      return {
        id: generateId(),
        title: title,
        lines: bddLines.filter(Boolean),
        priority: priorityMatch ? priorityMatch[1] : 'N/A',
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
    if (!selectedModels.openai && !selectedModels.gemini && !selectedModels.claude) {
      toast.error('Please select at least one AI model.');
      return;
    }
    setLoading(true);
    setError(null);

    const personaText = loginCredentials.trim() ? `For a user with login credentials "${loginCredentials.trim()}", ` : '';
    
    // ✅ UPDATED PROMPT: Asks for a descriptive coverage summary
    const prompt = `You are an expert QA Engineer. Your task is to generate precise Gherkin scenarios.

**Requirement:**
${input}

${personaText}Please generate ${scenarioCount} test cases.

**CRITICAL FORMATTING RULES:**
1. Each scenario MUST start with "Scenario: [Title]".
2. After the Gherkin steps of each scenario, add "Priority: [High, Medium, or Low]".
3. After generating ALL scenarios, add a final section under the heading "Coverage Summary:". This summary MUST be a descriptive paragraph explaining what types of scenarios (e.g., positive, negative, edge cases) were covered. It MUST NOT be a simple count.
4. You MUST NOT use any markdown formatting (like **).`;

    try {
      const apiCalls = [];
      const modelNames = []; 

      if (selectedModels.openai) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: prompt }));
        modelNames.push('OpenAI');
      }
      if (selectedModels.gemini) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-gemini-test-cases', { input: prompt }));
        modelNames.push('Gemini');
      }
      if (selectedModels.claude) {
        apiCalls.push(axios.post('https://test-case-backend.onrender.com/generate-claude-test-cases', { input: prompt }));
        modelNames.push('Claude');
      }

      const results = await Promise.allSettled(apiCalls);

      let newOpenaiData = { cases: [], summary: '' };
      let newGeminiData = { cases: [], summary: '' };
      let newClaudeData = { cases: [], summary: '' };
      const failedModels = [];

      results.forEach((result, index) => {
        const modelName = modelNames[index];
        if (result.status === 'fulfilled') {
          const parsedData = parseAIOutput(result.value?.data?.output);
          if (modelName === 'OpenAI') newOpenaiData = parsedData;
          else if (modelName === 'Gemini') newGeminiData = parsedData;
          else if (modelName === 'Claude') newClaudeData = parsedData;
        } else {
          console.error(`Error from ${modelName}:`, result.reason);
          failedModels.push(modelName);
        }
      });

      setOpenaiCases(newOpenaiData.cases);
      setGeminiCases(newGeminiData.cases);
      setClaudeCases(newClaudeData.cases);
      setOpenaiSummary(newOpenaiData.summary);
      setGeminiSummary(newGeminiData.summary);
      setClaudeSummary(newClaudeData.summary);

      if (failedModels.length > 0) {
        const errorMessage = `❌ ${failedModels.join(' & ')} failed to generate results. Please try unchecking it or check your backend service.`;
        setError(errorMessage);
        toast.error(`${failedModels.join(' & ')} failed to generate.`);
      } else {
        toast.success('Test cases generated!');
      }
      
    } catch (err) {
      console.error('Generic Error:', err);
      setError('❌ An unexpected network error occurred. Please check the console.');
      toast.error('An unexpected network error occurred.');
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

  const exportToExcel = () => {
    const allCases = [...openaiCases, ...geminiCases, ...claudeCases];
    if (allCases.length === 0) {
      toast.error('No results to export.');
      return;
    }
    
    const dataForExport = allCases.map(tc => ({ 
      'Scenario Title': tc.title, 
      'BDD Steps': tc.lines.join('\n'),
      'Priority': tc.priority,
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, 'ai_generated_test_cases.xlsx');
    toast.success('Exported to Excel!');
  };

  const copyToClipboard = () => {
    const allCases = [...openaiCases, ...geminiCases, ...claudeCases];
    if (allCases.length === 0) {
      toast.error('No results to copy.');
      return;
    }
    
    const textToCopy = allCases.map(tc => {
        let text = `Scenario: ${tc.title}\n${tc.lines.join('\n')}`;
        text += `\nPriority: ${tc.priority}`;
        return text;
    }).join('\n\n=====================\n\n');

    navigator.clipboard.writeText(textToCopy.trim());
    toast.success('Results copied!');
  };

  const clearAll = () => {
    setInput('');
    setOpenaiCases([]);
    setGeminiCases([]);
    setClaudeCases([]);
    setOpenaiSummary('');
    setGeminiSummary('');
    setClaudeSummary('');
    setError(null);
    setLoginCredentials('');
    setScenarioCount(5);
    setSelectedModels({ openai: true, gemini: false, claude: false });
    setCountError(null);
    toast('Cleared all data.', { icon: '🗑️' });
  };
  
  // --- SUB-COMPONENT FOR RENDERING RESULTS ---
  const ResultsColumn = ({ title, cases, summary }) => {
    const modelKey = title.toLowerCase().includes('openai') ? 'openai' : title.toLowerCase().includes('gemini') ? 'gemini' : 'claude';
    if (!selectedModels[modelKey]) return null;

    if (cases.length === 0 && !loading) {
        return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from {title.split(' ')[0]}.</div>
    }

    const priorityColor = {
        High: 'bg-red-500/20 text-red-300 border-red-500/30',
        Medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        Low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        'N/A': 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    };

    return (
      <div className='space-y-4'>
        <h3 className='text-center font-bold text-lg text-blue-300'>{title}</h3>
        {cases.map((tc) => (
          <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
            <p className="font-bold text-gray-200">{tc.title}</p>
            <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3 border-t border-gray-700">{tc.lines.join('\n')}</div>
            
            <div className="pt-3 border-t border-gray-700 flex items-center gap-4 text-xs">
                <div className={`px-2 py-1 rounded-full border ${priorityColor[tc.priority]}`}>
                    <strong>Priority:</strong> {tc.priority}
                </div>
            </div>
          </div>
        ))}
        {/* ✅ NEW: Display the coverage summary */}
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
        <div className="max-w-screen-xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-center">AI Test Case Generator</h1>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
            <textarea
              className="w-full rounded-lg p-4 bg-gray-900 text-white text-sm sm:text-base resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Paste acceptance criteria or feature description here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 items-start'>
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
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={selectedModels.claude} onChange={() => setSelectedModels(prev => ({...prev, claude: !prev.claude}))} className="accent-blue-500 h-4 w-4" />
                      Claude
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
            {!loading && !error && openaiCases.length === 0 && geminiCases.length === 0 && claudeCases.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            
            {(openaiCases.length > 0 || geminiCases.length > 0 || claudeCases.length > 0) && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pt-2">
                    <h2 className='text-lg font-semibold text-green-400'>✅ Consolidated Results</h2>
                    <div className='flex gap-3'>
                        <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!openaiCases.length && !geminiCases.length && !claudeCases.length}>📋 Copy</button>
                        <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!openaiCases.length && !geminiCases.length && !claudeCases.length}>📤 Export Excel</button>
                    </div>
                </div>

                <div className="p-3 rounded-md bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-base font-medium text-center">
                  ⚠️ AI can make mistakes. Please review with human intelligence.
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ResultsColumn title="OpenAI Results" cases={openaiCases} summary={openaiSummary} />
                    <ResultsColumn title="Gemini Results" cases={geminiCases} summary={geminiSummary} />
                    <ResultsColumn title="Claude Results" cases={claudeCases} summary={claudeSummary} />
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