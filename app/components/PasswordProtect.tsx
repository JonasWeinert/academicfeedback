"use client";

import { useState, useEffect } from "react";

export default function PasswordProtect({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [authMode, setAuthMode] = useState<"password" | "api_key">("password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authenticated = localStorage.getItem("isAuthenticated");
    if (authenticated === "true") {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (authMode === "password") {
      try {
        // Call the server API to validate the password
        const response = await fetch('/api/validate-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });
        
        const data = await response.json();
        
        if (data.isValid) {
          localStorage.setItem("isAuthenticated", "true");
          localStorage.setItem("authMethod", "password");
          // Remove any stored API key if previously authenticated with API key
          localStorage.removeItem("geminiApiKey");
          setIsAuthenticated(true);
          setError("");
        } else {
          setError("Incorrect password");
        }
      } catch (err) {
        setError("An error occurred. Please try again.");
      }
    } else if (authMode === "api_key") {
      // Basic validation for Gemini API key format
      if (geminiApiKey && geminiApiKey.startsWith("AI")) {
        // Store the API key in localStorage
        localStorage.setItem("geminiApiKey", geminiApiKey);
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("authMethod", "api_key");
        setIsAuthenticated(true);
        setError("");
      } else {
        setError("Invalid Gemini API key format");
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Password Protected</h1>
          
          <div className="mb-4 flex">
            <button
              onClick={() => setAuthMode("password")}
              className={`flex-1 p-2 ${authMode === "password" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              Use Password
            </button>
            <button
              onClick={() => setAuthMode("api_key")}
              className={`flex-1 p-2 ${authMode === "api_key" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              Use Gemini API Key
            </button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              {authMode === "password" ? (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full p-2 border border-gray-300 rounded"
                  required
                />
              ) : (
                <input
                  type="text"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Enter Gemini API key"
                  className="w-full p-2 border border-gray-300 rounded"
                  required
                />
              )}
            </div>
            
            {authMode === "api_key" && (
              <div className="mb-4 text-sm text-gray-600">
                <a 
                  href="https://ai.google.dev/gemini-api/docs/api-key" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  How to get a Gemini API key
                </a>
              </div>
            )}
            
            {error && <div className="text-red-500 mb-4">{error}</div>}
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            >
              Submit
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
} 