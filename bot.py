import os
from flask import Flask, request, jsonify
import google.generativeai as genai
from googleapiclient.discovery import build
from google.oauth2 import service_account

app = Flask(__name__)

# 1. ตั้งค่า Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-flash')

# 2. ตั้งค่า Google Sheets API (ดึงสิทธิ์จาก Service Account)
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID") # ID ของชีตรายรับ-รายจ่ายของคุณ

def get_sheets_data():
    """ฟังก์ชันดึงข้อมูลรายรับรายจ่ายล่าสุดจาก Google Sheets"""
    # หมายเหตุ: แนะนำให้ใช้ตัวแปรสภาพแวดล้อมหรือ Google Secret Manager สำหรับเก็บ Credential
    creds = service_account.Credentials.from_service_account_file(
        'credentials.json', scopes=SCOPES
    )
    service = build('sheets', 'v4', credentials=creds)
    sheet = service.spreadsheets()
    
    # ดึงข้อมูลจากชีต (ปรับเปลี่ยน Range ตามโครงสร้างตารางของคุณ เช่น 'Sheet1!A1:D100')
    result = sheet.values().get(spreadsheetId=SPREADSHEET_ID, range='บันทึก!A1:E200').execute()
    rows = result.get('values', [])
    
    # แปลงข้อมูลเป็นข้อความเพื่อส่งให้ Gemini เข้าใจได้ง่ายขึ้น
    if not rows:
        return "ไม่มีข้อมูลในตาราง"
    
    headers = rows[0]
    data_lines = []
    for row in rows[1:]:
        # เชื่อมแถวข้อมูลด้วย comma
        data_lines.append(", ".join([f"{headers[i]}: {row[i]}" for i in range(len(row)) if i < len(headers)]))
    
    return "\n".join(data_lines)

@app.route('/webhook', methods=['POST'])
def webhook():
    req = request.get_json(silent=True, force=True)
    
    # ดึงคำถามภาษาธรรมชาติที่ผู้ใช้พิมพ์ส่งเข้ามาใน Telegram
    user_query = req.get('queryResult', {}).get('queryText', '')
    
    # 1. ดึงข้อมูลรายรับ-รายจ่ายทั้งหมดจาก Google Sheets
    try:
        sheets_data = get_sheets_data()
    except Exception as e:
        print(f"Error fetching Sheets data: {e}")
        sheets_data = "ไม่สามารถดึงข้อมูลจาก Google Sheets ได้ในขณะนี้"

    # 2. ออกแบบ Prompt เพื่อควบคุมบทบาทของ Gemini
    system_instruction = (
        "คุณคือผู้ช่วยจัดการการเงินส่วนบุคคลที่ฉลาดและเป็นมิตร "
        "ด้านล่างนี้คือข้อมูลรายรับ-รายจ่ายดิบจาก Google Sheets ของผู้ใช้งาน "
        "กรุณาวิเคราะห์ข้อมูลนี้เพื่อตอบคำถามของผู้ใช้อย่างกระชับ ถูกต้อง และเข้าใจง่าย "
        "หากผู้ใช้ถามเกี่ยวกับสถิติ เช่น 'ยอดรวม', 'ค่ากาแฟ', หรือ 'เดือนนี้จ่ายไปเท่าไหร่' "
        "ให้คุณคำนวณและตอบสรุปให้เขาด้วย"
    )
    
    full_prompt = f"""
    {system_instruction}
    
    --- ข้อมูลจาก Google Sheets ---
    {sheets_data}
    -------------------------------
    
    คำถามของผู้ใช้: "{user_query}"
    """

    # 3. ส่งข้อมูลให้ Gemini ช่วยคิดหาคำตอบ
    try:
        response = gemini_model.generate_content(full_prompt)
        ai_response = response.text
    except Exception as e:
        print(f"Error generating content with Gemini: {e}")
        ai_response = "ขออภัยครับ ระบบวิเคราะห์ข้อมูลขัดข้องชั่วคราว"

    # 4. ส่งคำตอบกลับไปที่ Dialogflow เพื่อตอบผู้ใช้ใน Telegram
    reply = {
        "fulfillmentText": ai_response
    }
    
    return jsonify(reply)

if __name__ == '__main__':
    app.run(port=int(os.environ.get("PORT", 8080)), host='0.0.0.0')
