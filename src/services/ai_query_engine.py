import os
import json
import hashlib
import pandas as pd
from datetime import datetime
from functools import lru_cache
from typing import Optional, Dict, Any
from openai import OpenAI
from google.oauth2 import service_account
from googleapiclient.discovery import build

class SmartQueryEngine:
    # จำกัดจำนวนแถวสูงสุดที่จะส่งให้ LLM เพื่อป้องกัน Token Overflow
    MAX_CONTEXT_ROWS = 30 
    MAX_CHARS_PER_CONTEXT = 8000 

    def __init__(self):
        self.client = OpenAI()
        self.spreadsheet_ids = {
            'main': os.environ.get('GOOGLE_SPREADSHEET_ID'),
            'monthly': os.environ.get('MONTHLY_SPREADSHEET_ID'),
            'debt': os.environ.get('DEBT_SPREADSHEET_ID')
        }
        self.creds = self._get_credentials()
        self.service = build('sheets', 'v4', credentials=self.creds)
        
        # Model configuration via Env with fallback
        self.planner_model = os.environ.get("PLANNER_MODEL", "gpt-4o-mini")
        self.answer_model = os.environ.get("ANSWER_MODEL", "gpt-4o")

    def _get_credentials(self):
        """Handle credentials securely with better newline normalization."""
        private_key = os.environ.get('GOOGLE_PRIVATE_KEY', '')
        email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        
        if not private_key or not email:
            raise ValueError("Missing GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL")
            
        # Normalize newlines robustly for both local and container environments
        normalized_key = private_key.replace("\\n", "\n").strip()
        
        info = {
            "type": "service_account",
            "project_id": os.environ.get("GCP_PROJECT_ID", "manus-project"),
            "private_key": normalized_key,
            "client_email": email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        return service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
        )

    @lru_cache(maxsize=32)
    def _get_sheet_data(self, spreadsheet_id: str, range_name: str) -> pd.DataFrame:
        """Cached sheet data fetcher to reduce API quota usage."""
        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id, range=range_name
            ).execute()
            
            values = result.get('values', [])
            if not values:
                return pd.DataFrame()
            return pd.DataFrame(values[1:], columns=values[0])
        except Exception as e:
            print(f"[ERROR] Fetching {spreadsheet_id}/{range_name}: {e}")
            return pd.DataFrame()

    def _prepare_context(self, df: pd.DataFrame, source_label: str) -> str:
        """Safely truncate dataframe to fit within token limits."""
        if df.empty:
            return ""
            
        # Limit rows and convert to string
        truncated_df = df.tail(self.MAX_CONTEXT_ROWS)
        context_str = f"Data from {source_label}:\n{truncated_df.to_string(index=False)}"
        
        # Hard character limit safety net
        if len(context_str) > self.MAX_CHARS_PER_CONTEXT:
            context_str = context_str[:self.MAX_CHARS_PER_CONTEXT] + "\n... [TRUNCATED DUE TO LENGTH]"
            
        return context_str

    def analyze_query(self, query_text: str) -> Dict[str, Any]:
        prompt = f"""You are an expert financial data analyst. Current date: {datetime.now().strftime('%d/%m/%Y')}
User asks: "{query_text}"

Available spreadsheets:
1. 'main': รายรับ-รายจ่าย, การลงทุน, รวมทุกชีต
2. 'monthly': รายละเอียดรายจ่ายเดือน, กำหนดจ่าย, จ่ายแล้ว
3. 'debt': หนี้สิน, จ่ายหนี้

Output JSON only:"""
        
        response = self.client.chat.completions.create(
            model=self.planner_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_schema", "json_schema": {
                "name": "query_plan",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "needs_data": {"type": "boolean"},
                        "targets": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "spreadsheet": {"type": "string", "enum": ["main", "monthly", "debt"]},
                                    "range": {"type": "string"}
                                },
                                "required": ["spreadsheet", "range"],
                                "additionalProperties": False
                            }
                        },
                        "reasoning": {"type": "string"}
                    },
                    "required": ["needs_data", "targets", "reasoning"],
                    "additionalProperties": False
                }
            }}
        )
        
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from planner model")
        return json.loads(content)

    def execute_smart_query(self, query_text: str) -> str:
        try:
            plan = self.analyze_query(query_text)
            
            if not plan.get('needs_data'):
                return "ขออภัยครับ คำถามนี้ไม่จำเป็นต้องดึงข้อมูลจาก Spreadsheet หรือผมไม่เข้าใจบริบทครับ"

            context_parts = []
            for target in plan['targets']:
                sid = self.spreadsheet_ids.get(target['spreadsheet'])
                if not sid:
                    continue
                    
                df = self._get_sheet_data(sid, target['range'])
                safe_context = self._prepare_context(df, f"{target['spreadsheet']} ({target['range']})")
                if safe_context:
                    context_parts.append(safe_context)

            if not context_parts:
                return "ไม่พบข้อมูลที่เกี่ยวข้องใน Google Sheets ครับ กรุณาตรวจสอบชื่อชีตหรือช่วงข้อมูลอีกครั้ง"

            answer_prompt = f"""User Query: "{query_text}"
Current Date: {datetime.now().strftime('%d/%m/%Y')}

Data Context:
{chr(10).join(context_parts)}

Instructions:
- Answer accurately in Thai based ONLY on the provided data.
- If asking about "working days", look for "ค่าแรง" in income items.
- Be concise, professional, and cite specific numbers when available.
- If data is insufficient, clearly state what's missing instead of guessing."""
            
            response = self.client.chat.completions.create(
                model=self.answer_model,
                messages=[{"role": "user", "content": answer_prompt}]
            )
            
            return response.choices[0].message.content or "ไม่สามารถสร้างคำตอบได้ครับ"
            
        except json.JSONDecodeError as e:
            return f"เกิดข้อผิดพลาดในการแปลผลแผนการดึงข้อมูล: {str(e)}"
        except Exception as e:
            print(f"[FATAL] Smart Query Error: {e}")
            return f"เกิดข้อผิดพลาดในระบบ: {type(e).__name__} - กรุณาลองใหม่อีกครั้ง"

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        engine = SmartQueryEngine()
        print(engine.execute_smart_query(sys.argv[1]))
    else:
        print("Usage: python smart_query.py \"คำถามของคุณ\"")
