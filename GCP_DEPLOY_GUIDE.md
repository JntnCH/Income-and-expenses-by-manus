# 🚀 คู่มือการ Deploy บน Google Cloud Platform (GCP) สำหรับมือถือ

เนื่องจากคุณต้องการ Deploy บน GCP เพื่อความเสถียรสูงสุด นี่คือขั้นตอนที่ง่ายที่สุดที่คุณสามารถทำได้ผ่าน **Google Cloud Console** บนมือถือหรือคอมพิวเตอร์ครับ

---

## 1. เตรียมโปรเจ็คบน GCP
1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจ็คใหม่ (Create Project) หรือเลือกโปรเจ็คที่มีอยู่
3. ค้นหา "App Engine" ในช่องค้นหาด้านบน
4. กด **Create Application** เลือก Region เป็น **asia-southeast1 (Singapore)** (ใกล้ไทยที่สุด)

## 2. วิธี Deploy ผ่าน Cloud Shell (ง่ายที่สุดสำหรับมือถือ)
คุณไม่จำเป็นต้องติดตั้งโปรแกรมในคอมพิวเตอร์ เพียงใช้ Cloud Shell ของ Google:

1. กดไอคอน **>_ (Activate Cloud Shell)** ที่มุมขวาบนของหน้าจอ Console
2. เมื่อ Terminal ปรากฏขึ้น ให้พิมพ์คำสั่งเพื่อ Clone โค้ดของคุณ:
   ```bash
   git clone https://github.com/JntnCH/Income-and-expenses-by-manus.git
   cd Income-and-expenses-by-manus
   ```
3. สั่ง Deploy ทันทีด้วยคำสั่ง:
   ```bash
   gcloud app deploy
   ```
4. ระบบจะถามว่าต้องการดำเนินการต่อไหม ให้พิมพ์ `y` แล้วรอจนเสร็จ

## 3. การตั้งค่า Environment Variables (สำคัญมาก)
เพื่อให้ระบบทำงานได้ คุณต้องตั้งค่าตัวแปรต่างๆ ในหน้า Console:

1. ไปที่เมนู **App Engine > Settings**
2. มองหาหัวข้อ **Environment Variables** หรือแก้ไขไฟล์ `app.yaml` ก่อน Deploy
3. **แนะนำ:** เพื่อความง่าย ผมได้เตรียมไฟล์ `app.yaml` ไว้ให้แล้ว แต่คุณควรเพิ่มค่าเหล่านี้ลงใน `app.yaml` หรือตั้งค่าใน **Secret Manager**:

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | คีย์จาก OpenAI สำหรับ AI Query |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | อีเมล Service Account |
| `GOOGLE_PRIVATE_KEY` | คีย์ Private Key (ก๊อปปี้มาทั้งก้อน) |
| `GOOGLE_SPREADSHEET_ID` | ID ของไฟล์ Google Sheets หลัก |
| `SHEET_ID_DEBT` | ID ของไฟล์หนี้ที่ค้างจ่าย |
| `SHEET_ID_MONTHLY` | ID ของไฟล์ค่าใช้จ่ายแต่ละเดือน |

---

## 💡 ทำไมถึง Deploy ไม่ผ่านก่อนหน้านี้?
1. **Port:** GCP บังคับใช้พอร์ต 8080 (หรือตามที่ระบบกำหนด) ซึ่งผมได้แก้ไขในโค้ดให้รองรับ `process.env.PORT` แล้ว
2. **Python Dependencies:** GCP App Engine Node.js runtime ไม่ได้ติดตั้ง Python library ให้โดยอัตโนมัติ ผมจึงเพิ่ม `gcp-build` ใน `package.json` เพื่อสั่งติดตั้ง `pandas` และอื่นๆ ให้ตอน Build ครับ

---
**DevGrok** - พร้อมช่วยเหลือคุณเสมอ! หากติดตรงไหนพิมพ์บอกได้เลยครับ
