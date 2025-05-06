# NLtoSQL-AI

AI-powered web application that translates **natural language queries into SQL**, with support for **voice input**, **schema detection**, and **interactive results** — all in a sleek and modern interface.

## 🌐 Live Demo

Check out the live version here: [https://portfolio-giri.vercel.app/nltosql](https://portfolio-giri.vercel.app/nltosql)

## 🧠 Overview

NLtoSQL-AI empowers users to query their databases in plain English (or speech), eliminating the need to know SQL syntax. It's built for analysts, developers, and business users alike.

## ✨ Features

- 🧾 **Natural Language to SQL** — Enter a question in plain English, get a valid SQL query.
- 🎙️ **Voice Input Support** — Query your database by speaking.
- 🧮 **Real-Time Query Execution** — Run SQL on uploaded datasets instantly.
- 📊 **Smart Results Viewer** — Interactive and readable display of your query outputs.
- 🧠 **Schema Detection** — Auto extracts table schema from uploaded files.
- 🎨 **Modern UI** — Responsive, full-screen background, refined font, and clean layout.

## 🚀 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: FastAPI (Python)
- **AI/NLP**: LLaMA-3 via DeepInfra API
- **Other Tools**: Hugging Face, SQLGlot, Web Speech API

## 🧪 Project Status

✅ UI Redesign Complete  
✅ Backend Connected with LLaMA-3  
✅ File Upload & Schema Extraction  
✅ Live Demo Embedded in Portfolio  
🛠️ Upcoming: Multi-table joins, query history, and CSV download

## 📦 Setup Instructions

### Prerequisites

- Node.js + npm  
- Python 3.8+  
- DeepInfra API Key (for model inference)

### Backend Setup

```bash
cd backend
python -m venv venv
# Activate the venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
pip install -r requirements.txt
# Add .env with your DeepInfra key
python main.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## 💡 Usage

1. Upload your CSV, Excel, TXT, or SQLite file.
2. Type or speak your question (e.g., "Show me the top 5 customers by revenue").
3. View the generated SQL and result table.
4. Optionally modify the SQL manually and re-run.

## 👤 About the Developer

Built by **Giri Merugu** as part of an entrepreneurial self-employment OPT project after completing a Master’s in Data Science.

## 📄 License

[MIT License](LICENSE)