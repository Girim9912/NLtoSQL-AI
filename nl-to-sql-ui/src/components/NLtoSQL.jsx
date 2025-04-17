import { useState, useEffect } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

function NLtoSQL() {
  const [query, setQuery] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [userDatabase, setUserDatabase] = useState(null);
  const [tableInfo, setTableInfo] = useState(null);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setQuery(transcript);
    }
  }, [transcript]);

  const handleGenerateSQL = async () => {
    try {
      const res = await axios.post('http://localhost:8000/generate-sql', { 
        query,
        database_path: userDatabase || undefined // Send the custom DB path if available
      });
      
      setGeneratedSQL(res.data.sql);
      setResults(res.data.results || []);
      setError(res.data.error || '');

      // 📝 Add to history
      setHistory(prev => [
        { nl: query, sql: res.data.sql },
        ...prev.slice(0, 9) // keep latest 10
      ]);
    } catch (err) {
      console.error(err);
      setError('Server error');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await axios.post('http://localhost:8000/upload-db', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUserDatabase(response.data.database_path);
      setTableInfo(response.data.table_info);
      // Clear previous results when switching databases
      setResults([]);
      setGeneratedSQL('');
    } catch (error) {
      console.error(error);
      setUploadError(error.response?.data?.detail || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (!browserSupportsSpeechRecognition) {
    return <p className="p-4">🎙️ Your browser does not support speech recognition.</p>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">NL to SQL Converter</h1>

      {/* File Upload Component */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <label className="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md inline-flex items-center">
            <span>{isUploading ? 'Uploading...' : '📁 Upload Your Data'}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.txt,.db,.sqlite,.sqlite3"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
          <span className="text-sm text-gray-500">
            Supports CSV, Excel, SQLite DB, and text files
          </span>
        </div>
        {uploadError && (
          <p className="text-red-500 text-sm mt-2">{uploadError}</p>
        )}
      </div>

      {/* Database Info Display */}
      {tableInfo && tableInfo.length > 0 && (
        <div className="mt-2 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">📊 Database Tables</h3>
          <div className="space-y-3">
            {tableInfo.map((table) => (
              <div key={table.name} className="bg-white p-3 rounded border">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-blue-600">{table.name}</h4>
                  <span className="text-sm text-gray-500">{table.row_count} rows</span>
                </div>
                <div className="mt-2">
                  <p className="text-sm text-gray-600 mb-1">Columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {table.columns.map((col) => (
                      <span
                        key={`${table.name}-${col.name}`}
                        className="text-xs bg-gray-100 px-2 py-1 rounded"
                      >
                        {col.name} <span className="text-gray-500">({col.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-3">
            You can now query this database using natural language.
          </p>
        </div>
      )}

      <textarea
        className="w-full border border-gray-300 p-2 rounded mb-4"
        rows="3"
        placeholder={`Ask something like: ${userDatabase ? 'Show me all records from your data' : 'List all employees hired after 2020'}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      ></textarea>

      <div className="flex gap-4 mb-4">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
          onClick={handleGenerateSQL}
        >
          Generate SQL
        </button>

        <button
          onClick={() => {
            if (listening) {
              SpeechRecognition.stopListening();
            } else {
              resetTranscript();
              SpeechRecognition.startListening({ continuous: false });
            }
          }}
          className={`px-4 py-2 rounded font-semibold ${
            listening ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          } text-white`}
        >
          {listening ? '🛑 Stop' : '🎙️ Speak'}
        </button>
      </div>

      {generatedSQL && (
        <div className="mb-4">
          <h2 className="font-semibold">Generated SQL:</h2>
          <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-wrap">{generatedSQL}</pre>
        </div>
      )}

      {error && (
        <div className="text-red-600 font-semibold mb-4">Error: {error}</div>
      )}

      {results.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <h2 className="font-semibold">Results:</h2>
          <table className="w-full mt-2 border border-collapse border-gray-300">
            <thead>
              <tr>
                {Object.keys(results[0]).map((col, idx) => (
                  <th key={idx} className="border px-2 py-1 bg-gray-200">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((val, i) => (
                    <td key={i} className="border px-2 py-1">{val !== null ? String(val) : 'NULL'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold text-lg mb-2">🕓 Query History</h2>
          <div className="bg-gray-100 p-4 rounded max-h-64 overflow-y-auto space-y-3">
            {history.map((item, idx) => (
              <div key={idx} className="bg-white p-2 rounded border shadow-sm hover:bg-blue-50 transition cursor-pointer"
                onClick={() => setQuery(item.nl)}
              >
                <p className="font-medium">🗣️ {item.nl}</p>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">💾 {item.sql}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NLtoSQL;