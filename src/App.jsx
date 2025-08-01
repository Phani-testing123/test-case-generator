import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

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
  const [exploratoryIdeas, setExploratoryIdeas] = useState('');

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
    setExploratoryIdeas('');

    const personaText = loginCredentials.trim() ? `For a user with login credentials "${loginCredentials.trim()}", ` : '';

    const prompt = `You are an expert QA Engineer. Your task is to generate precise Gherkin scenarios.\n\n**Requirement:**\n${input}\n\n${personaText}Please generate ${scenarioCount} test cases.\n\n**CRITICAL FORMATTING RULES:**\n1. Each scenario MUST start with "Scenario: [Title]".\n2. After the Gherkin steps of each scenario, add "Priority: [High, Medium, or Low]".\n3. After generating ALL scenarios, add a final section under the heading "Coverage Summary:". This summary MUST be a descriptive paragraph explaining what types of scenarios (e.g., positive, negative, edge cases) were covered. It MUST NOT be a simple count.\n4. You MUST NOT use any markdown formatting (like **).`;

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

      // Add Exploratory Ideas call
      const exploratoryPrompt = `You are an expert in exploratory testing. Based on the following feature or module, provide 5 exploratory testing ideas that uncover hidden bugs, usability issues, or workflow inefficiencies. Be creative and cover edge behaviors.\n\nFeature/Module: ${input}`;
      const exploratoryCall = axios.post('https://test-case-backend.onrender.com/generate-test-cases', { input: exploratoryPrompt });

      const [exploratoryResult, ...results] = await Promise.allSettled([exploratoryCall, ...apiCalls]);

      let newOpenaiData = { cases: [], summary: '' };
      let newGeminiData = { cases: [], summary: '' };
      let newClaudeData = { cases: [], summary: '' };
      const failedModels = [];

      if (exploratoryResult.status === 'fulfilled') {
        setExploratoryIdeas(exploratoryResult.value?.data?.output || '');
      } else {
        console.error('Exploratory ideas generation failed:', exploratoryResult.reason);
      }

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

  // ... rest of the unchanged component code
};

export default App;