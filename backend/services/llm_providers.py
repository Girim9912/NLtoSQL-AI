import os
import aiohttp
import logging
import re
from abc import ABC, abstractmethod
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers."""
    
    def __init__(self, api_key: str, name: str):
        self.api_key = api_key
        self.name = name
        
    @abstractmethod
    async def generate_sql(self, prompt: str) -> Dict[str, Any]:
        """Generates SQL from a given prompt."""
        pass
    
    @staticmethod
    def clean_sql(sql_text: str) -> str:
        """Clean and extract SQL from LLM response."""
        # Remove markdown formatting (e.g., ```sql\n ... \n```)
        sql_text = re.sub(r'```sql\n?', '', sql_text, flags=re.IGNORECASE)
        sql_text = re.sub(r'```\n?', '', sql_text)
        
        # Remove common prefixes (e.g., "SQL Query:", "Query:", "SQL:")
        sql_text = re.sub(r'^(SQL Query:|Query:|SQL:)\s*', '', sql_text, flags=re.IGNORECASE)
        
        # Extract the actual SQL query, ignoring comments
        lines = sql_text.strip().split('\n')
        sql_lines = []
        
        for line in lines:
            line = line.strip()
            if line and not line.startswith('--') and not line.startswith('#'):
                sql_lines.append(line)
        
        return ' '.join(sql_lines).strip()

class OpenAIProvider(BaseLLMProvider):
    """OpenAI GPT integration."""
    def __init__(self, api_key: str):
        super().__init__(api_key, "openai")
        self.model = "gpt-4" # Or gpt-3.5-turbo, gpt-4o, etc.

    async def generate_sql(self, prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"success": False, "error": "OpenAI API key not configured"}
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an expert SQL developer. Generate only valid SQLite queries without explanations or formatting."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 500
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post("https://api.openai.com/v1/chat/completions", 
                                       headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        sql = result["choices"][0]["message"]["content"].strip()
                        return {"success": True, "sql": self.clean_sql(sql), "model": self.model, "provider": self.name}
                    else:
                        error_text = await response.text()
                        logger.error(f"OpenAI API error ({response.status}): {error_text}")
                        return {"success": False, "error": f"OpenAI API error: {error_text}"}
        except aiohttp.ClientError as e:
            logger.error(f"OpenAI network error: {e}")
            return {"success": False, "error": f"OpenAI network error: {str(e)}"}
        except Exception as e:
            logger.error(f"OpenAI unexpected error: {e}")
            return {"success": False, "error": str(e)}

class DeepInfraProvider(BaseLLMProvider):
    """DeepInfra API integration."""
    def __init__(self, api_key: str):
        super().__init__(api_key, "deepinfra")
        self.model = "meta-llama/Meta-Llama-3-70B-Instruct" # Or another DeepInfra supported model

    async def generate_sql(self, prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"success": False, "error": "DeepInfra API key not configured"}
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        url = "https://api.deepinfra.com/v1/openai/chat/completions"
        data = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an expert SQL developer. Generate only valid SQLite queries without explanations or formatting."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 500
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        sql = result["choices"][0]["message"]["content"].strip()
                        return {"success": True, "sql": self.clean_sql(sql), "model": self.model, "provider": self.name}
                    else:
                        error_text = await response.text()
                        logger.error(f"DeepInfra API error ({response.status}): {error_text}")
                        return {"success": False, "error": f"DeepInfra API error: {error_text}"}
        except aiohttp.ClientError as e:
            logger.error(f"DeepInfra network error: {e}")
            return {"success": False, "error": f"DeepInfra network error: {str(e)}"}
        except Exception as e:
            logger.error(f"DeepInfra unexpected error: {e}")
            return {"success": False, "error": str(e)}

class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude integration."""
    def __init__(self, api_key: str):
        super().__init__(api_key, "anthropic")
        self.model = "claude-3-opus-20240229" # Or another Anthropic supported model

    async def generate_sql(self, prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"success": False, "error": "Anthropic API key not configured"}
        
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        
        url = "https://api.anthropic.com/v1/messages"
        data = {
            "model": self.model,
            "max_tokens": 500,
            "messages": [
                {"role": "user", "content": f"You are an expert SQL developer. Generate only valid SQLite queries without explanations or formatting. Here is the natural language query: {prompt}"}
            ],
            "temperature": 0.1
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        sql = result["content"][0]["text"].strip()
                        return {"success": True, "sql": self.clean_sql(sql), "model": self.model, "provider": self.name}
                    else:
                        error_text = await response.text()
                        logger.error(f"Anthropic API error ({response.status}): {error_text}")
                        return {"success": False, "error": f"Anthropic API error: {error_text}"}
        except aiohttp.ClientError as e:
            logger.error(f"Anthropic network error: {e}")
            return {"success": False, "error": f"Anthropic network error: {str(e)}"}
        except Exception as e:
            logger.error(f"Anthropic unexpected error: {e}")
            return {"success": False, "error": str(e)}

class LLMManager:
    """Manages multiple LLM providers with fallback logic."""
    def __init__(self):
        self.providers: Dict[str, BaseLLMProvider] = {}
        # Default fallback order, can be customized via config if needed
        self.fallback_order = ["openai", "deepinfra", "anthropic"] 

    def add_provider(self, provider: BaseLLMProvider):
        """Adds an LLM provider to the manager."""
        self.providers[provider.name] = provider
        logger.info(f"Added LLM provider: {provider.name}")

    def get_available_providers(self) -> List[str]:
        """Returns a list of names of currently available providers."""
        return list(self.providers.keys())

    async def generate_sql(self, prompt: str, preference: str = "auto") -> Dict[str, Any]:
        """
        Generates SQL using LLM providers, with optional preference and fallback.
        """
        candidate_providers: List[BaseLLMProvider] = []

        if preference != "auto" and preference in self.providers:
            candidate_providers.append(self.providers[preference])
        else: # Auto or preferred provider not found/configured
            for provider_name in self.fallback_order:
                if provider_name in self.providers:
                    candidate_providers.append(self.providers[provider_name])
        
        if not candidate_providers:
            return {"success": False, "error": "No LLM providers configured or available for the given preference."}
        
        for provider in candidate_providers:
            logger.info(f"Attempting to generate SQL using {provider.name}...")
            try:
                result = await provider.generate_sql(prompt)
                if result.get("success"):
                    logger.info(f"Successfully generated SQL using {provider.name}")
                    return result
                else:
                    logger.warning(f"{provider.name} failed: {result.get('error')}. Attempting fallback...")
            except Exception as e:
                logger.error(f"Exception calling {provider.name}: {e}. Attempting fallback...")
                continue
        
        logger.error("All LLM providers failed to generate SQL.")
        return {"success": False, "error": "All LLM providers failed to generate SQL."}