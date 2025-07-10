import os
import shutil
import sqlite3
import pandas as pd
import uuid
import logging
from typing import Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages database operations including file processing, schema extraction, and query execution."""
    
    def __init__(self, temp_dir: str = 'temp'):
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)
        # In-memory map to store database paths associated with session IDs
        self.session_db_map: Dict[str, Dict[str, Any]] = {}

    def create_database_from_file(self, temp_file_path: str, original_filename: str) -> str:
        """
        Processes an uploaded file, converts it to a SQLite database,
        and associates it with a new session ID.
        """
        session_id = str(uuid.uuid4())
        file_ext = original_filename.split(".")[-1].lower()
        
        sqlite_path = os.path.join(self.temp_dir, f"{session_id}.db")
        
        try:
            if file_ext in ["csv", "txt", "xlsx", "xls"]:
                self._convert_to_sqlite(temp_file_path, sqlite_path, file_ext)
            elif file_ext == "db": # If it's already a SQLite DB, copy it
                shutil.copy(temp_file_path, sqlite_path)
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
            
            self.session_db_map[session_id] = {
                'db_path': sqlite_path,
                'created_at': datetime.now(),
                'original_filename': original_filename
            }
            logger.info(f"Created database for session {session_id} from {original_filename}")
            return session_id
        except Exception as e:
            logger.error(f"Error creating database from file {original_filename}: {e}")
            # Clean up partial files if creation failed
            if os.path.exists(sqlite_path):
                os.remove(sqlite_path)
            raise

    def _convert_to_sqlite(self, file_path: str, sqlite_path: str, file_ext: str):
        """Converts CSV/Excel files to a SQLite database."""
        try:
            if file_ext in ["csv", "txt"]:
                df = pd.read_csv(file_path, encoding='utf-8', on_bad_lines='skip')
            elif file_ext in ["xls", "xlsx"]:
                df = pd.read_excel(file_path)
            else:
                raise ValueError(f"Unsupported conversion format: {file_ext}")
            
            # Clean column names for SQLite compatibility
            df.columns = df.columns.str.strip().str.replace(' ', '_').str.replace(r'[^\w]', '', regex=True)
            
            conn = sqlite3.connect(sqlite_path)
            try:
                df.to_sql("data", conn, if_exists="replace", index=False)
                logger.info(f"Successfully converted {file_ext} to SQLite at {sqlite_path}")
            finally:
                conn.close()
        except Exception as e:
            logger.error(f"File conversion to SQLite failed for {file_path}: {e}")
            raise

    def get_schema_info(self, session_id: str) -> Dict[str, Any]:
        """Extracts comprehensive database schema information for a given session."""
        db_info = self.session_db_map.get(session_id)
        if not db_info:
            raise ValueError(f"No database found for session ID: {session_id}")
        
        db_path = db_info['db_path']
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            schema_info = {
                'tables': [],
                'sample_data': {}
            }
            
            tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
            
            for (table_name,) in tables:
                columns = cursor.execute(f"PRAGMA table_info({table_name});").fetchall()
                column_info = [
                    {
                        'name': col[1],
                        'type': col[2],
                        'not_null': bool(col[3]),
                        'primary_key': bool(col[5])
                    }
                    for col in columns
                ]
                
                row_count = cursor.execute(f"SELECT COUNT(*) FROM {table_name};").fetchone()[0]
                
                # Get sample data (first 3 rows)
                sample_data_cursor = cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
                column_names_for_sample = [desc[0] for desc in sample_data_cursor.description]
                sample_data_rows = sample_data_cursor.fetchall()
                
                schema_info['tables'].append({
                    'name': table_name,
                    'columns': column_info,
                    'row_count': row_count
                })
                
                schema_info['sample_data'][table_name] = [
                    dict(zip(column_names_for_sample, row)) for row in sample_data_rows
                ]
            
            return schema_info
        except sqlite3.Error as e:
            logger.error(f"Error extracting schema for session {session_id}: {e}")
            raise
        finally:
            conn.close()

    def execute_query(self, session_id: str, sql_query: str) -> Dict[str, Any]:
        """Executes a SQL query against the session's database."""
        db_info = self.session_db_map.get(session_id)
        if not db_info:
            return {"success": False, "error": f"No database found for session ID: {session_id}"}
        
        db_path = db_info['db_path']
        conn = None
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            cursor.execute(sql_query)
            
            # Fetch column names from cursor description
            columns = [description[0] for description in cursor.description] if cursor.description else []
            raw_results = cursor.fetchall()
            
            results = [
                {columns[i]: value for i, value in enumerate(row)} 
                for row in raw_results
            ]
            
            return {"success": True, "results": results, "row_count": len(results)}
        except sqlite3.Error as e:
            logger.error(f"SQL execution error for session {session_id}, query '{sql_query}': {e}")
            return {"success": False, "error": str(e)}
        finally:
            if conn:
                conn.close()

    def delete_database(self, session_id: str):
        """Deletes the database file associated with a session."""
        db_info = self.session_db_map.pop(session_id, None)
        if db_info:
            db_path = db_info['db_path']
            if os.path.exists(db_path):
                os.remove(db_path)
                logger.info(f"Deleted database file for session {session_id}: {db_path}")
            else:
                logger.warning(f"Database file for session {session_id} not found: {db_path}")
        else:
            logger.warning(f"No database record found for session {session_id} to delete.")