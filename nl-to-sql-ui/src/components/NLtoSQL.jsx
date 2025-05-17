import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function NLtoSQL() {
  // Basic state
  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sql, setSql] = useState("");
  const [results, setResults] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Database information
  const [dbSchema, setDbSchema] = useState([]);
  const [, setDbStats] = useState({
    size: 0,
    tables: 0,
    totalRows: 0,
    lastModified: null
  });
  
  // UI state
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
  const [notification, setNotification] = useState({ show: false, message: "", type: "" });
  const [activeTab, setActiveTab] = useState("results");
  const [filteredResults, setFilteredResults] = useState([]);
  const [filterValue, setFilterValue] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [sqlExplanation, setSqlExplanation] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSchemaOpen, setIsSchemaOpen] = useState(false);
  
  // Enhanced prompt builder
  const [promptTemplate, setPromptTemplate] = useState({
    action: "show",
    modifier: "",
    table: "",
    condition: "",
    groupBy: "",
    orderBy: "",
    limit: "",
    joinTable: "",
    joinCondition: "",
  });
  
  // Refs
  const queryInputRef = useRef(null);
  const resultsRef = useRef(null);
  
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
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + Enter to execute query
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement === queryInputRef.current) {
          handleQuerySubmit();
        }
      }
      
      // Ctrl/Cmd + L to focus on query input
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        queryInputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Filter results when filterValue changes
  useEffect(() => {
    if (!results.length) {
      setFilteredResults([]);
      return;
    }
    
    if (!filterValue.trim()) {
      setFilteredResults(results);
      return;
    }
    
    const filtered = results.filter(row => {
      return Object.values(row).some(val => 
        String(val).toLowerCase().includes(filterValue.toLowerCase())
      );
    });
    
    setFilteredResults(filtered);
  }, [results, filterValue]);
  
  // Apply sorting to filtered results
  useEffect(() => {
    if (!sortConfig.key || !filteredResults.length) return;
    
    const sortedResults = [...filteredResults].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      
      // Check if values are numbers
      const numA = Number(valA);
      const numB = Number(valB);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
      }
      
      // String comparison for non-numbers
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      
      if (strA < strB) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (strA > strB) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
    
    setFilteredResults(sortedResults);
  }, [sortConfig]);
  
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
        fetchDatabaseStats(response.data.session_id);
      }
      
      showNotification("Database uploaded successfully!");
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.response?.data?.error || "Upload failed. Check file format and try again.");
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
        
        // Set the default table in prompt builder
        if (response.data.tables.length > 0) {
          const mainTable = response.data.tables.find(t => t.name !== 'sqlite_sequence') || response.data.tables[0];
          setPromptTemplate(prev => ({...prev, table: mainTable.name}));
        }
        
        // Generate better examples based on the schema
        const newExamples = generateExamples(response.data.tables);
        if (newExamples.length > 0) {
          setExamples(newExamples);
        }
      }
    } catch (err) {
      console.error("Schema fetch error:", err);
      showNotification("Failed to fetch database schema", "error");
    }
  };
  
  const fetchDatabaseStats = async (sid) => {
    try {
      const response = await axios.get(`http://localhost:8000/database-stats/${sid}`);
      if (response.data.success) {
        setDbStats(response.data.stats);
      }
    } catch (err) {
      console.error("Database stats fetch error:", err);
      // Fallback with mock data if endpoint doesn't exist
      setDbStats({
        size: file?.size || 0,
        tables: dbSchema.length,
        totalRows: "Unknown",
        lastModified: file?.lastModified ? new Date(file.lastModified).toLocaleString() : "Unknown"
      });
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
      
      // If we have multiple tables, suggest a join
      if (tables.length > 1) {
        const secondTable = tables.find(t => t.name !== mainTable.name && t.name !== 'sqlite_sequence') || tables[1];
        examples.push(`Join ${mainTable.name} with ${secondTable.name} and show matching records`);
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
    setSqlExplanation("");
    
    try {
      const response = await axios.post("http://localhost:8000/generate-sql", {
        query,
        session_id: sessionId,
      });
      
      setSql(response.data.sql);
      setResults(response.data.results || []);
      setFilteredResults(response.data.results || []);
      setError("");
      
      // Add to history
      const newHistoryItem = {
        query,
        sql: response.data.sql,
        timestamp: new Date().toISOString(),
        rowCount: (response.data.results || []).length
      };
      
      const updatedHistory = [newHistoryItem, ...queryHistory].slice(0, 20);
      setQueryHistory(updatedHistory);
      localStorage.setItem('nlsql_history', JSON.stringify(updatedHistory));
      
      // Try to get SQL explanation
      try {
        const explainResponse = await axios.post("http://localhost:8000/explain-sql", {
          sql: response.data.sql,
          session_id: sessionId,
        });
        
        if (explainResponse.data.explanation) {
          setSqlExplanation(explainResponse.data.explanation);
        }
      } catch (explainErr) {
        console.error("SQL explanation error:", explainErr);
        // No explanation available - this is optional
      }
      
      showNotification("SQL generated successfully!");
    } catch (err) {
      console.error("Query error:", err);
      setError(err.response?.data?.error || "Error generating SQL. See console for details.");
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
    queryInputRef.current?.focus();
  };

  const useHistoryItem = (item) => {
    setQuery(item.query);
    setSql(item.sql);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('nlsql_theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const buildPrompt = () => {
    let built = "";
    
    if (promptTemplate.action) {
      built += promptTemplate.action;
    }
    
    if (promptTemplate.modifier) {
      built += ` ${promptTemplate.modifier}`;
    }
    
    if (promptTemplate.table) {
      built += ` from ${promptTemplate.table}`;
    }
    
    if (promptTemplate.joinTable && promptTemplate.joinCondition) {
      built += ` join ${promptTemplate.joinTable} on ${promptTemplate.joinCondition}`;
    }
    
    if (promptTemplate.condition) {
      built += ` where ${promptTemplate.condition}`;
    }
    
    if (promptTemplate.groupBy) {
      built += ` group by ${promptTemplate.groupBy}`;
    }
    
    if (promptTemplate.orderBy) {
      built += ` order by ${promptTemplate.orderBy}`;
    }
    
    if (promptTemplate.limit) {
      built += ` limit ${promptTemplate.limit}`;
    }
    
    setQuery(built.trim());
    setShowPromptBuilder(false);
    queryInputRef.current?.focus();
  };

  // Export results to CSV
  const exportToCSV = () => {
    if (!filteredResults.length) return;
    
    const headers = Object.keys(filteredResults[0]);
    const csvData = [
      headers.join(','),
      ...filteredResults.map(row => headers.map(key => JSON.stringify(row[key])).join(','))
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
  
  const clearHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('nlsql_history');
    showNotification("History cleared!");
  };
  
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Notification Toast */}
      {notification.show && (
        <div className={`fixed top-4 right-4 p-4 rounded-md shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${
          notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}
      
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-full w-64 transition-all duration-300 transform ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      } shadow-lg z-10`}>
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-6">NLtoSQL AI</h1>
          
          {/* Database Upload Section */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              Database
            </h2>
            <label className={`flex items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              theme === 'dark' 
                ? 'border-gray-600 hover:border-blue-500 bg-gray-700 hover:bg-gray-600' 
                : 'border-gray-300 hover:border-blue-500 bg-gray-50 hover:bg-gray-100'
            } mb-2`}>
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                <span className="mt-2 text-sm">
                  {file ? file.name : "Select a database"}
                </span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".csv,.txt,.xls,.xlsx,.db,.sqlite,.sqlite3"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </div>
            </label>
            
            <button
              onClick={handleFileUpload}
              disabled={isLoading || !file}
              className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-all ${
                isLoading || !file
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLoading ? "Uploading..." : "Upload Database"}
            </button>
            
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="w-full mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
          </div>
          
          {/* Schema Browser */}
          <div className="mb-6">
            <button 
              onClick={() => setIsSchemaOpen(!isSchemaOpen)}
              className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2"
            >
              <span>Database Schema</span>
              <span>{isSchemaOpen ? '−' : '+'}</span>
            </button>
            
            {isSchemaOpen && dbSchema.length > 0 && (
              <div className={`p-2 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                {dbSchema.map((table) => (
                  <div key={table.name} className="mb-2">
                    <div className="font-medium">{table.name}</div>
                    <ul className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                      {table.columns.map((column) => (
                        <li key={column.name}>
                          {column.name} <span className="opacity-70">({column.type})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            
            {isSchemaOpen && dbSchema.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                No schema available. Upload a database first.
              </div>
            )}
          </div>
          
          {/* History */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                <span>Query History</span>
              </button>
              <div>
                <button 
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className="text-gray-500 dark:text-gray-400 mr-2"
                >
                  {isHistoryOpen ? '−' : '+'}
                </button>
                {queryHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            {isHistoryOpen && queryHistory.length > 0 && (
              <div className={`max-h-64 overflow-y-auto text-sm rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                {queryHistory.map((item, index) => (
                  <div 
                    key={index} 
                    className="p-2 border-b dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
                    // eslint-disable-next-line react-hooks/rules-of-hooks
                    onClick={() => useHistoryItem(item)}
                  >
                    <div className="font-medium truncate">{item.query}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {isHistoryOpen && queryHistory.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                No query history yet.
              </div>
            )}
          </div>
          
          {/* Settings */}
          <div className="fixed bottom-0 left-0 w-64 p-4 border-t dark:border-gray-700">
            <button 
              onClick={toggleTheme} 
              className={`flex items-center justify-center w-full p-2 rounded-lg ${
                theme === 'dark' 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <span className="mr-2">{theme === 'dark' ? '🌞' : '🌙'}</span>
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="ml-64 flex-1 flex flex-col">
        {/* Header */}
        <header className={`flex items-center justify-between px-6 py-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
          <div>
            {sessionId ? (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Connected to database</span>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-gray-400 mr-2"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">No database connected</span>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {sessionId && dbSchema.length > 0 && (
              <span>{dbSchema.length} tables • {filteredResults.length} rows</span>
            )}
          </div>
        </header>
        
        {/* Main Query Area */}
        <div className="flex-1 p-6">
          {/* Query Input */}
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg mb-6`}>
            <div className="p-4">
              <div className="mb-2 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Ask in natural language</h2>
                <button
                  onClick={() => setShowPromptBuilder(!showPromptBuilder)}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {showPromptBuilder ? "Hide Query Builder" : "Show Query Builder"}
                </button>
              </div>
              
              <div className="relative">
                <textarea
                  ref={queryInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a question about your data in natural language..."
                  className={`w-full p-4 text-lg border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                  rows={4}
                />
                <button
                  onClick={handleQuerySubmit}
                  disabled={isLoading || !sessionId}
                  className={`absolute bottom-4 right-4 p-2 rounded-full transition-colors ${
                    isLoading || !sessionId
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Examples */}
              <div className="mt-4">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Examples:</div>
                <div className="flex flex-wrap gap-2">
                  {examples.slice(0, 4).map((example, index) => (
                    <button
                      key={index}
                      // eslint-disable-next-line react-hooks/rules-of-hooks
                      onClick={() => { useExample(example); }}
                      className={`px-3 py-1 rounded-full text-xs ${
                        theme === 'dark'
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Query Builder */}
              {showPromptBuilder && (
                <div className={`mt-4 p-4 border rounded-lg ${
                  theme === 'dark' ? 'border-gray-700 bg-gray-700' : 'border-gray-200 bg-gray-50'
                }`}>
                  <h3 className="font-medium mb-3">Query Builder</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Action</label>
  <select
    value={promptTemplate.action}
    onChange={(e) => setPromptTemplate(prev => ({...prev, action: e.target.value}))}
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white' 
        : 'bg-white border-gray-300 text-gray-900'
    }`}
  >
    <option value="show">Show/Select</option>
    <option value="count">Count</option>
    <option value="find">Find</option>
    <option value="calculate">Calculate</option>
    <option value="summarize">Summarize</option>
  </select>
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Modifier</label>
  <input
    type="text"
    value={promptTemplate.modifier}
    onChange={(e) => setPromptTemplate(prev => ({...prev, modifier: e.target.value}))}
    placeholder="all, average, sum, etc."
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From Table</label>
  <select
    value={promptTemplate.table}
    onChange={(e) => setPromptTemplate(prev => ({...prev, table: e.target.value}))}
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white' 
        : 'bg-white border-gray-300 text-gray-900'
    }`}
  >
    <option value="">Select a table</option>
    {dbSchema.map(table => (
      <option key={table.name} value={table.name}>{table.name}</option>
    ))}
  </select>
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Where Condition</label>
  <input
    type="text"
    value={promptTemplate.condition}
    onChange={(e) => setPromptTemplate(prev => ({...prev, condition: e.target.value}))}
    placeholder="column > value, etc."
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Join Table</label>
  <select
    value={promptTemplate.joinTable}
    onChange={(e) => setPromptTemplate(prev => ({...prev, joinTable: e.target.value}))}
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white' 
        : 'bg-white border-gray-300 text-gray-900'
    }`}
  >
    <option value="">No join</option>
    {dbSchema.map(table => (
      <option key={table.name} value={table.name}>{table.name}</option>
    ))}
  </select>
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Join Condition</label>
  <input
    type="text"
    value={promptTemplate.joinCondition}
    onChange={(e) => setPromptTemplate(prev => ({...prev, joinCondition: e.target.value}))}
    placeholder="table1.id = table2.id"
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group By</label>
  <input
    type="text"
    value={promptTemplate.groupBy}
    onChange={(e) => setPromptTemplate(prev => ({...prev, groupBy: e.target.value}))}
    placeholder="column name"
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Order By</label>
  <input
    type="text"
    value={promptTemplate.orderBy}
    onChange={(e) => setPromptTemplate(prev => ({...prev, orderBy: e.target.value}))}
    placeholder="column name ASC/DESC"
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>

<div>
  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Limit</label>
  <input
    type="text"
    value={promptTemplate.limit}
    onChange={(e) => setPromptTemplate(prev => ({...prev, limit: e.target.value}))}
    placeholder="number"
    className={`w-full p-2 rounded text-sm ${
      theme === 'dark' 
        ? 'bg-gray-600 border-gray-600 text-white placeholder-gray-400' 
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }`}
  />
</div>
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={buildPrompt}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                    >
                      Build Query
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Results Area */}
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg`}>
            {/* Tab Navigation */}
            <div className="flex border-b dark:border-gray-700">
              <button
                onClick={() => setActiveTab('results')}
                className={`px-4 py-3 text-sm font-medium ${
                  activeTab === 'results'
                    ? theme === 'dark'
                      ? 'border-b-2 border-blue-500 text-blue-500'
                      : 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                Results
              </button>
              <button
                onClick={() => setActiveTab('sql')}
                className={`px-4 py-3 text-sm font-medium ${
                  activeTab === 'sql'
                    ? theme === 'dark'
                      ? 'border-b-2 border-blue-500 text-blue-500'
                      : 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                SQL Query
              </button>
              <button
                onClick={() => setActiveTab('explanation')}
                className={`px-4 py-3 text-sm font-medium ${
                  activeTab === 'explanation'
                    ? theme === 'dark'
                      ? 'border-b-2 border-blue-500 text-blue-500'
                      : 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                Explanation
              </button>
            </div>
            
            {/* Results Tab */}
            <div className={activeTab === 'results' ? 'block' : 'hidden'}>
              {filteredResults.length > 0 ? (
                <>
                  {/* Results Controls */}
                  <div className="p-4 flex flex-wrap justify-between items-center border-b dark:border-gray-700">
                    <div className="mb-2 sm:mb-0">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {filteredResults.length} rows
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={filterValue}
                          onChange={(e) => setFilterValue(e.target.value)}
                          placeholder="Filter results..."
                          className={`pl-8 pr-4 py-1 text-sm rounded ${
                            theme === 'dark'
                              ? 'bg-gray-700 text-white placeholder-gray-400'
                              : 'bg-gray-100 text-gray-900 placeholder-gray-500'
                          }`}
                        />
                        <svg className="w-4 h-4 absolute left-2.5 top-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                      </div>
                      
                      <button
                        onClick={exportToCSV}
                        className={`px-3 py-1 text-xs rounded ${
                          theme === 'dark'
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        Export CSV
                      </button>
                    </div>
                  </div>
                  
                  {/* Results Table */}
                  <div className="overflow-x-auto" ref={resultsRef}>
                    <table className="w-full">
                      <thead className={theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                          {Object.keys(filteredResults[0]).map((key) => (
                            <th
                              key={key}
                              onClick={() => requestSort(key)}
                              className={`px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer`}
                            >
                              <div className="flex items-center space-x-1">
                                <span>{key}</span>
                                {sortConfig.key === key && (
                                  <span>
                                    {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className={`${
                              rowIndex % 2 === 0
                                ? theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                                : theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50'
                            } hover:bg-gray-100 dark:hover:bg-gray-700`}
                          >
                            {Object.entries(row).map(([, value], cellIndex) => (
                              <td key={cellIndex} className="px-4 py-2 text-sm whitespace-nowrap">
                                {value === null ? (
                                  <span className="text-gray-400">NULL</span>
                                ) : typeof value === 'boolean' ? (
                                  String(value)
                                ) : (
                                  String(value)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  {isLoading ? (
                    <div className="flex flex-col items-center">
                      <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-gray-500 dark:text-gray-400">Processing your query...</span>
                    </div>
                  ) : error ? (
                    <div className="text-red-500">{error}</div>
                  ) : (
                    <div className="text-gray-500 dark:text-gray-400">
                      {sessionId ? "Run a query to see results" : "Upload a database and run a query to see results"}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* SQL Tab */}
            <div className={activeTab === 'sql' ? 'block p-4' : 'hidden'}>
              {sql ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">Generated SQL</h3>
                    <button
                      onClick={() => copyToClipboard(sql)}
                      className={`px-2 py-1 text-xs rounded ${
                        theme === 'dark'
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      Copy
                    </button>
                  </div>
                  <pre className={`p-4 rounded overflow-x-auto ${
                    theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {sql}
                  </pre>
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center">
                  {isLoading ? "Generating SQL..." : "Run a query to see the generated SQL"}
                </div>
              )}
            </div>
            
            {/* Explanation Tab */}
            <div className={activeTab === 'explanation' ? 'block p-4' : 'hidden'}>
              {sqlExplanation ? (
                <div className={`p-4 rounded ${
                  theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                }`}>
                  {sqlExplanation}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center">
                  {isLoading ? "Generating explanation..." : "Run a query to see an explanation"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NLtoSQL;