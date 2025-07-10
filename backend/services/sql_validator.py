import sqlparse
import logging
import re
from typing import Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class SQLValidator:
    """Provides utilities for validating and formatting SQL queries."""

    def __init__(self):
        # Keywords that are not allowed for security reasons (data modification)
        self.dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE', 'ATTACH', 'DETACH', 'PRAGMA']
    
    def validate_sql(self, sql_query: str) -> Dict[str, Any]:
        """
        Validates a SQL query for syntax, dangerous operations, and ensures it's a SELECT query.
        Returns a dictionary with 'valid' (bool) and 'error' (str) if invalid.
        """
        sql_query_upper = sql_query.upper()

        # 1. Check for dangerous keywords
        for keyword in self.dangerous_keywords:
            if keyword in sql_query_upper:
                # Allow SELECT statements that might contain 'CREATE' in a string or comment,
                # but block if it's clearly a DDL/DML operation.
                # This simple check might need more sophistication for edge cases, 
                # but covers basic protection.
                if keyword != 'SELECT' and not sql_query_upper.startswith("SELECT") and keyword in sql_query_upper:
                    logger.warning(f"Blocked query due to dangerous keyword: {keyword} in '{sql_query}'")
                    return {"valid": False, "error": f"Query contains potentially dangerous keyword: '{keyword}'. Only SELECT queries are allowed."}

        # 2. Ensure it's primarily a SELECT query
        if not sql_query_upper.strip().startswith("SELECT"):
            logger.warning(f"Blocked non-SELECT query: '{sql_query}'")
            return {"valid": False, "error": "Only SELECT queries are allowed."}
        
        # 3. Validate SQL syntax using sqlparse
        try:
            parsed_statements = sqlparse.parse(sql_query)
            if not parsed_statements:
                return {"valid": False, "error": "No SQL statements found."}
            
            # Optionally, you can add more complex checks based on parsed statements
            # For now, simply parsing successfully is a good indicator of basic syntax.
            
            formatted_sql = sqlparse.format(sql_query, reindent=True, keyword_case='upper')
            return {"valid": True, "formatted": formatted_sql}
        except Exception as e:
            logger.warning(f"SQL syntax validation failed: {e} for query '{sql_query}'")
            return {"valid": False, "error": f"SQL syntax error: {str(e)}"}