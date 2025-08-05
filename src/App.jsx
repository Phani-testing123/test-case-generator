import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { exportAllPlaywright } from './utils/gherkinToPlaywright';
import { exportAllAsFeatureFile, generateFeatureName } from './utils/exportFeatureFile';
import { gherkinToWebdriverIO,exportAllWebdriverIO } from './utils/exportWebdriverIO';
import { scenarioToFeature } from './utils/exportFeatureFile';
import SignupAgent from "./components/SignupAgent";

// Helper functions
const generateId = () => `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateStepId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
const autoTag = (lines) => {
  const joined = lines.join(' ').toLowerCase();
  if (/fail|error|invalid|incorrect/.test(joined)) return 'Negative';
  if (/edge|boundary|limit|empty|null/.test(joined)) return 'Edge';
  return 'Positive';
};


// Steps Library
const StepsLibrary = ({ steps, setSteps }) => {
  const [editingStep, setEditingStep] = useState(null);
  const [stepText, setStepText] = useState('');
  const handleAdd = () => {
    if (!stepText.trim()) return;
    setSteps(prev => [...prev, { id: generateStepId(), text: stepText }]);
    setStepText('');
  };
  const handleUpdate = () => {
    setSteps(prev => prev.map(s => s.id === editingStep.id ? {...s, text: stepText} : s));
    setEditingStep(null);
    setStepText('');
  };
  const handleEdit = (step) => {
    setEditingStep(step);
    setStepText(step.text);
  };
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 mb-4">
      <h3 className="font-semibold text-blue-400 mb-2">🔗 Reusable Test Steps Library</h3>
      <div className="flex gap-2 mb-2">
        <input
          value={stepText}
          onChange={e => setStepText(e.target.value)}
          placeholder="e.g. Given the user is logged in"
          className="bg-gray-900 border border-gray-600 text-white p-2 rounded flex-1"
        />
        {editingStep ? (
          <button onClick={handleUpdate} className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded">Update</button>
        ) : (
          <button onClick={handleAdd} className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded">Add</button>
        )}
      </div>
      <ul className="space-y-2">
        {steps.map(step => (
          <li key={step.id} className="flex items-center gap-2">
            <span className="flex-1 text-gray-200">{step.text}</span>
            <button className="bg-yellow-700 hover:bg-yellow-800 px-2 py-0.5 text-xs rounded" onClick={() => handleEdit(step)}>Edit</button>
            <button className="bg-red-700 hover:bg-red-800 px-2 py-0.5 text-xs rounded" onClick={() => setSteps(prev => prev.filter(s => s.id !== step.id))}>Delete</button>
          </li>
        ))}
        {steps.length === 0 && <li className="text-gray-500">No reusable steps added.</li>}
      </ul>
    </div>
  );
};

// Insert Step Modal
const InsertStepModal = ({ open, onClose, library, scenarioLines = [], onInsert }) => {
  const [selectedStep, setSelectedStep] = useState(library[0]?.text || '');
  const [afterIdx, setAfterIdx] = useState(-1);
  useEffect(() => {
    setSelectedStep(library[0]?.text || '');
    setAfterIdx(-1);
  }, [open, library, scenarioLines.length]);
  if (!open || !library.length) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-blue-300">Insert Reusable Step</h2>
        <div className="mb-3">
          <label className="block mb-1 text-gray-400">Step</label>
          <select className="w-full p-2 bg-gray-800 text-white rounded"
            value={selectedStep}
            onChange={e => setSelectedStep(e.target.value)}
          >
            {library.map(step => <option key={step.id} value={step.text}>{step.text}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="block mb-1 text-gray-400">Insert After Step</label>
          <select className="w-full p-2 bg-gray-800 text-white rounded"
            value={afterIdx}
            onChange={e => setAfterIdx(Number(e.target.value))}
          >
            <option value={-1}>Before first step (top)</option>
            {scenarioLines.map((line, idx) =>
              <option key={idx} value={idx}>
                After Step {idx + 1}: {line}
              </option>
            )}
          </select>
        </div>
        <div className="flex justify-between">
          <button
            className="bg-green-700 hover:bg-green-800 px-4 py-2 rounded"
            onClick={() => {
              if (selectedStep) onInsert(selectedStep, afterIdx);
              onClose();
            }}>
            Insert
          </button>
          <button className="bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Bug Modal
const getBugTemplate = (scenario) => {
  if (!scenario) return '';
  const steps = scenario.lines.join('\n');
  const expectedStep = scenario.lines.filter(line => /^Then |^And /.test(line)).pop() || '';
  return (
`Title: [BUG] ${scenario.title}

Steps to Reproduce:
${steps}

Expected Result:
${expectedStep.replace(/^Then |^And /, '')}

Actual Result:
[Describe what actually happened...]

Attachments/Comments:
[Optional]
`
  );
};
const BugModal = ({ open, onClose, scenario }) => {
  const [bugText, setBugText] = useState('');
    const [envText, setEnvText] = useState('');
  const [browserText, setBrowserText] = useState('');
  useEffect(() => { if (scenario) setBugText(getBugTemplate(scenario)); }, [scenario]);
  if (!open || !scenario) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4 text-yellow-300">🪲 Bug Report Template</h2>
      <div className="mb-3">
      <label className="block text-gray-300 mb-1">Environment</label>
      <input
      type="text"
      value={envText}
      onChange={e => setEnvText(e.target.value)}
      placeholder="e.g. DEV, STG, PROD"
      className="w-full bg-gray-800 text-white p-2 rounded"
     />
    </div>
    <div className="mb-3">
    <label className="block text-gray-300 mb-1">Browser/Device</label>
    <input
    type="text"
    value={browserText}
    onChange={e => setBrowserText(e.target.value)}
    placeholder="e.g. Chrome, iOS, Android"
    className="w-full bg-gray-800 text-white p-2 rounded"
   />
   </div>
        <textarea
          value={bugText}
          onChange={e => setBugText(e.target.value)}
          rows={10}
          className="w-full p-3 rounded bg-gray-800 text-gray-200 mb-3"
        />
        <div className="flex justify-between">
        <button
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
        onClick={() => {
        const bugWithMeta =
       `Environment: ${envText || '[Fill in]'}
        Browser/Device: ${browserText || '[Fill in]'}
        Title: ${bugText.split('\n')[0] || '[Fill in]'}
       ${bugText.includes('\n') ? bugText.substring(bugText.indexOf('\n')) : ''}`;
       navigator.clipboard.writeText(bugWithMeta);
      toast.success('Copied!');
    }}
>
  Copy
</button>
<button className="bg-slate-800 hover:bg-slate-900 px-4 py-2 rounded text-white font-semibold shadow" onClick={onClose}>
Close
</button>
        </div>
      </div>
    </div>
  );
};
// ResultsColumn, CoverageIndicator remain unchanged from your last working version, pasted fully:
const ResultsColumn = ({
  title, cases, summary, selectedModels, loading, onReportBug,
  stepsLibrary,onGeneratePlaywrightAI
}) => {
  const [editableIdx, setEditableIdx] = useState(null);
  const [linesEdit, setLinesEdit] = useState([]);
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [insertModalIdx, setInsertModalIdx] = useState(null);

  const handleEditClick = (idx, tc) => {
    setEditableIdx(idx);
    setLinesEdit(tc.lines);
  };
  const handleSaveEdit = (idx) => {
    cases[idx].lines = linesEdit.slice();
    setEditableIdx(null);
    toast.success('Steps updated!');
  };

  const handleInsertStep = (step, afterIdx) => {
    if (insertModalIdx === null) return;
    let caseLines = [...cases[insertModalIdx].lines];
    if (afterIdx === -1) caseLines = [step, ...caseLines];
    else caseLines = [
      ...caseLines.slice(0, afterIdx + 1),
      step,
      ...caseLines.slice(afterIdx + 1)
    ];
    cases[insertModalIdx].lines = caseLines;
    setInsertModalIdx(null);
    setInsertModalOpen(false);
    setEditableIdx(null);
    toast.success('Reusable step inserted!');
  };

  const modelKey = title.toLowerCase().includes('openai') ? 'openai' : title.toLowerCase().includes('gemini') ? 'gemini' : 'claude';
  if (!selectedModels[modelKey]) return null;
  if (cases.length === 0 && !loading) {
    return <div className='text-center text-gray-500 p-4 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg'>No results from {title.split(' ')[0]}.</div>;
  }
  const priorityColor = {
    High: 'bg-red-500/20 text-red-300 border-red-500/30',
    Medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    Low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'N/A': 'bg-gray-500/20 text-gray-300 border-gray-500/30'
  };
  const typeColor = {
    Positive: 'bg-green-500/20 text-green-300 border-green-500/30',
    Negative: 'bg-red-500/20 text-red-300 border-red-500/30',
    Edge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  };

  return (
    <div className='space-y-4'>
      <h3 className='text-center font-bold text-lg text-blue-300'>{title}</h3>
      {cases.map((tc, idx) => {
        const scenarioType = autoTag(tc.lines);
        return (
          <div key={tc.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
            <p className="font-bold text-gray-200">{tc.title}</p>
            {editableIdx === idx ? (
              <div>
                <ul>
                  {linesEdit.map((line, i) => (
                    <li key={i}>
                      <input
                        value={line}
                        onChange={e => setLinesEdit(linesEdit.map((l, idx2) => idx2 === i ? e.target.value : l))}
                        className="bg-gray-900 border border-gray-600 text-white p-1 rounded my-1 w-full"
                      />
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 mt-2">
                  <button className="bg-green-700 hover:bg-green-800 px-3 py-1 text-xs rounded" onClick={() => handleSaveEdit(idx)}>Save</button>
                  <button className="bg-gray-700 hover:bg-gray-800 px-3 py-1 text-xs rounded" onClick={() => setEditableIdx(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-300 pt-3 border-t border-gray-700">{tc.lines.join('\n')}</div>
            )}
            <div className="pt-3 border-t border-gray-700 flex flex-wrap items-center gap-3 text-xs">
              <div className={`px-2 py-1 rounded-full border ${typeColor[scenarioType]}`}>
                <strong>Type:</strong> {scenarioType}
              </div>
              <div className={`px-2 py-1 rounded-full border ${priorityColor[tc.priority]}`}>
                <strong>Priority:</strong> {tc.priority}
              </div>
              <button
                className="bg-yellow-700 hover:bg-yellow-800 px-3 py-1 text-xs rounded"
                onClick={() => handleEditClick(idx, tc)}
              >Edit Steps</button>
              <button
                className="bg-blue-700 hover:bg-blue-800 px-3 py-1 text-xs rounded"
                onClick={() => { setInsertModalIdx(idx); setInsertModalOpen(true); }}
                disabled={!stepsLibrary.length}
              >Insert Step</button>
              <button
                className="bg-red-700 hover:bg-red-800 px-3 py-1 text-xs rounded"
                onClick={() => onReportBug(tc)}
              >Report Bug</button>
           {/*   <button
    className="bg-fuchsia-700 hover:bg-fuchsia-800 px-3 py-1 text-xs rounded"
    onClick={() => onGeneratePlaywrightAI(tc)}
  >
    AI to Playwright
</button> */}
 {/*  <button
  className="bg-green-700 hover:bg-green-800 px-3 py-1 text-xs rounded"
  onClick={() => {
    const featureName = generateFeatureName([tc]); // or however you generate feature name
    const featureText = scenarioToFeature(tc, featureName);
    navigator.clipboard.writeText(featureText);
    toast.success('Feature copied!');
  }}
>
  To .feature
</button> */}
  {/* <button
    className="bg-amber-600 hover:bg-amber-700 px-3 py-1 text-xs rounded"
    onClick={() => {
      const code = gherkinToWebdriverIO(tc);
      navigator.clipboard.writeText(code);
      toast.success('WebdriverIO test copied!');
    }}
  >
    To WebdriverIO
  </button> */}
 
            </div>
          </div>
        );
      })}
      {summary && (
        <div className="mt-4 p-3 bg-gray-700/50 rounded-lg text-sm italic border border-gray-600">
          <p className="font-semibold mb-1 text-yellow-400">Coverage Summary:</p>
          <p className="text-gray-300">{summary}</p>
        </div>
      )}
      <InsertStepModal
        open={insertModalOpen}
        onClose={() => setInsertModalOpen(false)}
        library={stepsLibrary}
        scenarioLines={insertModalIdx != null ? cases[insertModalIdx].lines : []}
        onInsert={handleInsertStep}
      />
    </div>
  );
};

const CoverageIndicator = ({ cases }) => {
  const { total, positive, negative, edge } = useMemo(() => {
    const total = cases.length;
    if (total === 0) return { total: 0, positive: 0, negative: 0, edge: 0 };
    const autoTag = (lines) => {
      const joined = lines.join(' ').toLowerCase();
      if (/fail|error|invalid|incorrect/.test(joined)) return 'Negative';
      if (/edge|boundary|limit|empty|null/.test(joined)) return 'Edge';
      return 'Positive';
    };
    const positive = cases.filter(tc => /happy|positive/i.test(tc.title) || autoTag(tc.lines) === 'Positive').length;
    const negative = cases.filter(tc => /negative|error|fail|invalid/i.test(tc.title) || autoTag(tc.lines) === 'Negative').length;
    const edge = cases.filter(tc => /edge|boundary|limit/i.test(tc.title) || autoTag(tc.lines) === 'Edge').length;
    return { total, positive, negative, edge };
  }, [cases]);
  if (total === 0) return null;
  return (
    <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 text-sm text-white mt-4">
      <p className="font-semibold text-blue-400 mb-2">Scenario Breakdown</p>
      <div className="flex flex-wrap gap-4 items-center">
        <span>Total: <strong>{total}</strong></span>
        <span className="text-green-400">Positive: <strong>{positive}</strong></span>
        <span className="text-red-400">Negative: <strong>{negative}</strong></span>
        <span className="text-yellow-400">Edge Cases: <strong>{edge}</strong></span>
      </div>
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
  // --- STATE ---
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openaiCases, setOpenaiCases] = useState([]);
  const [geminiCases, setGeminiCases] = useState([]);
  const [claudeCases, setClaudeCases] = useState([]);
  const [openaiSummary, setOpenaiSummary] = useState('');
  const [geminiSummary, setGeminiSummary] = useState('');
  const [claudeSummary, setClaudeSummary] = useState('');
  const [exploratoryIdeas, setExploratoryIdeas] = useState('');
  const [scenarioCount, setScenarioCount] = useState(5);
  const [loginCredentials, setLoginCredentials] = useState('');
  const [selectedModels, setSelectedModels] = useState({ openai: true, gemini: false, claude: false });
  const [countError, setCountError] = useState(null);
  const [activeGenerator, setActiveGenerator] = useState(null);

  // Bug modal state
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [activeBugScenario, setActiveBugScenario] = useState(null);
  // Steps Library
  const [stepsLibrary, setStepsLibrary] = useState([]);

  const [scenarioTypeFilter, setScenarioTypeFilter] = useState('All');
  const actualScenarioCount = openaiCases.length + geminiCases.length + claudeCases.length;
 
  const [showDataGen, setShowDataGen] = useState(false);
  const [playwrightCode, setPlaywrightCode] = useState('');
  const [showPWModal, setShowPWModal] = useState(false);
  const [playwrightLoading, setPlaywrightLoading] = useState(false);
  

  useEffect(() => {
    // This will run ONCE when the component mounts
    document.getElementById('main-input')?.focus();
  }, []);

  
async function handleGeneratePlaywrightAI(tc) {
  try {
    setPlaywrightLoading(true);
    const gherkinText = `Scenario: ${tc.title}\n${tc.lines.join('\n')}`;
    const response = await axios.post('https://test-case-backend-v1.onrender.com/ai-generate-playwright', { scenario: gherkinText });
    if (response.data && response.data.code) {
      setPlaywrightCode(response.data.code);
      setShowPWModal(true);
      toast.success('Playwright code generated!');
    } else {
      toast.error('No code returned.');
    }
  } catch (err) {
    toast.error('AI failed to generate Playwright code.');
  } finally {
    setPlaywrightLoading(false);
  }
}


  // --- AI GENERATION & PARSING (unchanged from your last working version, except state) ---
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
    const testCaseChunks = casesText.split(/Scenario:/im).slice(1).filter(chunk => chunk.trim());
    if (testCaseChunks.length === 0 && casesText.trim()) {
      testCaseChunks.push(casesText);
    }
    const cases = testCaseChunks.map(textChunk => {
      const lines = textChunk.trim().split('\n').map(l => l.trim());
      let title = lines.shift() || 'Untitled';
      const priorityMatch = textChunk.match(/Priority:\s*(High|Medium|Low)/i);
      const bddLines = lines.filter(line => !line.match(/Priority:/i));
      return {
        id: generateId(),
        title: title.replace(/\*\*/g, '').replace(/^Scenario:\s*/i, '').trim(), // REMOVE 'Scenario:'
        lines: bddLines.filter(Boolean),
        priority: priorityMatch ? priorityMatch[1] : 'N/A',
      };
    });
    return { cases, summary };
  };


   // --- AI GENERATION ---
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
    setActiveGenerator('gherkin');
    setError(null);
    setExploratoryIdeas('');
    const personaText = loginCredentials.trim() ? `For a user with login credentials "${loginCredentials.trim()}", ` : '';
const prompt = `
You are a world-class Principal QA Engineer with deep expertise in Behavior-Driven Development (BDD). Your task is to generate clear, well-structured, and testable Gherkin scenarios based on the business requirement below.

This prompt is designed for real-world consumer platforms like Burger King, McDonald’s, Tim Hortons, or Popeyes — covering both mobile and web workflows such as ordering, payments, account management, loyalty, and location services.

---
Requirement:
${input}

${personaText}

---
Step 1: Mental Analysis (Do NOT include this in your output)
Before generating scenarios, mentally identify:
- The user's intent and expected outcome
- Key system components or third-party integrations involved
- Inputs, outputs, data boundaries, and user actions
- What can go wrong: errors, timeouts, invalid inputs, edge cases
- UX expectations and system response timing

// --- Human QA Reasoning Rule ---
// Think like a senior manual tester. Before you start, mentally ask:
// - Would both a signed-in and a guest user reach this flow? Could this feature work for either?
// - Is there a business or UX reason why login is or isn't needed here? If unclear, plan scenarios for both types.
// - Are there real-world situations where unauthenticated users would attempt this flow?
//
// Always generate at least one scenario for each user type (signed-in and guest/anonymous) if there’s any ambiguity. If login is mandatory for this flow, make sure to explain why.
//
// Use your own experience to find “gaps” or implicit requirements not stated in the acceptance criteria. If something is missing or unclear, add a scenario for that case too.

Step 2: Scenario Generation

Now generate exactly ${scenarioCount} test cases that are:
- Simple and readable by both QA and business stakeholders
- Focused on user behavior and expected outcomes
- Diverse: including happy paths, edge cases, and error-handling
- Applicable to real-world food/retail/delivery platforms

---
FORMAT RULES — Follow these exactly:

1. Each test MUST begin with:  
   Scenario: [Short, descriptive title]

2. Each step MUST use the format:
   Given [initial state or precondition]  
   And [additional precondition if needed]  
   When [user action]  
   Then [observable system behavior]  
   And [additional outcome if applicable]

3. Do NOT use hyphens, dashes, or bullet points for the steps. Each step must start directly with the Gherkin keyword.

4. After the last step, include:  
   Priority: [High, Medium, or Low]  
   (Use High for core flows, Medium for validations, Low for edge cases.)

5. At the end of all scenarios, include a:
   Coverage Summary:  
   Write a detailed paragraph summarizing the generated scenarios. Do NOT use bullets, hyphens, or numbered lists. Use full sentences to describe what types of paths were covered (e.g., positive, negative, edge cases), what key user flows were validated, and any assumptions or limitations.

---
// FLOW ENFORCEMENT RULE:
For every scenario, ALWAYS include all prerequisite steps required for the user to reach the key page or action (e.g., checkout, payment, order details). Never assume the user is already on a target page unless the requirement explicitly says so.  
For any scenario involving order, payment, cart, or personalized actions, the steps MUST include, in this exact order:
1. User login (if required for the flow)
2. Store/location selection (if required)
3. Adding items to cart (if required)
4. Navigating to the payment or relevant page
5. Performing the scenario action (e.g., payment with Apple Pay)
If the scenario does NOT require login or store selection (e.g., static pages, public info), then skip those steps—but ONLY if that is clear from the requirement.
Every scenario should begin with the earliest required user step and only proceed step-by-step.

---
// Example Pattern (do NOT include this in output):

Scenario: User successfully completes a payment using Apple Pay
Given the user is logged in with a valid email
And the user selects their preferred restaurant location using the store locator
And the user adds at least one item to the cart
When the user proceeds to the payment page and selects Apple Pay as the payment method
And confirms the payment
Then the system processes the payment successfully
And the user receives a confirmation message
Priority: High

---

**Reasoning Note:**  
   At the very end, briefly explain your reasoning for which scenarios required login and which could be attempted as a guest, and why.  
   f any step is skipped, explain why it was omitted, with your QA rationale.

DO NOT:
- Include "Feature:" or "Background:" lines
- Use markdown, special characters, formatting, or emojis
- Include IDs, tags, or section labels
- Make steps too long or overly technical

Use clean, human-readable language. The output must be suitable for teams using Jira, Confluence, or automation tools.

---
Your Response:
`;

    try {
      const apiCalls = [];
      const modelNames = [];
      if (selectedModels.openai) {
        apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-test-cases', { input: prompt }));
        modelNames.push('OpenAI');
      }
      if (selectedModels.gemini) {
        apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-gemini-test-cases', { input: prompt }));
        modelNames.push('Gemini');
      }
      if (selectedModels.claude) {
        apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-claude-test-cases', { input: prompt }));
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
        const errorMessage = `❌ ${failedModels.join(' & ')} failed to generate results.`;
        setError(errorMessage);
        toast.error(`${failedModels.join(' & ')} failed to generate.`);
      } else {
        toast.success('Test cases generated!');

      }
    } catch (err) {
      console.error('Generic Error:', err);
      setError('❌ An unexpected network error occurred.');
      toast.error('An unexpected network error occurred.');
    } finally {
      setLoading(false);
      setActiveGenerator(null);
    }
  };

  const handleSuggestIdeas = async () => {
  if (!input.trim()) {
    toast.error('Please provide a feature description first.');
    return;
  }
  if (!selectedModels.openai && !selectedModels.gemini && !selectedModels.claude) {
    toast.error('Please select at least one AI model.');
    return;
  }
  setLoading(true);
  setActiveGenerator('ideas');
  setError(null);
  setOpenaiCases([]); setGeminiCases([]); setClaudeCases([]);
  setOpenaiSummary(''); setGeminiSummary(''); setClaudeSummary('');
  const prompt = `You are an elite exploratory tester trusted by world-class QA teams across industries. Your specialty is uncovering bugs that are typically missed by automated scripts or scripted test cases. Based on the requirement below, generate the most insightful and high-impact exploratory testing ideas possible.

Your goal: Think like a real user—but with a tester's mindset. Challenge assumptions. Break flows. Push boundaries.

Requirement:
${input}

---
Step 1: Mental Analysis (Internal only — do not output this section)
Before generating your ideas, silently analyze:
- What is the end-user trying to accomplish?
- What steps, decisions, or inputs are involved?
- Where does the system handle logic, UI, data, or integration?
- What are potential breakpoints, delays, or ambiguous behaviors?

Step 2: Testing Idea Generation
Generate a sharp list of exploratory test ideas that simulate real-world, edge-case, and broken-path behaviors. Each idea must help catch a bug that scripted tests would likely miss.

Critical Instructions:
1. Output only a **flat bulleted list** using "-".
2. Do NOT include headings, sections, labels, or explanations.
3. Do NOT include security-related ideas (e.g., XSS, SQLi).
4. Do NOT use any formatting like bold, italics, or markdown.
5. Each line should be a **clear test idea or exploratory question**.
6. Ideas must focus on:
   - Unexpected user behaviors or broken flows
   - Data extremes (empty, long, invalid)
   - Multi-state transitions (e.g., log in, log out mid-flow)
   - Real device/browser or network disruptions
   - Inconsistencies in UI/UX feedback, timing, or messages
   - 3rd-party integrations like payments, store locator, loyalty
7. The output must help uncover **functional, UX, or state-related bugs** in a real-world scenario like Burger King, McDonald’s, Domino’s, etc.

---
Your Response:
`;
  try {
    const apiCalls = [];
    const modelNames = []; 
    if (selectedModels.openai) {
      apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-test-cases', { input: prompt }));
      modelNames.push('OpenAI');
    }
    if (selectedModels.gemini) {
      apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-gemini-test-cases', { input: prompt }));
      modelNames.push('Gemini');
    }
    if (selectedModels.claude) {
      apiCalls.push(axios.post('https://test-case-backend-v1.onrender.com/generate-claude-test-cases', { input: prompt }));
      modelNames.push('Claude');
    }
    const results = await Promise.allSettled(apiCalls);
    let allIdeas = [];
    const failedModels = [];
    results.forEach((result, index) => {
      const modelName = modelNames[index];
      if (result.status === 'fulfilled' && result.value?.data?.output) {
        const ideas = result.value.data.output.replace(/\*\*/g, '').match(/^[-*]\s.*/gm) || [];
        allIdeas.push(...ideas);
      } else {
        console.error(`Error from ${modelName}:`, result.reason);
        failedModels.push(modelName);
      }
    });
    const uniqueIdeas = [...new Set(allIdeas)];
    setExploratoryIdeas(uniqueIdeas.join('\n'));
    if (failedModels.length > 0) {
      setError(`❌ ${failedModels.join(' & ')} failed to generate ideas.`);
      toast.error(`${failedModels.join(' & ')} failed to generate.`);
    } else {
      toast.success('Exploratory ideas generated!');

    }
  } catch (err) {
    setError('❌ Failed to generate exploratory ideas.');
    toast.error('Failed to generate ideas.');
  } finally {
    setLoading(false);
    setActiveGenerator(null);
  }
};

  // --- UI HANDLERS (Excel, Clipboard, Clear) ---
  const handleCountChange = (e) => {
    const count = Number(e.target.value);
    setScenarioCount(count);
    if (count < 5 || count > 12) setCountError('Count must be between 5 and 12.');
    else setCountError(null);
  };
  const exportToExcel = () => {
    const allCases = [...openaiCases, ...geminiCases, ...claudeCases];
    if (allCases.length === 0) {
      toast.error('No results to export.'); return;
    }
    const dataForExport = allCases.map(tc => ({
      'Scenario Title': tc.title, 'BDD Steps': tc.lines.join('\n'), 'Priority': tc.priority,
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, 'ai_generated_test_cases.xlsx');
    toast.success('Exported to Excel!');

  };

  const exportToCSV = () => {
  const allCases = [...openaiCases, ...geminiCases, ...claudeCases];
  if (allCases.length === 0) {
    toast.error('No results to export.');
    return;
  }
  const headers = ['Scenario Title', 'BDD Steps', 'Priority'];
  const rows = allCases.map(tc => [
    `"${tc.title.replace(/"/g, '""')}"`,
    `"${tc.lines.join('\n').replace(/"/g, '""')}"`,
    `"${tc.priority.replace(/"/g, '""')}"`
  ]);
  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\r\n');

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'ai_generated_test_cases.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success('Exported to CSV!');

};



  const copyToClipboard = () => {
    const allGherkinCases = [...openaiCases, ...geminiCases, ...claudeCases];
    let textToCopy = '';
    if (exploratoryIdeas) textToCopy = exploratoryIdeas;
    else if (allGherkinCases.length > 0) {
      textToCopy = allGherkinCases.map(tc => {
        let text = `Scenario: ${tc.title}\n${tc.lines.join('\n')}`;
        text += `\nPriority: ${tc.priority}`; return text;
      }).join('\n\n=====================\n\n');
    } else {
      toast.error('No results to copy.'); return;
    }
    navigator.clipboard.writeText(textToCopy.trim());
    toast.success('Results copied!');

  };
  const clearAll = () => {
    setInput(''); setOpenaiCases([]); setGeminiCases([]); setClaudeCases([]);
    setOpenaiSummary(''); setGeminiSummary(''); setClaudeSummary('');
    setExploratoryIdeas(''); setError(null); setLoginCredentials('');
    setScenarioCount(5); setSelectedModels({ openai: true, gemini: false, claude: false });
    setCountError(null); 
    toast('Cleared all data.', { icon: '🗑️' });
    document.getElementById('main-input')?.focus();
  };

  const filterCases = (cases) => {
  if (scenarioTypeFilter === 'All') return cases;
  return cases.filter(tc => autoTag(tc.lines) === scenarioTypeFilter);
};


  const isAnyModelSelected = Object.values(selectedModels).some(isSelected => isSelected);

  // --- UI RENDER ---
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <Toaster position="top-center" reverseOrder={false} />
      <SignupAgent />

      {playwrightLoading && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-60">
    <div className="bg-gray-900 p-8 rounded-lg text-white text-xl">
      Generating Playwright code...
      <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
    </div>
  </div>
)}

 {showPWModal && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-60" onClick={() => setShowPWModal(false)}>
    <div
      className="bg-gray-900 p-6 rounded-lg max-w-xl w-full max-h-[80vh] overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      <h3 className="text-lg font-semibold text-green-400 mb-4">Playwright Code</h3>
      <pre
        className="whitespace-pre-wrap text-xs text-gray-200 bg-gray-800 rounded p-4 mb-4 max-h-[50vh] overflow-y-auto"
        style={{ fontFamily: "monospace" }}
      >
        {playwrightCode}
      </pre>
      <div className="flex gap-2 justify-end">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          onClick={() => {
            navigator.clipboard.writeText(playwrightCode);
            toast.success('Copied!');
          }}
        >
          Copy
        </button>
        <button
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
          onClick={() => setShowPWModal(false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

      <BugModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} scenario={activeBugScenario} />
      <div className="min-h-screen bg-gray-900 text-white px-4 py-8 sm:px-8">
        <div className="max-w-screen-xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8V2h8v2h-4Z" />
              <rect x="4" y="8" width="16" height="12" rx="2" />
              <path d="M8 14v-2" />
              <path d="M16 14v-2" />
              <path d="M12 18v-4" />
            </svg>
            <h1 className="text-3xl sm:text-4xl font-bold text-center">AI Scenario Generator</h1>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
            <textarea
             id="main-input" 
              className="w-full rounded-lg p-4 bg-gray-900 text-white text-sm sm:text-base resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Paste acceptance criteria or feature description here..."
              value={input}
              onChange={e => setInput(e.target.value)}
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
                    <input type="checkbox" checked={selectedModels.openai} onChange={() => setSelectedModels(prev => ({ ...prev, openai: !prev.openai }))} className="accent-blue-500 h-4 w-4" />
                    OpenAI
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedModels.gemini} onChange={() => setSelectedModels(prev => ({ ...prev, gemini: !prev.gemini }))} className="accent-blue-500 h-4 w-4" />
                    Gemini
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedModels.claude} onChange={() => setSelectedModels(prev => ({ ...prev, claude: !prev.claude }))} className="accent-blue-500 h-4 w-4" />
                    Claude
                  </label>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-3">
                <button onClick={clearAll} className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded shadow transition">Clear All</button>
                <button onClick={handleSuggestIdeas} className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded shadow transition disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={loading || !input.trim() || !isAnyModelSelected}>
                  {loading && activeGenerator === 'ideas' ? '🤔 Thinking...' : 'Suggest Ideas'}
                </button>
                <button onClick={handleGenerate} className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded shadow transition disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={loading || !input.trim() || !!countError || !isAnyModelSelected}>
                  {loading && activeGenerator === 'gherkin' ? '🤖 Generating...' : 'Generate Cases'}
                </button>
              </div>
            </div>
          </div>
          {(openaiCases.length > 0 || geminiCases.length > 0 || claudeCases.length > 0) && (
            <StepsLibrary steps={stepsLibrary} setSteps={setStepsLibrary} />
          )}

          {/* Scenario Filter UI */}
{(openaiCases.length > 0 || geminiCases.length > 0 || claudeCases.length > 0) && !exploratoryIdeas && (
  <div className="flex gap-2 mb-4">
    <label className="text-gray-400 font-semibold">Filter Scenarios:</label>
    <button
      className={`px-3 py-1 rounded ${scenarioTypeFilter === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
      onClick={() => setScenarioTypeFilter('All')}
    >All</button>
    <button
      className={`px-3 py-1 rounded ${scenarioTypeFilter === 'Positive' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'}`}
      onClick={() => setScenarioTypeFilter('Positive')}
    >Positive</button>
    <button
      className={`px-3 py-1 rounded ${scenarioTypeFilter === 'Negative' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200'}`}
      onClick={() => setScenarioTypeFilter('Negative')}
    >Negative</button>
    <button
      className={`px-3 py-1 rounded ${scenarioTypeFilter === 'Edge' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-200'}`}
      onClick={() => setScenarioTypeFilter('Edge')}
    >Edge</button>
  </div>
)}



          <CoverageIndicator cases={[...openaiCases, ...geminiCases, ...claudeCases]} />
          {/* --- RESULTS --- */}
          <div>
            {loading && <div className="text-center p-6"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto"></div><p className='mt-3'>AI is thinking...</p></div>}
            {error && <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-center border border-red-700">{error}</div>}
            {exploratoryIdeas && !loading && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pt-2">
                  <h2 className='text-lg font-semibold text-purple-400'>🧠 Exploratory Testing Ideas</h2>
                  <div className='flex gap-3'>
                    <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition">📋 Copy</button>
                  </div>
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">{exploratoryIdeas}</pre>
                </div>
              </div>
            )}
            {!loading && !error && !exploratoryIdeas && openaiCases.length === 0 && geminiCases.length === 0 && claudeCases.length === 0 && <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Results will appear here.</div>}
            {(openaiCases.length > 0 || geminiCases.length > 0 || claudeCases.length > 0) && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pt-2">
                  <h2 className='text-lg font-semibold text-green-400'>✅ Consolidated Results
                  {actualScenarioCount > 0 && (
                  <span className="ml-2 text-sm text-blue-300 font-normal">
                  ({actualScenarioCount} Scenario{actualScenarioCount > 1 ? "s" : ""})
                  </span>
                  )}
                 </h2>
                  <div className='flex gap-3'>
                    <button onClick={copyToClipboard} className="bg-gray-600 hover:bg-gray-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!openaiCases.length && !geminiCases.length && !claudeCases.length}>📋 Copy</button>
                    <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!openaiCases.length && !geminiCases.length && !claudeCases.length}>📤 Export Excel</button>
                    <button onClick={exportToCSV} className="bg-yellow-600 hover:bg-yellow-700 text-sm py-2 px-4 rounded shadow transition disabled:opacity-50" disabled={!openaiCases.length && !geminiCases.length && !claudeCases.length}>📥 Export CSV</button>
                  {/* <button
  onClick={() => {
    const allScenarios = [...openaiCases, ...geminiCases, ...claudeCases];
    const code = exportAllPlaywright(allScenarios);
    if (!code.trim()) {
      toast.error('No Playwright code to export!');
      return;
    }
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playwright-tests.spec.js';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success('Playwright file downloaded!');
  }}
  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded"
>
  Export Playwright
</button> */ }
<button
  onClick={() => {
    const allScenarios = [...openaiCases, ...geminiCases, ...claudeCases];
    const code = exportAllWebdriverIO(allScenarios);
    if (!code.trim()) {
      toast.error('No WebdriverIO code to export!');
      return;
    }
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'webdriverio-tests.spec.js';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success('WebdriverIO file downloaded!');
  }}
  className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-2 rounded"
>
  Export WebdriverIO
</button>
<button
  onClick={() => {
    // Make sure to declare allScenarios here!
    const allScenarios = [...openaiCases, ...geminiCases, ...claudeCases];
    if (!allScenarios.length) {
      toast.error('No scenarios to export!');
      return;
    }
    const featureName = generateFeatureName(allScenarios, input);
    const featureText = exportAllAsFeatureFile(allScenarios, featureName);
    const blob = new Blob([featureText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${featureName.replace(/\s+/g, '_').toLowerCase()}.feature`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success('Feature file downloaded!');
  }}
  className="bg-green-900 hover:bg-green-950 text-white px-3 py-2 rounded"
>
  Export .feature File
</button>
                  </div>
                </div>
                <div className="p-3 rounded-md bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-base font-medium text-center">
                  ⚠️ AI can make mistakes. Please review with human intelligence.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <ResultsColumn
                    title="OpenAI Results"
                    cases={filterCases(openaiCases)}
                    summary={openaiSummary}
                    selectedModels={selectedModels}
                    loading={loading}
                    onReportBug={tc => { setActiveBugScenario(tc); setBugModalOpen(true); }}
                    stepsLibrary={stepsLibrary}
                    onGeneratePlaywrightAI={handleGeneratePlaywrightAI} 
                  />
                  <ResultsColumn
                    title="Gemini Results"
                    cases={filterCases(geminiCases)}
                    summary={geminiSummary}
                    selectedModels={selectedModels}
                    loading={loading}
                    onReportBug={tc => { setActiveBugScenario(tc); setBugModalOpen(true); }}
                    stepsLibrary={stepsLibrary}
                    onGeneratePlaywrightAI={handleGeneratePlaywrightAI} 
                  />
                  <ResultsColumn
                    title="Claude Results"
                    cases={filterCases(claudeCases)}
                    summary={claudeSummary}
                    selectedModels={selectedModels}
                    loading={loading}
                    onReportBug={tc => { setActiveBugScenario(tc); setBugModalOpen(true); }}
                    stepsLibrary={stepsLibrary}
                    onGeneratePlaywrightAI={handleGeneratePlaywrightAI} 
                  />
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


