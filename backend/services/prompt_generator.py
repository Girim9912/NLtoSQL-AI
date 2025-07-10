import json
from typing import Dict, Any, List

class PromptGenerator:
    """Generates enhanced prompts for LLMs based on database schema and user queries."""

    def generate_sql_prompt(self, user_query: str, schema_info: Dict[str, Any]) -> str:
        """
        Generates a detailed prompt for the LLM to convert natural language to SQL.
        Includes database schema and sample data.
        """
        
        # Build schema description
        schema_parts = []
        for table in schema_info['tables']:
            table_name = table['name']
            columns = table['columns']
            row_count = table['row_count']
            
            column_descriptions = []
            for col in columns:
                col_desc = f"- {col['name']} ({col['type']}"
                if col['not_null']:
                    col_desc += ", NOT NULL"
                if col['primary_key']:
                    col_desc += ", PRIMARY KEY"
                col_desc += ")"
                column_descriptions.append(col_desc)
            
            table_desc = f"Table '{table_name}' with {row_count} rows:\n" + "\n".join(column_descriptions)
            
            # Add sample data if available and not empty
            if table_name in schema_info['sample_data'] and schema_info['sample_data'][table_name]:
                sample_data_str = json.dumps(schema_info['sample_data'][table_name][:2], indent=2) # Take first 2 rows
                table_desc += f"\n  Sample data (first 2 rows):\n{sample_data_str}"
            
            schema_parts.append(table_desc)
        
        full_schema_description = "\n\n".join(schema_parts)
        
        prompt = f"""You are an expert SQLite SQL developer. Your task is to generate a precise SQL query based on the user's natural language question and the provided database schema.

DATABASE SCHEMA:
{full_schema_description}

NATURAL LANGUAGE QUESTION: {user_query}

REQUIREMENTS FOR SQL QUERY:
- Generate ONLY the SQLite SQL query.
- DO NOT include any explanations, markdown formatting (like ```sql), or comments.
- Ensure the query uses valid SQLite syntax.
- Match column names exactly, paying attention to case sensitivity if applicable in SQLite (though typically case-insensitive for names unless quoted).
- Use appropriate WHERE, GROUP BY, ORDER BY, JOIN clauses as needed.
- For aggregate functions (e.g., COUNT, SUM, AVG), always include a GROUP BY clause if grouping by other columns.
- Handle NULL values appropriately.
- Only generate SELECT statements. Do NOT generate INSERT, UPDATE, DELETE, CREATE, ALTER, or DROP statements.

SQL Query:"""
        
        return prompt