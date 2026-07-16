import os
from flask import Flask, request, jsonify
import google.generativeai as genai
from googleapiclient.discovery import build
from google.oauth2 import service_account

app = Flask(__name__)

# 1. ตั้งค่า Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-flash')

# 2. ตั้งค่า Scopes สำหรับ Service Account (ต้องมีทั้ง Drive และ Sheets)
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
]

# ใส่รหัสโฟลเดอร์หลักของคุณที่นี่
FOLDER_ID = '1dtBTIQeGJNQc51WcAYZrkIo_T9sAQUbf' 

def get_data_from_all_sheets():
    """ดึงข้อมูลจากทุกไฟล์ Google Sheets ในโฟลเดอร์ที่ระบุแบบอัตโนมัติ"""
    creds = service_account.Credentials.from_service_account_file(
        'credentials.json', scopes=SCOPES
    )
    
    # ดึงรายชื่อไฟล์ Google Sheets ในโฟลเดอร์ด้วย Drive API v3
    drive_service = build('drive', 'v3', credentials=creds)
    query = f"'{FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
    
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    
    sheets_service = build('sheets', 'v4', credentials=creds)
    combined_text_data = []
    
    for f in files:
        file_id = f['id']
        file_name = f['name']
        
        try:
            # ดึงรายชื่อชีตย่อย (Tabs) ทั้งหมดในไฟล์นั้นๆ
            spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=file_id).execute()
            sheet_names = [sheet['properties']['title'] for sheet in spreadsheet.get('sheets', [])]
            
            file_summary = [f"=== ข้อมูลจากไฟล์: {file_name} ==="]
            
            for sheet_name in sheet_names:
                # ดึงข้อมูลแถวบนๆ เช่น A1:F100 (ปรับเปลี่ยน Range และขอบเขตตามโครงสร้างชีตของคุณ)
                result = sheets_service.spreadsheets().values().get(
                    spreadsheetId=file_id, 
                    range=f"'{sheet_name}'!A1:F100"
                ).execute()
                
                rows = result.get('values', [])
                if rows:
                    headers = rows[0]
                    sheet_lines = [f"  [ชีตย่อย: {sheet_name}]"]
                    for row in rows[1:]:
                        # นำหัวข้อคอลัมน์และข้อมูลแถวมารวมกันเป็นประโยคที่ Gemini เข้าใจได้ง่ายขึ้น
                        line_data = ", ".join([f"{headers[i]}: {row[i]}" for i in range(len(row)) if i < len(headers)])
                        sheet_lines.append(f"    - {line_data}")
                    file_summary.append("\n".join(sheet_lines))
                else:
                    file_summary.append(f"  [ชีตย่อย: {sheet_name}] (ไม่มีข้อมูล)")
                    
            combined_text_data.append("\n".join(file_summary))
            
        except Exception as e:
            print(f"เกิดข้อผิดพลาดในการดึงข้อมูลไฟล์ {file_name} ({file_id}): {e}")
            continue
            
    return "\n\n".join(combined_text_data)

@app.route('/webhook', methods=['POST'])
def webhook():
    req = request.get_json(silent=True, force=True)
    user_query = req.get('queryResult', {}).get('queryText', '')
    
    # 1. ดึงข้อมูลจากไฟล์ทั้งหมดในโฟลเดอร์ขึ้นมาเตรียมไว้
    try:
        sheets_data_context = get_data_from_all_sheets()
    except Exception as e:
        print(f"Error fetching sheets: {e}")
        sheets_data_context = "ไม่สามารถอ่านข้อมูลตารางรายรับรายจ่ายได้ในขณะนี้"

    # 2. ตั้งกฎและใส่บริบทข้อมูลทั้งหมดให้ Gemini ช่วยตอบอย่างชาญฉลาด
    system_instruction = (
        "คุณคือระบบ AI ผู้ช่วยจัดการด้านการเงินส่วนบุคคล "
        "ข้อมูลด้านล่างนี้เป็นข้อมูลรายรับ-รายจ่ายดิบจาก Google Sheets หลายไฟล์ที่อยู่ในระบบคลาวด์ของคุณ "
        "หน้าที่ของคุณคือการวิเคราะห์และตอบคำถามของผู้ใช้ โดยพิจารณาจากข้อมูลเหล่านี้ "
        "เมื่อได้ข้อสรุปแล้ว กรุณาระบุด้วยว่าข้อมูลมาจาก 'ไฟล์' หรือ 'ชีตย่อย' ไหน เพื่อความโปร่งใสและถูกต้อง"
    )
    
    full_prompt = f"""
    {system_instruction}
    
    --- ข้อมูลประกอบการตัดสินใจ ---
    {sheets_data_context}
    ------------------------------
    
    คำถามของผู้ใช้: "{user_query}"
    """

    # 3. ให้ Gemini ช่วยประมวลผลคำตอบ
    try:
        response = gemini_model.generate_content(full_prompt)
        ai_response = response.text
    except Exception as e:
        print(f"Gemini generation error: {e}")
        ai_response = "ระบบประมวลผลข้อมูลการเงินขัดข้องชั่วคราวครับ"

    # 4. ส่งกลับผลลัพธ์ผ่าน Dialogflow ไปแสดงใน Telegram
    reply = {
        "fulfillmentText": ai_response
    }
    return jsonify(reply)

if __name__ == '__main__':
    app.run(port=int(os.environ.get("PORT", 8080)), host='0.0.0.0')
