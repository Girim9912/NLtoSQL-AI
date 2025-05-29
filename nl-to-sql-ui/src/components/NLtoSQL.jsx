import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import backgroundImage from "../assets/BackgroundIMG.png";

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
  const [dbStats, setDbStats] = useState({
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
  const [activeTab, setActiveTab] = useState("results"); // results, visualization, explain
  const [pinnedQueries, setPinnedQueries] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [filterValue, setFilterValue] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [sqlExplanation, setSqlExplanation] = useState("");
  
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
  
  // Load history, theme and pinned queries from localStorage on initial render
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
    
    const savedPinnedQueries = localStorage.getItem('nlsql_pinned');
    if (savedPinnedQueries) {
      setPinnedQueries(JSON.parse(savedPinnedQueries));
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
      
      // Ctrl/Cmd + / to toggle keyboard shortcuts help
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowKeyboardShortcuts(prev => !prev);
      }
      
      // Ctrl/Cmd + L to focus on query input
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        queryInputRef.current?.focus();
      }
      
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowKeyboardShortcuts(false);
        setShowConnectionInfo(false);
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
      
      showNotification("Upload successful!");
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
      // This endpoint would need to be implemented on the backend
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
        examples.push(`Group records in ${mainTable.name} by a category and calculate total ${numericColumn.name}`);
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
  
  const togglePinQuery = (queryText) => {
    const index = pinnedQueries.indexOf(queryText);
    let newPinned;
    
    if (index === -1) {
      // Add to pinned
      newPinned = [...pinnedQueries, queryText];
    } else {
      // Remove from pinned
      newPinned = pinnedQueries.filter(q => q !== queryText);
    }
    
    setPinnedQueries(newPinned);
    localStorage.setItem('nlsql_pinned', JSON.stringify(newPinned));
    
    if (index === -1) {
      showNotification("Query pinned!");
    } else {
      showNotification("Query unpinned");
    }
  };
  
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const toggleFullscreen = () => {
    if (!resultsRef.current) return;
    
    if (!isFullscreen) {
      if (resultsRef.current.requestFullscreen) {
        resultsRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    
    setIsFullscreen(!isFullscreen);
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
  
  // Generate dummy visualization data
  const renderVisualization = () => {
    if (!results.length) return <div className="p-8 text-center">No data to visualize</div>;
    
    return (
      <div className="p-4 text-center">
        <div className="text-lg font-medium mb-4">Visualization placeholder</div>
        <div className="bg-gray-200 dark:bg-gray-700 h-64 rounded-lg flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">
            <p>This would display a visualization of your query results.</p>
            <p className="text-sm">Add a charting library like Chart.js or Recharts for implementation.</p>
          </div>
        </div>
      </div>
    );
  };

  const mainClass = theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white';
  const cardClass = theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 ${theme === 'dark' ? 'bg-gray-900 text-white' : ''}`}>
      {/* Theme Toggle Button */}
      <div className="absolute top-4 right-4 flex space-x-2">
        <button 
          onClick={() => setShowKeyboardShortcuts(true)}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          title="Keyboard shortcuts"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
        
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          title="Toggle theme"
        >
          {theme === 'dark' ? '🌞' : '🌙'}
        </button>

        <button 
          onClick={() => setShowConnectionInfo(!showConnectionInfo)}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          title="Database info"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
      
      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-lg shadow-xl max-w-md w-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Keyboard Shortcuts</h3>
              <button 
                onClick={() => setShowKeyboardShortcuts(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Execute Query</span>
                <span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm">Ctrl + Enter</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Focus Query Input</span>
                <span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm">Ctrl + L</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Show Shortcuts</span>
                <span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm">Ctrl + /</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Close Dialogs</span>
                <span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm">Esc</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Database Connection Info Modal */}
      {showConnectionInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-lg shadow-xl max-w-md w-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Database Information</h3>
              <button 
                onClick={() => setShowConnectionInfo(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">File Size</span>
                <span>{(dbStats.size / 1024).toFixed(2)} KB</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Tables</span>
                <span>{dbSchema.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Session ID</span>
                <span className="truncate max-w-[150px]">{sessionId || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Last Modified</span>
                <span>{dbStats.lastModified || "Unknown"}</span>
              </div>
              
              <hr className="border-gray-300 dark:border-gray-600" />
              
              <div className="pt-2">
                <h4 className="font-medium mb-2">API Endpoints</h4>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>POST /upload - Upload database file</div>
                  <div>GET /schemas/:session_id - Get database schema</div>
                  <div>POST /generate-sql - Generate and execute SQL</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Notification Toast */}
      {notification.show && (
        <div className={`fixed top-4 right-4 p-4 rounded-md shadow-md ${
          notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        } z-50`}>
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
                    accept=".csv,.txt,.xls,.xlsx,.db,.sqlite,.sqlite3"
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                </label>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Supported formats: .csv, .txt, .xls, .xlsx, .db, .sqlite, .sqlite3
                </p>
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
                File uploaded successfully! Session ID: {sessionId}
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-2 bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
        
        {/* Left Column - Query Input */}
        <div className="space-y-6">
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <h2 className="text-2xl font-bold mb-4">💬 Ask Your Question</h2>
            <div className="relative">
              <textarea
                ref={queryInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Show me the top 5 customers by total purchases"
                className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={4}
              />
              <button
                onClick={handleQuerySubmit}
                disabled={isLoading || !sessionId}
                className={`mt-4 px-4 py-2 rounded font-semibold ${
                  isLoading ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
                } text-white`}
              >
                {isLoading ? "Processing..." : "Generate SQL"}
              </button>
            </div>
            
            <div className="mt-4">
              <button
                onClick={togglePromptBuilder}
                className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {showPromptBuilder ? "Hide SQL Builder" : "Show SQL Builder"}
              </button>
              
              {showPromptBuilder && (
                <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <h3 className="font-medium mb-3">SQL Query Builder</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Action</label>
                      <select
                        value={promptTemplate.action}
                        onChange={(e) => setPromptTemplate({...promptTemplate, action: e.target.value})}
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      >
                        <option value="show">Show</option>
                        <option value="select">Select</option>
                        <option value="count">Count</option>
                        <option value="sum">Sum</option>
                        <option value="average">Average</option>
                        <option value="find">Find</option>
                        <option value="list">List</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Modifier</label>
                      <input
                        type="text"
                        value={promptTemplate.modifier}
                        onChange={(e) => setPromptTemplate({...promptTemplate, modifier: e.target.value})}
                        placeholder="e.g. distinct, top 5"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Table</label>
                      <select
                        value={promptTemplate.table}
                        onChange={(e) => setPromptTemplate({...promptTemplate, table: e.target.value})}
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      >
                        {dbSchema.map((table) => (
                          <option key={table.name} value={table.name}>{table.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Join Table</label>
                      <select
                        value={promptTemplate.joinTable}
                        onChange={(e) => setPromptTemplate({...promptTemplate, joinTable: e.target.value})}
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      >
                        <option value="">None</option>
                        {dbSchema.map((table) => (
                          <option key={table.name} value={table.name}>{table.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Join Condition</label>
                      <input
                        type="text"
                        value={promptTemplate.joinCondition}
                        onChange={(e) => setPromptTemplate({...promptTemplate, joinCondition: e.target.value})}
                        placeholder="e.g. table1.id = table2.table1_id"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                        disabled={!promptTemplate.joinTable}
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Condition (WHERE)</label>
                      <input
                        type="text"
                        value={promptTemplate.condition}
                        onChange={(e) => setPromptTemplate({...promptTemplate, condition: e.target.value})}
                        placeholder="e.g. age > 30 AND status = 'active'"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Group By</label>
                      <input
                        type="text"
                        value={promptTemplate.groupBy}
                        onChange={(e) => setPromptTemplate({...promptTemplate, groupBy: e.target.value})}
                        placeholder="e.g. department, category"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Order By</label>
                      <input
                        type="text"
                        value={promptTemplate.orderBy}
                        onChange={(e) => setPromptTemplate({...promptTemplate, orderBy: e.target.value})}
                        placeholder="e.g. created_at DESC"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Limit</label>
                      <input
                        type="number"
                        value={promptTemplate.limit}
                        onChange={(e) => setPromptTemplate({...promptTemplate, limit: e.target.value})}
                        placeholder="e.g. 10"
                        className="w-full p-2 border rounded dark:bg-gray-700"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={buildPrompt}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Build Query
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Examples Section */}
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <h2 className="text-2xl font-bold mb-4">💡 Example Queries</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {examples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => useExample(example)}
                  className="p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          
          {/* Query History */}
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">🕒 Query History</h2>
              <button
                onClick={clearHistory}
                className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={queryHistory.length === 0}
              >
                Clear All
              </button>
            </div>
            
            {queryHistory.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No queries yet</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {queryHistory.map((item, index) => (
                  <div key={index} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{item.query}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => useHistoryItem(item)}
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Use this query"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => togglePinQuery(item.query)}
                          className={`${
                            pinnedQueries.includes(item.query) 
                              ? 'text-yellow-500 hover:text-yellow-700' 
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                          title={pinnedQueries.includes(item.query) ? "Unpin query" : "Pin query"}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      <code>{item.sql}</code>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.rowCount} rows returned
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Right Column - Results */}
        <div className="space-y-6">
          {/* SQL Query Display */}
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">🔍 Generated SQL</h2>
              {sql && (
                <button
                  onClick={() => copyToClipboard(sql)}
                  className="flex items-center text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </button>
              )}
            </div>
            
            {sql ? (
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm">{sql}</pre>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No SQL generated yet</p>
            )}
            
            {sqlExplanation && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-30 rounded-lg">
                <h3 className="font-medium mb-1">SQL Explanation</h3>
                <p className="text-sm">{sqlExplanation}</p>
              </div>
            )}
          </div>
          
          {/* Results Display */}
          <div className={`shadow-xl rounded-xl p-6 ${cardClass}`} ref={resultsRef}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">📊 Results</h2>
              <div className="flex space-x-2">
                {results.length > 0 && (
                  <>
                    <button
                      onClick={exportToCSV}
                      className="flex items-center text-sm text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      Fullscreen
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {/* Results Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab("results")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "results"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Results
                </button>
                <button
                  onClick={() => setActiveTab("visualization")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "visualization"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Visualization
                </button>
                <button
                  onClick={() => setActiveTab("explain")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === "explain"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Explain
                </button>
              </nav>
            </div>
            
            {/* Tab Content */}
            <div>
              {activeTab === "results" && (
                <>
                  {results.length > 0 ? (
                    <div>
                      <div className="mb-4 flex justify-between items-center">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Showing {filteredResults.length} of {results.length} rows
                        </div>
                        <input
                          type="text"
                          placeholder="Filter results..."
                          value={filterValue}
                          onChange={(e) => setFilterValue(e.target.value)}
                          className="p-2 border rounded text-sm dark:bg-gray-700"
                        />
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                              {Object.keys(results[0]).map((key) => (
                                <th
                                  key={key}
                                  scope="col"
                                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                  onClick={() => requestSort(key)}
                                >
                                  <div className="flex items-center">
                                    {key}
                                    {sortConfig.key === key && (
                                      <span className="ml-1">
                                        {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {filteredResults.map((row, rowIndex) => (
                              <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                {Object.values(row).map((value, colIndex) => (
                                  <td key={colIndex} className="px-4 py-2 whitespace-nowrap text-sm">
                                    {value === null || value === undefined ? (
                                      <span className="text-gray-400 italic">NULL</span>
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
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">
                      {isLoading ? "Loading results..." : "No results to display"}
                    </p>
                  )}
                </>
              )}
              
              {activeTab === "visualization" && renderVisualization()}
              
              {activeTab === "explain" && (
                <div>
                  {sqlExplanation ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <h3 className="font-medium mb-2">Query Explanation</h3>
                      <p className="text-sm">{sqlExplanation}</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">
                      {sql ? "No explanation available" : "Generate a query first to see its explanation"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <footer className="mt-12 mb-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>NLtoSQL AI Converter - Convert natural language to SQL queries with AI</p>
        <p className="mt-1">Built with React, FastAPI, and OpenAI</p>
      </footer>
    </div>
  );
}

export default NLtoSQL;