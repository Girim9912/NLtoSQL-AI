python
import openai
import os

openai.api_key = os.getenv("OPENAI_API_KEY")

def generate_sql(prompt: str) -> str:
try:
response = openai.ChatCompletion.create(
model="gpt-4", # or gpt-3.5-turbo
messages=[
{"role": "system", "content": "You are a helpful assistant that converts natural language to SQL."},
{"role": "user", "content": prompt}
],
temperature=0.2,
max_tokens=200
)
return response['choices'][0]['message']['content'].strip()
except Exception as e:
return f"Error: {str(e)}"