import React, { useState, useEffect, useRef } from "react";

const SignupAgent = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(1);
  const [error, setError] = useState(null);
  
  // State to hold the final results
  const [results, setResults] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [showToast, setShowToast] = useState(false);

  // Use a ref to hold the interval ID
  const pollingIntervalRef = useRef(null);

  const statusApiUrl = `https://test-case-backend-v1.onrender.com/job-status`;
  const signupApiUrl = `https://test-case-backend-v1.onrender.com/signup-agent`;

  // This effect runs whenever the jobId changes to start polling
  useEffect(() => {
    if (!jobId) return;

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${statusApiUrl}/${jobId}`);
        const data = await resp.json();

        if (data.status === 'completed') {
          setResults(data.result);
          setLoading(false);
          setJobId(null); // Stop polling
        } else if (data.status === 'failed') {
          setError('The account creation job failed.');
          setLoading(false);
          setJobId(null); // Stop polling
        }
      } catch (err) {
        setError('Could not poll for job status.');
        setLoading(false);
        setJobId(null); // Stop polling on error
      }
    }, 3000); // Check every 3 seconds

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [jobId, statusApiUrl]);

  // This effect clears the interval if the job is done
  useEffect(() => {
    if (!jobId && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  }, [jobId]);

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const resp = await fetch(signupApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setJobId(data.jobId);
      } else {
        setError(data.error || "An unknown error occurred.");
        setLoading(false);
      }
    } catch (err) {
      setError("Failed to connect to agent server.");
      setLoading(false);
    }
  };

  const handleCopy = email => {
    navigator.clipboard.writeText(email);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1200);
  };

  return (
    <>
      {/* Floating Action Button (RESTORED) */}
      <button
        className="fixed bottom-8 right-8 bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center z-50 transition-all"
        title="Signup Agent"
        onClick={() => setOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
        </svg>
      </button>

      {/* Drawer (RESTORED) */}
      <div
        className={`fixed top-0 right-0 h-full w-[370px] bg-[#181F2A] shadow-2xl z-50 px-6 py-7 transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderTopLeftRadius: 18, borderBottomLeftRadius: 18, maxWidth: "90vw" }}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-5 text-3xl text-gray-400 hover:text-red-400 transition"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >×</button>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">
            Signup Agent <span className="text-green-400 text-base font-normal">(BK Dev)</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <span className="text-lg text-white font-semibold">#</span>
          <input
            id="count"
            type="number"
            min={1}
            max={3}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="text-black rounded px-2 py-1 w-14 text-base font-semibold"
          />
          <button
            onClick={handleSignup}
            className="ml-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold shadow transition-all"
            disabled={loading}
            style={{ minWidth: 130 }}
          >
            {loading ? "Processing..." : "Create Account(s)"}
          </button>
        </div>
        
        {/* --- UPDATED UI LOGIC --- */}
        {error && (
          <div className="bg-red-700 p-2 rounded my-3 text-sm text-white font-semibold">{error}</div>
        )}
        
        {jobId && loading && (
           <div className="bg-blue-600 p-2 rounded my-3 text-sm text-white font-semibold">Request accepted. Waiting for results...</div>
        )}

        {results && (
          <div className="mt-2">
            <div className="text-green-400 mb-2 text-base font-semibold">Created Account(s):</div>
            {results.successes?.length > 0 ? (
              <ul className="space-y-2">
                {results.successes.map((email, i) => (
                  <li key={i} className="bg-gray-800 px-3 py-2 rounded flex items-center justify-between group">
                    <span className="truncate text-base text-white">{email}</span>
                    <button
                      onClick={() => handleCopy(email)}
                      className="ml-3 text-gray-300 hover:text-green-400 transition text-xl"
                      title="Copy email"
                    >📋</button>
                  </li>
                ))}
              </ul>
            ) : <div className="text-gray-400 text-sm">No accounts were created successfully.</div>}
            
            {results.failures?.length > 0 && (
              <div className="mt-4">
                <div className="text-red-400 mb-2 text-base font-semibold">Failures:</div>
                <div className="text-red-300 text-sm">{results.failures.length} account(s) failed to create.</div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Toast Notification (RESTORED) */}
      {showToast && (
        <div className="fixed left-1/2 bottom-8 z-50 transform -translate-x-1/2 bg-green-600 text-white rounded-lg px-4 py-2 shadow-lg text-sm">
          Copied to clipboard!
        </div>
      )}

      {/* Drawer Overlay (RESTORED) */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default SignupAgent;
