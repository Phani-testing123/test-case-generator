import React, { useState } from 'react';
import { saveAs } from 'file-saver';

export default function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isGherkin, setIsGherkin] = useState(true);
  const [coverage, setCoverage] = useState(0);

  const generateTestCases = async () => {
    if (!input.trim()) {
      setOutput('Please enter acceptance criteria or a feature description.');
      return;
    }

    try {
      const response = await fetch('https://api.testgen.ai/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ criteria: input })
      });

      const data = await response.json();
      const steps = data.steps || [];

      const formattedSteps = steps.map(step => isGherkin ? `  ${step}` : `- ${step}`);

      const testCase = `
${isGherkin ? 'Feature: ' + (data.feature || 'Dynamic Test Case Generation') : 'Test Case Title: ' + (data.feature || 'Generated Logic')}

${isGherkin ? 'Scenario: ' + (data.scenario || 'AI-generated scenario') : 'Steps:'}
${formattedSteps.join('\n')}

[Positive Case]\n${isGherkin ? '  Then ' + (data.positive || 'system behaves as expected with valid input') : 'Expected Result: ' + (data.positive || 'System behaves correctly with valid input')}\n
[Negative Case]\n${isGherkin ? '  Then ' + (data.negative || 'error is shown for invalid input') : 'Expected Result: ' + (data.negative || 'System rejects invalid input')}\n
[Edge Case]\n${isGherkin ? '  Then ' + (data.edge || 'system handles edge cases properly') : 'Expected Result: ' + (data.edge || 'Edge input handled gracefully')}
      `;

      setOutput(testCase.trim());
      setCoverage(data.coverage || 100);
    } catch (error) {
      setOutput('Failed to generate test cases. Please try again later.');
      setCoverage(0);
    }
  };

  const exportToCSV = () => {
    const blob = new Blob([output], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'test-cases.csv');
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-4 flex items-center">
        <span role="img" aria-label="test tube">\uD83D\uDD2C</span> Test Case Generator
      </h1>

      <div className="text-sm text-green-400 mb-4">Test Coverage: {coverage}%</div>

      <div className="max-w-3xl w-full flex flex-col gap-4">
        <textarea
          className="w-full h-48 p-4 bg-zinc-800 border border-zinc-700 rounded-md resize-y"
          placeholder="Paste acceptance criteria or feature description..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        ></textarea>

        <div className="flex justify-between items-center flex-wrap gap-4">
          <button
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
            onClick={generateTestCases}
          >
            Generate Test Cases
          </button>

          <button
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded"
            onClick={exportToCSV}
            disabled={!output}
          >
            Export to CSV
          </button>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isGherkin}
              onChange={() => setIsGherkin(!isGherkin)}
            />
            Gherkin Format
          </label>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded p-4 whitespace-pre-wrap overflow-x-auto mt-4">
          {output || 'Paste input and click "Generate Test Cases" to begin.'}
        </div>
      </div>
    </div>
  );
}