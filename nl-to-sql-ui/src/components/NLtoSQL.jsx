import React, { useState, useEffect } from "react";
import axios from "axios";
import backgroundImage from "../assets/BackgroundIMG.png";

function NLtoSQL() {
  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sql, setSql] = useState("");
  const [results, setResults] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dbSchema, setDbSchema] = useState([]);
  const [examples, setExamples] = useState([
    "Show me all data",
    "Count the number of rows in each table",
    "Find the top 5 records with highest values",
    "Calculate the average of numeric columns"
  ]);
  const [queryHistory, setQueryHistory] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [theme, setTheme] = useState("light");
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState({
    action: "show",
    modifier: "",
    condition: "",
    limit: "",
  });
  const [notification, setNotification] = useState({ show: false, message: "", type: "" });

  // Load history and theme from localStorage on initial render
  useEffect(() => {
    const savedHistory = localStorage.getItem('nlsql_history');
    if (savedHistory) {
      setQueryHistory(JSON.parse(savedHistory));
    }
    
    const savedTheme = localStorage.getItem('nlsql_theme');
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  // Show notification function
  const showNotification = (message, type = "success") => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: "", type: "" });
    }, 3000);
  };

  const handleFileUpload = async () => {
    if (!file) return showNotification("Please choose a file first.", "error");
    const formData = new FormData();
    formData.append("file", file);

    setIsLoading(true);
    setUploadProgress(0);
    
    try {
      const response = await axios.post("http://localhost:8000/upload", formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      
      setSessionId(response.data.session_id);
      setError("");
      
      // After successful upload, fetch schema information
      if (response.data.session_id) {
        fetchSchema(response.data.session_id);
      }
      
      showNotification("Upload successful!");
    } catch (err) {
      console.error("Upload error:", err);
      setError("Upload failed. Try again.");
      showNotification("Upload failed. Try again.", "error");
    } finally {
      setIsLoading(false);
      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const fetchSchema = async (sid) => {
    try {
      const response = await axios.get(`http://localhost:8000/schemas/${sid}`);
      if (response.data.success) {
        setDbSchema(response.data.tables);
        
        // Generate better examples based on the schema
        const newExamples = generateExamples(response.data.tables);
        if (newExamples.length > 0) {
          setExamples(newExamples);
        }
      }
    } catch (err) {
      console.error("Schema fetch error:", err);
    }
  };

  const generateExamples = (tables) => {
    if (!tables || tables.length === 0) return [];
    
    const examples = [];
    const mainTable = tables.find(t => t.name !== 'sqlite_sequence') || tables[0];
    
    if (mainTable) {
      examples.push(`Show all records from ${mainTable.name}`);
      
      // Find a numeric column for aggregation example
      const numericColumn = mainTable.columns.find(c => 
        ['int', 'integer', 'number', 'decimal', 'float', 'double'].some(t => 
          c.type.toLowerCase().includes(t)
        )
      );
      
      if (numericColumn) {
        examples.push(`What is the average ${numericColumn.name} in ${mainTable.name}?`);
        examples.push(`Find the highest ${numericColumn.name} in ${mainTable.name}`);
      }
      
      // Find a text column for filtering example
      const textColumn = mainTable.columns.find(c => 
        ['text', 'varchar', 'char', 'string'].some(t => 
          c.type.toLowerCase().includes(t)
        )
      );
      
      if (textColumn) {
        examples.push(`Search for records where ${textColumn.name} contains "example"`);
      }
    }
    
    return examples;
  };

  const handleQuerySubmit = async () => {
    if (!query || !sessionId) {
      setError("Please upload a file and enter a query.");
      showNotification("Please upload a file and enter a query.", "error");
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await axios.post("http://localhost:8000/generate-sql", {
        query,
        session_id: sessionId,
      });
      
      setSql(response.data.sql);
      setResults(response.data.results || []);
      setError("");
      
      // Add to history
      const newHistoryItem = {
        query,
        sql: response.data.sql,
        timestamp: new Date().toISOString()
      };
      
      const updatedHistory = [newHistoryItem, ...queryHistory].slice(0, 10);
      setQueryHistory(updatedHistory);
      localStorage.setItem('nlsql_history', JSON.stringify(updatedHistory));
      
      showNotification("SQL generated successfully!");
    } catch (err) {
      console.error("Query error:", err);
      setError("Error generating SQL. See console for details.");
      showNotification("Error generating SQL.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showNotification("Copied to clipboard!");
  };

  const useExample = (example) => {
    setQuery(example);
  };

  const useHistoryItem = (item) => {
    setQuery(item.query);
    setSql(item.sql);
  };

  const clearHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('nlsql_history');
    showNotification("History cleared!");
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('nlsql_theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const togglePromptBuilder = () => {
    setShowPromptBuilder(!showPromptBuilder);
  };

  const buildPrompt = () => {
    let built = "";
    
    if (promptTemplate.action) {
      built += promptTemplate.action;
    }
    
    if (promptTemplate.modifier) {
      built += ` ${promptTemplate.modifier}`;
    }
    
    if (dbSchema.length > 0 && dbSchema[0].name) {
      built += ` from ${dbSchema[0].name}`;
    }
    
    if (promptTemplate.condition) {
      built += ` where ${promptTemplate.condition}`;
    }
    
    if (promptTemplate.limit) {
      built += ` limit ${promptTemplate.limit}`;
    }
    
    setQuery(built.trim());
    setShowPromptBuilder(false);
  };

  // Export results to CSV
  const exportToCSV = () => {
    if (!results.length) return;
    
    const headers = Object.keys(results[0]);
    const csvData = [
      headers.join(','),
      ...results.map(row => headers.map(key => JSON.stringify(row[key])).join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'query_results.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showNotification("Results exported to CSV!");
  };

  const mainClass = theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white';
  const cardClass = theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 ${theme === 'dark' ? 'bg-gray-900 text-white' : ''}`}>
      {/* Theme Toggle Button */}
      <button 
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700"
      >
        {theme === 'dark' ? '🌞' : '🌙'}
      </button>
      
      {/* Notification Toast */}
      {notification.show && (
        <div className={`fixed top-4 right-4 p-4 rounded-md shadow-md ${
          notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}
      
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-8 drop-shadow-l">NLtoSQL AI Converter</h1>
      <p className="text-lg md:text-xl text-center mb-12 max-w-2xl mx-auto drop-shadow-sm">Upload your database file and ask questions in natural language. Let AI convert it into SQL!</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 w-full max-w-7xl">
        <div className="md:col-span-2">
          <div className={`shadow-xl rounded-xl p-6 mb-6 ${cardClass}`}>
            <h2 className="text-2xl font-bold mb-4">📁 Upload Your Data</h2>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="flex-grow">
                <label className="flex flex-col items-center px-4 py-6 rounded-lg cursor-pointer border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  <span className="mt-2 text-base leading-normal">
                    {file ? file.name : "Select a file"}
                  </span>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept=".csv,.txt,.xls,.xlsx,.db"
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                </label>
              </div>
              
              <button
                onClick={handleFileUpload}
                disabled={isLoading || !file}
                className={`px-4 py-2 rounded font-semibold ${
                  isLoading ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
                } text-white`}
              >
                {isLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
            
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="w-full mt-4 bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
            
            {sessionId && (
              <div className="mt-4 p-2 bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">
                File uploaded successfully! Session ID: {sessionId.slice(0, 8)}...
              </div>
            )}
          </div>

          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold mb-4">🗣️ Ask your question</h2>
              <button 
                onClick={togglePromptBuilder}
                className="text-blue-500 hover:underline text-sm"
              >
                {showPromptBuilder ? "Close Builder" : "Use Query Builder"}
              </button>
            </div>
            
            {showPromptBuilder ? (
              <div className="space-y-4 mb-4">
                <h3 className="font-semibold">Query Builder</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Action</label>
                    <select 
                      className={`w-full border rounded p-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                      value={promptTemplate.action}
                      onChange={(e) => setPromptTemplate({...promptTemplate, action: e.target.value})}
                    >
                      <option value="show">Show/Select</option>
                      <option value="count">Count</option>
                      <option value="sum">Sum</option>
                      <option value="average">Average</option>
                      <option value="find">Find</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Modifier (field, *)</label>
                    <input 
                      type="text"
                      className={`w-full border rounded p-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                      value={promptTemplate.modifier}
                      onChange={(e) => setPromptTemplate({...promptTemplate, modifier: e.target.value})}
                      placeholder="* or field names"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Condition</label>
                    <input 
                      type="text"
                      className={`w-full border rounded p-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                      value={promptTemplate.condition}
                      onChange={(e) => setPromptTemplate({...promptTemplate, condition: e.target.value})}
                      placeholder="e.g. age > 25"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Limit</label>
                    <input 
                      type="text"
                      className={`w-full border rounded p-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                      value={promptTemplate.limit}
                      onChange={(e) => setPromptTemplate({...promptTemplate, limit: e.target.value})}
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
                
                <button
                  onClick={buildPrompt}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                >
                  Build Query
                </button>
              </div>
            ) : (
              <textarea
                rows="4"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="E.g., List all employees hired after 2020"
                className={`w-full border p-3 rounded mb-4 text-lg ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
              />
            )}

            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={handleQuerySubmit}
                disabled={isLoading || !sessionId}
                className={`px-5 py-3 rounded font-semibold flex-grow md:flex-grow-0 ${
                  isLoading || !sessionId
                    ? "bg-gray-400"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </span>
                ) : "Generate SQL"}
              </button>
              
              <button
                onClick={() => setQuery("")}
                className="px-5 py-3 rounded font-semibold border border-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600"
              >
                Clear
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 rounded">
                ❌ {error}
              </div>
            )}
          </div>

          {sql && (
            <div className={`shadow-xl rounded-xl p-6 mt-6 ${cardClass}`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold">Generated SQL:</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(sql)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <span className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </span>
                  </button>
                </div>
              </div>
              <pre className={`p-4 rounded overflow-x-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>{sql}</pre>
            </div>
          )}

          {results && results.length > 0 && (
            <div className={`shadow-xl rounded-xl p-6 mt-6 ${cardClass}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Results: ({results.length} rows)</h3>
                <button
                  onClick={exportToCSV}
                  className="flex items-center text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full border-collapse ${theme === 'dark' ? 'text-gray-300' : ''}`}>
                  <thead>
                    <tr className={theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}>
                      {Object.keys(results[0]).map((col, idx) => (
                        <th key={idx} className="border px-3 py-2 text-left">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? (theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50') : ''}>
                        {Object.values(row).map((val, i) => (
                          <td key={i} className="border px-3 py-2">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <h3 className="text-xl font-bold mb-4">Example Queries</h3>
            <ul className="space-y-2">
              {examples.map((example, idx) => (
                <li
                  key={idx}
                  className={`p-2 hover:bg-blue-50 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center`}
                  onClick={() => useExample(example)}
                >
                  <span className="mr-2 text-blue-500">➤</span>
                  {example}
                </li>
              ))}
            </ul>
          </div>

          {dbSchema.length > 0 && (
            <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
              <h3 className="text-xl font-bold mb-4">Database Schema</h3>
              <div className="space-y-4">
                {dbSchema.map((table, idx) => (
                  <div key={idx} className="border-b pb-2 last:border-b-0">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                      <h4 className="font-semibold text-lg">{table.name}</h4>
                    </div>
                    <ul className="ml-7 text-sm space-y-1 mt-2">
                      {table.columns.map((col, cidx) => (
                        <li key={cidx} className="flex items-center">
                          <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                          <span className="font-medium">{col.name}</span>{" "}
                          <span className={`text-gray-500 dark:text-gray-400 ml-1`}>({col.type})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {queryHistory.length > 0 && (
            <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Query History</h3>
                <button
                  onClick={clearHistory}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-2">
                {queryHistory.map((item, idx) => (
                  <li
                    key={idx}
                    className={`p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer border-l-4 border-blue-500 pl-3`}
                    onClick={() => useHistoryItem(item)}
                  >
                    <div className="font-medium">{item.query}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="w-full mt-12 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        NLtoSQL AI Converter • Created with 💙 • {new Date().getFullYear()}
      </div>
    </div>
  );
}

export default NLtoSQL;