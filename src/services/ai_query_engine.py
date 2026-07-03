
import os
import json
import pandas as pd
from datetime import datetime
from openai import OpenAI
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build

class SmartQueryEngine:
    def __init__(self):
        self.client = OpenAI()
        self.spreadsheet_ids = {
            'main': '1M541e-cbFTFXMc94SANX4Svi1SK4WauehhPB3i7Wnw4',
            'monthly': '1OFH68Lp0U70xAuRdpDb0QxGwOzTxX1VLwLYEnnur6Nc',
            'debt': '1yPNCTj0RF9GHcOIuwLyqKECSIwF8oQ4cr2BVBidzFdU'
        }
        self.creds = self._get_credentials()
        self.service = build('sheets', 'v4', credentials=self.creds)

    def _get_credentials(self):
        private_key = os.environ.get('GOOGLE_PRIVATE_KEY', '').replace('\\n', '\n')
        email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        
        if not private_key or not email:
            raise ValueError("Missing GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL environment variables")
            
        info = {
            "type": "service_account",
            "project_id": "manus-project",
            "private_key": private_key,
            "client_email": email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])

    def _get_sheet_data(self, spreadsheet_id, range_name):
        sheet = self.service.spreadsheets()
        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
        values = result.get('values', [])
        if not values:
            return pd.DataFrame()
        return pd.DataFrame(values[1:], columns=values[0])

    def analyze_query(self, query_text):
        # Step 1: Use LLM to decide which data to fetch
        prompt = f"""
        You are an expert financial data analyst. A user asks: "{query_text}"
        Current date is {datetime.now().strftime('%d/%m/%Y')}.
        
        Decide which Google Sheets data is needed to answer this. 
        Available spreadsheets:
        1. 'main': Contains 'รายรับ-รายจ่าย' (income/expense), 'การลงทุน' (investment), 'รวมทุกชีต' (summary)
        2. 'monthly': Contains monthly expense details, 'กำหนดจ่าย' (due dates), 'จ่ายแล้ว' (paid)
        3. 'debt': Contains 'หนี้สิน' (debts), 'จ่ายหนี้' (debt payments)
        
        Output JSON only:
        {{
            "needs_data": true/false,
            "targets": [
                {{"spreadsheet": "main", "range": "รายรับ-รายจ่าย!A:G"}},
                ...
            ],
            "reasoning": "why this data is needed"
        }}
        """
        
        response = self.client.chat.completions.create(
            model="gpt-5-mini",
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
        
        plan = json.loads(response.choices[0].message.content)
        return plan

    def execute_smart_query(self, query_text):
        try:
            plan = self.analyze_query(query_text)
            if not plan['needs_data']:
                return "ขออภัยครับ ผมไม่แน่ใจว่าต้องดึงข้อมูลส่วนไหนมาตอบคำถามนี้"

            context_data = []
            for target in plan['targets']:
                sid = self.spreadsheet_ids.get(target['spreadsheet'])
                df = self._get_sheet_data(sid, target['range'])
                if not df.empty:
                    # Limit data size for LLM context
                    context_data.append(f"Data from {target['spreadsheet']} ({target['range']}):\n{df.tail(50).to_string()}")

            full_context = "\n\n".join(context_data)
            
            # Step 2: Use LLM to answer the question based on fetched data
            answer_prompt = f"""
            User Query: "{query_text}"
            Current Date: {datetime.now().strftime('%d/%m/%Y')}
            
            Data Context:
            {full_context}
            
            Based on the data above, answer the user's question accurately in Thai. 
            If the question is about "working days", look for "ค่าแรง" in the income items.
            Be concise and professional.
            """
            
            answer_response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[{"role": "user", "content": answer_prompt}]
            )
            
            return answer_response.choices[0].message.content
        except Exception as e:
            return f"เกิดข้อผิดพลาดในการประมวลผล: {str(e)}"

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        query_text = sys.argv[1]
        engine = SmartQueryEngine()
        print(engine.execute_smart_query(query_text))
