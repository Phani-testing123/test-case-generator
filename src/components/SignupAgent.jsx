import React, { useState } from "react";

const SignupAgent = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState([]);
  const [count, setCount] = useState(1);
  const [error, setError] = useState(null);
  const [showToast, setShowToast] = useState(false);

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    setEmails([]);
    try {
      const resp = await fetch("http://localhost:5000/signup-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setEmails(data.emails);
      } else {
        setError(data.error || "Unknown error");
      }
    } catch (err) {
      setError("Failed to connect to agent server.");
    }
    setLoading(false);
  };

  // Handle copy to clipboard
  const handleCopy = email => {
    navigator.clipboard.writeText(email);
    setShowToast(true);
  setTimeout(() => setShowToast(false), 1200); // 1.2s toast
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        className="fixed bottom-8 right-8 bg-green-600 hover:bg-green-700 text-white w-16 h-16 rounded-full shadow-xl flex items-center justify-center z-50 transition-all"
        title="Signup Agent"
        onClick={() => setOpen(true)}
        style={{ fontSize: 32 }}
      >
        <span role="img" aria-label="User Add">+</span>
      </button>

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[370px] bg-[#181F2A] shadow-2xl z-50 px-6 py-7 transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderTopLeftRadius: 18, borderBottomLeftRadius: 18, maxWidth: "90vw" }}
      >
        {/* Close */}
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
            {loading ? "Creating..." : "Create Account(s)"}
          </button>
        </div>

        {error && (
          <div className="bg-red-700 p-2 rounded mb-3 text-sm text-white font-semibold">{error}</div>
        )}

        {emails.length > 0 && (
          <div className="mt-2">
            <div className="text-green-400 mb-2 text-base font-semibold">Created Account(s):</div>
            <ul className="space-y-2">
              {emails.map((email, i) => (
                <li
                  key={i}
                  className="bg-gray-800 px-3 py-2 rounded flex items-center justify-between group"
                >
                  <span className="truncate text-base text-white">{email}</span>
                  <button
                    onClick={() => handleCopy(email)}
                    className="ml-3 text-gray-300 hover:text-green-400 transition text-xl"
                    title="Copy email"
                  >📋</button>

                  {showToast && (
  <div className="fixed left-1/2 bottom-8 z-50 transform -translate-x-1/2 bg-green-600 text-white rounded-lg px-4 py-2 shadow-lg text-sm">
    Copied to clipboard!
  </div>
)}

                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {/* Drawer Overlay */}
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
