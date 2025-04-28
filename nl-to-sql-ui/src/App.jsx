let's go provide me the code so that I can update the changes back to git// src/App.jsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Mic, Loader2 } from "lucide-react";
import axios from "axios";

function App() {
  const [query, setQuery] = useState("");
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [dbFile, setDbFile] = useState(null);
  const [history, setHistory] = useState([]);

  const handleGenerateSQL = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:8000/generate-sql", {
        query,
      });
      setSql(res.data.sql);
      setResults(res.data.results || []);
      setHistory((prev) => [...prev, { nl: query, sql: res.data.sql }]);
    } catch (err) {
      console.error(err);
      setSql("-- Error generating SQL");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDbFile(file);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post("http://localhost:8000/upload-db", formData);
      alert("Database uploaded successfully!");
    } catch (err) {
      console.error(err);
      alert("Error uploading database");
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        <h1 className="text-3xl font-bold text-center">NLtoSQL Converter 🚀</h1>

        <div className="space-y-4">
          <Input
            placeholder="Describe your query in English..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="flex space-x-2">
            <Button onClick={handleGenerateSQL} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Generate SQL"}
            </Button>
            <Button variant="secondary">
              <Mic className="h-5 w-5" />
            </Button>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium">Upload DB/CSV/Excel:</label>
            <Input type="file" onChange={handleUpload} />
          </div>
        </div>

        <Card className="p-4">
          <CardContent>
            <h2 className="font-semibold mb-2">Generated SQL:</h2>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
              {sql || "-- Your generated SQL will appear here"}
            </pre>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent>
            <h2 className="font-semibold mb-2">Query Results:</h2>
            {results.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {Object.keys(results[0]).map((col) => (
                      <th key={col} className="border px-2 py-1 text-left">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, idx2) => (
                        <td key={idx2} className="border px-2 py-1">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No data available yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent>
            <h2 className="font-semibold mb-2">🕓 Query History</h2>
            <ul className="list-disc list-inside space-y-2">
              {history.map((h, idx) => (
                <li key={idx}>
                  <strong>🗣️ {h.nl}</strong>
                  <br />
                  <span className="text-xs text-gray-600">💾 {h.sql}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default App;
