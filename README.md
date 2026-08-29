# 💰 Income & Expense Bot — Dialogflow + Google Sheets + OCR + AI Analyst

ระบบบันทึกรายรับ-รายจ่ายและสินทรัพย์การลงทุนอัตโนมัติผ่าน **Dialogflow Webhook** (Node.js) พร้อมระบบ **OCR สแกนสลิป/ใบเสร็จ** และความสามารถใหม่ **AI Analyst** ที่ช่วยวิเคราะห์ข้อมูลการเงินของคุณผ่านแชท

---

## ✨ ความสามารถหลัก

| ความสามารถ | รายละเอียด |
| :--- | :--- |
| **4 Intent หลัก** | บันทึกรายรับ / บันทึกรายจ่าย / บันทึกการขาย / บันทึกการซื้อ |
| **AI Analyst (ใหม่!)** | ถามคำถามภาษาไทยให้ AI วิเคราะห์ข้อมูลในชีต เช่น "เดือนนี้ทำงานกี่วัน" |
| **Native Google Solution** | มี Google Apps Script สำหรับใช้งาน AI (Gemini) ใน Google Sheets โดยตรง |
| **OCR สแกนสลิป** | เลือกค่ายได้: Tesseract / AWS Textract / iApp / APPMAN / SpaceOCR |
| **ระบุผู้บันทึก** | ดึงข้อมูลผู้ใช้จาก Telegram, LINE, Facebook Messenger อัตโนมัติ |
| **Deploy ได้ทุกที่** | รองรับ Docker, Railway, Render |

---

## 🤖 ฟีเจอร์ใหม่: AI Analyst (ถาม-ตอบข้อมูล)

คุณสามารถถามคำถามภาษาไทยเพื่อให้ AI วิเคราะห์ข้อมูลจาก Google Sheets ทั้ง 3 ไฟล์ของคุณได้ โดยระบบรองรับ 2 รูปแบบ:

### 1. ถามผ่านแชท (Dialogflow Webhook)
ใช้ AI Query Engine (Python + Node.js) ในการดึงข้อมูลจาก Google Sheets มาวิเคราะห์และตอบกลับในแชท
- **Intent:** `QueryExcel`
- **ตัวอย่างคำถาม:** "เดือนนี้ทำงานได้กี่วัน", "สรุปรายจ่ายสัปดาห์นี้หน่อย"

### 2. ถามใน Google Sheets (Google Apps Script + Gemini)
โซลูชันแบบ Native ที่ทำงานบน Google Sheets โดยตรง ไม่ต้องผ่าน Server ภายนอก
- **ตำแหน่ง:** เมนู `🤖 AI Analyst` ใน Google Sheets
- **เทคโนโลยี:** Google Apps Script + Gemini 1.5 Flash API
- **การติดตั้ง:** ดูรายละเอียดในโฟลเดอร์ `google-apps-script/`

---

## 📊 โครงสร้าง Google Sheets

ระบบใช้ **3 ไฟล์หลัก** (หรือ 3 Sheet ในไฟล์เดียว):

1. **รายรับ-รายจ่าย** (ชีวิตประจำวัน)
2. **การลงทุน** (ซื้อ/ขายสินทรัพย์)
3. **หนี้สิน** (รายการหนี้ค้างจ่าย)

---

## 🚀 การติดตั้งและใช้งาน

### ขั้นตอนที่ 1 — เตรียม Google Sheets
1. สร้าง Google Spreadsheet และจดจำ **Spreadsheet ID**
2. ตั้งค่า Service Account ใน Google Cloud Console และแชร์สิทธิ์ให้ Service Account (Editor)

### ขั้นตอนที่ 2 — ตั้งค่า Environment Variables
เพิ่มค่าเหล่านี้ในไฟล์ `.env`:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="..."
GOOGLE_SPREADSHEET_ID=...
OPENAI_API_KEY=... # สำหรับ AI Analyst ใน Webhook

# สำหรับสร้างและเก็บภาพสรุปยอดผ่าน Google Cloud Storage บน Cloud Run
GCS_IMAGE_BUCKET=income-expense-images
```

### ขั้นตอนที่ 3 — ติดตั้ง Google Apps Script (แนะนำ)
หากต้องการใช้ AI วิเคราะห์ข้อมูลใน Google Sheets โดยตรง:
1. เปิด Google Sheets > Extensions > Apps Script
2. คัดลอกโค้ดจาก `google-apps-script/code.js` ไปวาง
3. ดูคู่มือการติดตั้งฉบับเต็มได้ที่ `google-apps-script/README.md`

---

## 📡 API Endpoints

| Method | Path | คำอธิบาย |
| :--- | :--- | :--- |
| `POST` | `/webhook/dialogflow` | Dialogflow Webhook หลัก (รวม AI Query) |
| `POST` | `/api/ocr/scan` | สแกนสลิป/ใบเสร็จ (JSON response) |
| `GET` | `/health` | Health check พร้อมสถานะระบบ |
| `GET` | `/health/startup` | ตรวจสอบ Google Sheets และความพร้อมของ Google Cloud Storage image storage |

---

## 💬 ตัวอย่างการใช้งาน AI Analyst

**ผู้ใช้:** "เดือนนี้ทำงานได้กี่วัน"
**บอท:** "จากการตรวจสอบรายการรายรับในเดือนกรกฎาคม 2569 พบรายการ 'ค่าแรง' ทั้งหมด 1 วัน คือวันที่ 03/07/2569 ครับ"

### ภาพสรุปยอดสำหรับ Telegram และ LINE

เมื่อเรียก Intent `CheckBalance` หรือ `เช็คยอด` ระบบจะสร้างภาพ JPEG แบบ deterministic ขนาด 240×240 พิกเซล อัปโหลดไปยัง Google Cloud Storage bucket `income-expense-images` แล้วส่ง Dialogflow image response กลับไป ภาพนี้จะถูกแสดงผ่าน Dialogflow integrations ของ Telegram และ LINE เมื่อ Cloud Run service account มีสิทธิ์เขียน bucket และ object URL เปิดให้แพลตฟอร์มปลายทางเข้าถึงได้

ห้ามใส่ service-account key ใน frontend, Git repository หรือไฟล์ที่เปิดเผยต่อสาธารณะ หากยังไม่ได้ตั้งค่า bucket หรือสิทธิ์ระบบจะคงตอบกลับเป็นข้อความตามเดิมเพื่อไม่ให้ Webhook ล้มเหลว

---

## 👤 ระบบระบุผู้บันทึก
ระบบดึงข้อมูลผู้ใช้จากช่องทางต่างๆ (Telegram, LINE, Facebook) อัตโนมัติ เพื่อระบุว่าใครเป็นคนบันทึกรายการนั้นๆ ลงใน Google Sheets

## Cloud Run + Google Cloud Storage

เมื่อ deploy ผ่าน `.github/workflows/deploy-google.yaml` ระบบจะสร้างภาพสรุปยอดใน Cloud Run และอัปโหลดไปยัง Google Cloud Storage โดยใช้ Application Default Credentials ของ Cloud Run service account ตัวแปร `GCS_IMAGE_BUCKET` ต้องชี้ไปยัง bucket ที่มีอยู่จริง เช่น `income-expense-images` และ bucket ต้องอนุญาตให้ผู้รับภายนอกอ่าน object ได้ หากต้องการให้ Telegram และ LINE เปิดภาพจาก URL ได้

ก่อนใช้งาน Production ให้สร้าง bucket และกำหนดสิทธิ์ให้ Cloud Run runtime service account มีสิทธิ์ `Storage Object Creator` หรือ `Storage Object Admin` ตามความเหมาะสม และกำหนดสิทธิ์อ่าน object ให้เหมาะกับรูปแบบ URL ที่เลือกใช้ URL ปัจจุบันเป็น `https://storage.googleapis.com/<bucket>/<object>` ซึ่งต้องเข้าถึงได้จากอินเทอร์เน็ต

GitHub Actions ใช้ `GCP_SA_KEY` สำหรับ deploy จาก GitHub เท่านั้น ไม่ควรส่งค่า key นี้เข้า Cloud Run runtime โดยตรง ระบบใช้ service account ของ Cloud Run ผ่าน Application Default Credentials สำหรับ Google Sheets และ Cloud Storage ดังนั้นต้องแชร์ Google Spreadsheet ให้กับ Cloud Run runtime service account ด้วย

ตัวแปรสำคัญของ Cloud Run คือ:

| ตัวแปร | ค่า/หน้าที่ |
|---|---|
| `GCS_IMAGE_BUCKET` | ชื่อ Google Cloud Storage bucket สำหรับภาพ |
| `GOOGLE_SPREADSHEET_ID` | Spreadsheet หลัก |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ที่ใช้รันบริการ |

หากใช้ GitHub Actions แบบ keyless ในอนาคต ควรเปลี่ยนจาก `GCP_SA_KEY` เป็น Workload Identity Federation เพื่อลดความเสี่ยงจาก long-lived service-account key
