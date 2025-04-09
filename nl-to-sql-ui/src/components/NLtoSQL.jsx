import { useState } from 'react';

function NLtoSQL() {
  const [input, setInput] = useState('');
  const [sql, setSQL] = useState('');

  const handleGenerate = async () => {
    // Call backend API here (we’ll build it later)
    const response = await fetch('http://localhost:8000/generate-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input }),
    });

    const data = await response.json();
    setSQL(data.sql);
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">NL to SQL Converter</h1>
      <textarea
        className="w-full border rounded p-2"
        rows="3"
        placeholder="Type your question here..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        onClick={handleGenerate}
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Generate SQL
      </button>
      <div className="mt-4 bg-gray-100 p-2 rounded">
        <p className="text-sm text-gray-600">Generated SQL:</p>
        <pre className="text-md">{sql}</pre>
      </div>
    </div>
  );
}

export default NLtoSQL;
