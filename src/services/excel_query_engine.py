
import pandas as pd
import os
from datetime import datetime

class ExcelQueryEngine:
    def __init__(self, project_file_path):
        self.project_file_path = project_file_path
        self.data = {}
        self._load_all_excel_files()

    def _load_all_excel_files(self):
        excel_files = [
            'Copy of Income-Expanses by manus.xlsx',
            'Copy of ค่าใช้จ่ายแต่ล่ะเดือน 📝.xlsx',
            'Copy of หนี้ที่ค้างจ่าย 🥹.xlsx'
        ]
        
        for f in excel_files:
            file_path = os.path.join(self.project_file_path, f)
            if not os.path.exists(file_path):
                print(f"Warning: File not found at {file_path}")
                continue
            
            try:
                xl = pd.ExcelFile(file_path)
                file_data = {}
                for sheet_name in xl.sheet_names:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    file_data[sheet_name] = df
                self.data[f] = file_data
                print(f"Successfully loaded {f}")
            except Exception as e:
                print(f"Error loading {f}: {e}")

    def get_income_expense_data(self):
        file_name = 'Copy of Income-Expanses by manus.xlsx'
        if file_name in self.data and 'รายรับ-รายจ่าย' in self.data[file_name]:
            return self.data[file_name]['รายรับ-รายจ่าย']
        return pd.DataFrame()

    def get_monthly_expense_data(self):
        file_name = 'Copy of ค่าใช้จ่ายแต่ล่ะเดือน 📝.xlsx'
        if file_name in self.data and 'Monthly-expense 2026' in self.data[file_name]: # Assuming this is the main sheet
            return self.data[file_name]['Monthly-expense 2026']
        return pd.DataFrame()

    def get_debt_data(self):
        file_name = 'Copy of หนี้ที่ค้างจ่าย 🥹.xlsx'
        if file_name in self.data and 'หนี้ที่ค้างจ่าย' in self.data[file_name]: # Assuming this is the main sheet
            return self.data[file_name]['หนี้ที่ค้างจ่าย']
        return pd.DataFrame()

    def get_days_worked_this_month(self, year, month):
        df = self.get_income_expense_data()
        if df.empty:
            return 0

        # Ensure 'วันที่' column is datetime objects
        df['วันที่'] = pd.to_datetime(df['วันที่'], errors='coerce')
        df = df.dropna(subset=['วันที่'])

        # Filter for 'ค่าแรง' and the specified month/year
        df_filtered = df[
            (df['รายการ'].str.contains('ค่าแรง', na=False))
        ]
        
        # Filter by month and year
        df_filtered = df_filtered[
            (df_filtered['วันที่'].dt.year == year) &
            (df_filtered['วันที่'].dt.month == month)
        ]

        # Count unique days
        unique_days = df_filtered['วันที่'].dt.day.nunique()
        return unique_days

    def query(self, query_text):
        # This is where the LLM integration would go to parse the query_text
        # For now, let's implement a simple rule-based query for 'days worked'
        if 'เดือนนี้ทำงานได้กี่วัน' in query_text or 'ทำงานกี่วันเดือนนี้' in query_text:
            now = datetime.now()
            days_worked = self.get_days_worked_this_month(now.year, now.month)
            return f"เดือนนี้ (ปัจจุบัน) คุณทำงานไปแล้ว {days_worked} วัน"
        
        return "ขออภัยครับ ผมยังไม่เข้าใจคำถามนี้ หรือยังไม่มีข้อมูลสำหรับคำถามนี้ครับ"

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2:
        query_text = sys.argv[1]
        project_file_dir = sys.argv[2]

        engine = ExcelQueryEngine(project_file_dir)
        print(engine.query(query_text))
    else:
        # Example usage (for testing purposes)
        project_file_dir = '/home/ubuntu/.manus/config/project-file'
        engine = ExcelQueryEngine(project_file_dir)

        # Test get_days_worked_this_month
        current_year = datetime.now().year
        current_month = datetime.now().month
        days = engine.get_days_worked_this_month(current_year, current_month)
        print(f"Days worked this month ({current_month}/{current_year}): {days}")

        # Test query function
        print(engine.query("เดือนนี้ทำงานได้กี่วัน"))
        print(engine.query("อยากรู้รายรับรวมเดือนที่แล้ว")) # Example of an unhandled query
