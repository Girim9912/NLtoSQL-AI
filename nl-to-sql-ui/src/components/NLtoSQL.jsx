import React, { useState } from "react";
import axios from "axios";
import background from "~\nl-to-sql-ui\src\assets\bg.png";

export default function NLtoSQL() {
  const [file, setFile] = useState(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleQueryChange = (e) => {
    setQuery(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !query) {
      alert("Please upload a file and enter a query.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("query", query);

      const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const result = await axios.post(`${BASE_URL}/generate_sql`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setResponse(result.data.sql);
    } catch (err) {
      setError("An error occurred while generating SQL.");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center flex items-center justify-center p-4"
      style={{ backgroundImage: `url(${background})` }}
    >
      <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg p-8 max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
          NL to SQL Converter
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt,.sqlite"
            onChange={handleFileChange}
            className="block w-full border border-gray-300 rounded px-4 py-2"
          />
          <input
            type="text"
            placeholder="Enter your natural language query"
            value={query}
            onChange={handleQueryChange}
            className="block w-full border border-gray-300 rounded px-4 py-2"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-semibold px-4 py-2 rounded hover:bg-blue-700 transition"
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate SQL"}
          </button>
        </form>

        {response && (
          <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-800 rounded">
            <strong>Generated SQL:</strong>
            <pre className="whitespace-pre-wrap mt-2">{response}</pre>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-800 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
