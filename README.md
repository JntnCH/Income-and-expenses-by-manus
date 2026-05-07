# 💰 Income & Expense Bot — Dialogflow + Google Sheets + OCR

ระบบบันทึกรายรับ-รายจ่ายอัตโนมัติผ่าน **Dialogflow Webhook** (Node.js) พร้อมระบบ **OCR สแกนสลิป/ใบเสร็จ** ที่เลือกค่ายได้ บันทึกข้อมูลลง **Google Sheets** พร้อมระบุ **ผู้บันทึก** จากทุกช่องทาง

---

## ✨ ความสามารถหลัก

| ความสามารถ | รายละเอียด |
| :--- | :--- |
| **4 Intent หลัก** | บันทึกรายรับ / บันทึกรายจ่าย / บันทึกการขาย / บันทึกการซื้อ |
| **ตอบกลับทันที** | ยืนยันการบันทึกพร้อมรายละเอียดทุกครั้ง |
| **เช็คยอดคงเหลือ** | `/balance` รวมข้อมูลจาก **ทุก Sheet** ใน Spreadsheet |
| **OCR สแกนสลิป** | เลือกค่ายได้: Tesseract / AWS Textract / iApp / APPMAN / SpaceOCR |
| **ระบุผู้บันทึก** | ดึงข้อมูลผู้ใช้จาก Telegram, LINE, Facebook Messenger อัตโนมัติ |
| **Deploy ได้ทุกที่** | รองรับ Docker, Railway, Render |

---

## 📊 โครงสร้าง Google Sheets

ระบบจะสร้าง Header Row อัตโนมัติเมื่อเริ่มต้น:

| คอลัมน์ | หัวข้อ | ตัวอย่างข้อมูล |
| :---: | :--- | :--- |
| A | วันที่/เวลา | 08/05/2569 14:30 |
| B | รายการ | ซื้อกาแฟ |
| C | ประเภท | รายจ่าย |
| D | จำนวนเงิน | 60 |
| E | หมวดหมู่ | เครื่องดื่ม |
| F | หมายเหตุ | การซื้อ |
| G | ช่องทาง | Telegram |
| **H** | **ผู้บันทึก** | **[Telegram] @username** |

> **หมายเหตุ:** ฟังก์ชัน `/balance` จะวนอ่านข้อมูลจาก **ทุก Sheet** ใน Spreadsheet และรวมยอดมาแสดงผลพร้อมกัน

---

## 🔍 OCR Providers ที่รองรับ

| Provider | ค่าใช้จ่าย | เหมาะสำหรับ | Environment Variable |
| :--- | :--- | :--- | :--- |
| **Tesseract** | ฟรี | ทดสอบ / ใช้งานทั่วไป | `OCR_PROVIDER=tesseract` |
| **AWS Textract** | จ่ายตามใช้ | เอกสารซับซ้อน | `OCR_PROVIDER=aws` |
| **iApp Technology** | มี Free Tier | ใบเสร็จไทย | `OCR_PROVIDER=iapp` |
| **APPMAN OCR** | มี Free Tier | เอกสารไทย (98% accuracy) | `OCR_PROVIDER=appman` |
| **SpaceOCR** | มี Free Tier | สลิปธนาคารไทย | `OCR_PROVIDER=spaceocr` |

เปลี่ยนค่าย OCR ได้ทันทีโดยแก้ไข `OCR_PROVIDER` ใน `.env` โดยไม่ต้องแก้ไขโค้ด

---

## 🚀 การติดตั้งและใช้งาน

### ขั้นตอนที่ 1 — เตรียม Google Sheets

1. สร้าง Google Sheet ใหม่และจดจำ **Spreadsheet ID** จาก URL
2. ไปที่ [Google Cloud Console](https://console.cloud.google.com) → สร้าง **Service Account**
3. ดาวน์โหลด JSON Key และเก็บค่า `client_email` และ `private_key`
4. แชร์ Google Sheet ให้กับ `client_email` ของ Service Account (Editor)

### ขั้นตอนที่ 2 — ตั้งค่า Environment Variables

```bash
cp .env.example .env
# แก้ไขค่าใน .env ตามที่ต้องการ
```

ค่าที่จำเป็นต้องกรอก:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
OCR_PROVIDER=tesseract   # หรือ aws / iapp / appman / spaceocr
```

### ขั้นตอนที่ 3 — Deploy

**Option A: Docker**
```bash
docker build -t income-expense-bot .
docker run -p 3000:3000 --env-file .env income-expense-bot
```

**Option B: Railway**
1. Push โค้ดขึ้น GitHub
2. เชื่อมต่อ Repository กับ [Railway](https://railway.app)
3. ตั้งค่า Environment Variables ใน Railway Dashboard
4. Railway จะ Deploy อัตโนมัติ

**Option C: Render**
1. Push โค้ดขึ้น GitHub
2. สร้าง Web Service ใหม่ใน [Render](https://render.com)
3. เลือก Repository และ Render จะอ่าน `render.yaml` อัตโนมัติ
4. ตั้งค่า Environment Variables ใน Render Dashboard

### ขั้นตอนที่ 4 — ตั้งค่า Dialogflow

1. ไปที่ **Fulfillment** → เปิดใช้งาน **Webhook**
2. ใส่ URL: `https://your-domain.com/webhook/dialogflow`
3. สร้าง Intent ตามตารางด้านล่าง และเปิดใช้งาน **"Enable webhook call for this intent"**

| Intent Name | Training Phrases ตัวอย่าง |
| :--- | :--- |
| บันทึกรายรับ | "รายรับ 500 บาท", "ได้เงิน 1000" |
| บันทึกรายจ่าย | "ซื้อกาแฟ 60 บาท", "จ่ายค่าไฟ 1200" |
| บันทึกการขาย | "ขายของได้ 300", "ขายเสื้อ 500 บาท" |
| บันทึกการซื้อ | "ซื้อของ 200", "ซื้อวัตถุดิบ 800 บาท" |
| CheckBalance | "/balance", "ขอดูยอดหน่อย", "เหลือเงินเท่าไหร่" |

---

## 📡 API Endpoints

| Method | Path | คำอธิบาย |
| :--- | :--- | :--- |
| `POST` | `/webhook/dialogflow` | Dialogflow Webhook หลัก |
| `POST` | `/api/ocr/scan` | สแกนสลิป/ใบเสร็จ (JSON response) |
| `POST` | `/api/ocr/scan-dialogflow` | สแกนสลิปและตอบในรูปแบบ Dialogflow |
| `GET` | `/api/ocr/providers` | ดูรายชื่อ OCR providers ที่รองรับ |
| `GET` | `/health` | Health check |

---

## 🏗️ โครงสร้างโปรเจกต์

```
Income-and-expenses-by-manus/
├── src/
│   ├── index.js                    # Entry point
│   ├── routes/
│   │   ├── dialogflow.js           # Dialogflow Webhook (4 Intents)
│   │   └── ocr.js                  # OCR API endpoints
│   ├── services/
│   │   └── googleSheets.js         # Google Sheets (อ่าน/เขียน ทุก Sheet)
│   ├── ocr/
│   │   ├── ocrManager.js           # OCR Provider Manager
│   │   └── providers/
│   │       ├── tesseractProvider.js
│   │       ├── awsProvider.js
│   │       ├── iappProvider.js
│   │       ├── appmanProvider.js
│   │       └── spaceocrProvider.js
│   └── utils/
│       ├── userExtractor.js        # ดึงข้อมูลผู้ใช้ (Telegram/LINE/Facebook)
│       └── responseBuilder.js      # สร้างข้อความตอบกลับ
├── .env.example
├── Dockerfile
├── railway.json
├── render.yaml
└── README.md
```

---

## 👤 ระบบผู้บันทึก (User Tracking)

ระบบดึงข้อมูลผู้ใช้จาก `originalDetectIntentRequest` ของ Dialogflow โดยอัตโนมัติ:

| ช่องทาง | ข้อมูลที่ดึงได้ | ตัวอย่างใน Google Sheets |
| :--- | :--- | :--- |
| **Telegram** | Username หรือ ชื่อ-นามสกุล | `[Telegram] @username` |
| **LINE** | LINE User ID | `[LINE] LINE:Uxxxxxxxx...` |
| **Facebook** | Facebook PSID | `[Facebook] FB:12345678...` |
| **อื่นๆ** | Session ID | `[Unknown] User:xxxxxxxx` |

---

*จัดทำโดย Manus AI*
