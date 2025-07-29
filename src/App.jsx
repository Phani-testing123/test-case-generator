import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const generateTestCases = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const response = await axios.post("https://test-case-backend.onrender.com/generate-test-cases", { input });
      setOutput(response.data.output);
    } catch (error) {
      console.error("Error generating test cases:", error);
      setOutput("Failed to generate test cases. Check console.");
    }
    setLoading(false);
  };

  const exportToCsv = () => {
    if (!output) return;
    const csv = output
      .split('\n')
      .map(line => `"${line.replace(/"/g, '""')}"`)
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 text-gray-800">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-8">
        <h1 className="text-3xl font-bold mb-4">🧪 Test Case Generator</h1>
        <textarea
          rows="12"
          className="w-full h-60 p-4 border rounded mb-4"
          placeholder="Paste acceptance criteria or feature description..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <div className="flex items-center mb-6">
          <button
            onClick={generateTestCases}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded shadow"
          >
            {loading ? "Generating..." : "Generate Test Cases"}
          </button>
          {output && (
            <button
              onClick={exportToCsv}
              className="ml-4 px-4 py-2 bg-green-500 text-white rounded shadow"
            >
              Export to CSV
            </button>
          )}
        </div>
        {output && (
  <>
    <h2 className="text-2xl font-semibold mb-2">Generated Test Cases:</h2>
    <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded">
      {output}
    </pre>
  </>
)}

{!loading && !output && (
  <p className="text-gray-500 mt-4">Paste input and click "Generate Test Cases" to begin.</p>
)}
      </div>
    </div>
  );
}