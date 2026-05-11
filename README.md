# 💰 Income & Expense Bot — Dialogflow + Google Sheets + OCR

ระบบบันทึกรายรับ-รายจ่ายและสินทรัพย์การลงทุนอัตโนมัติผ่าน **Dialogflow Webhook** (Node.js) พร้อมระบบ **OCR สแกนสลิป/ใบเสร็จ** ที่เลือกค่ายได้ บันทึกข้อมูลลง **Google Sheets** พร้อมระบุ **ผู้บันทึก** จากทุกช่องทาง

---

## ✨ ความสามารถหลัก

| ความสามารถ | รายละเอียด |
| :--- | :--- |
| **4 Intent หลัก** | บันทึกรายรับ / บันทึกรายจ่าย / บันทึกการขาย / บันทึกการซื้อ |
| **3 Entities** | `Income_category` / `Expense-category` / `Asset-type` |
| **ตอบกลับทันที** | ยืนยันการบันทึกพร้อมรายละเอียดทุกครั้ง |
| **เช็คยอดคงเหลือ** | `/balance` อ่านจาก Sheet **"รวมทุกชีต"** ที่ใช้ IMPORTRANGE รวมข้อมูลไว้แล้ว |
| **สินทรัพย์การลงทุน** | บันทึกซื้อ/ขาย หุ้น / กองทุน / ทองคำ / คริปโต / อื่นๆ ลง Sheet แยก |
| **OCR สแกนสลิป** | เลือกค่ายได้: Tesseract / AWS Textract / iApp / APPMAN / SpaceOCR |
| **ระบุผู้บันทึก** | ดึงข้อมูลผู้ใช้จาก Telegram, LINE, Facebook Messenger อัตโนมัติ |
| **Deploy ได้ทุกที่** | รองรับ Docker, Railway, Render |

---

## 📊 โครงสร้าง Google Sheets

ระบบใช้ **3 Sheet** ใน Spreadsheet เดียวกัน:

### Sheet 1: `รายรับ-รายจ่าย` (ชีวิตประจำวัน)

ใช้กับ Intent: **บันทึกรายรับ** และ **บันทึกรายจ่าย**

| คอลัมน์ | หัวข้อ | ตัวอย่างข้อมูล |
| :---: | :--- | :--- |
| A | วันที่/เวลา | 08/05/2569 14:30 |
| B | รายการ | ซื้อกาแฟ |
| C | ประเภท | รายจ่าย |
| D | จำนวนเงิน | 60 |
| E | หมวดหมู่ | เครื่องดื่ม |
| F | หมายเหตุ | — |
| G | ช่องทาง | Telegram |
| **H** | **ผู้บันทึก** | **[Telegram] @username** |

### Sheet 2: `การลงทุน` (ซื้อ/ขายสินทรัพย์)

ใช้กับ Intent: **บันทึกการซื้อ** และ **บันทึกการขาย** (หุ้น, กองทุน, ทองคำ, คริปโต)

| คอลัมน์ | หัวข้อ | ตัวอย่างข้อมูล |
| :---: | :--- | :--- |
| A | วันที่/เวลา | 08/05/2569 14:30 |
| B | การดำเนินการ | ซื้อ / ขาย |
| C | ประเภทสินทรัพย์ | หุ้น / กองทุน / ทองคำ / คริปโต / อื่นๆ |
| D | ชื่อสินทรัพย์ | PTT, Bitcoin, ทองคำ 96.5% |
| E | จำนวนหน่วย | 100 (หุ้น), 0.005 (BTC), 1.5 (กรัม) |
| F | ราคา/หน่วย (บาท) | 35.50 |
| G | ยอดรวม (บาท) | 3,550.00 |
| H | ช่องทาง | Telegram |
| **I** | **ผู้บันทึก** | **[Telegram] @username** |

### Sheet สรุป: `รวมทุกชีต` (IMPORTRANGE)

Sheet นี้ใช้สูตร `IMPORTRANGE` รวมข้อมูลจากทุก Sheet ไว้แล้ว ระบบจะอ่านจาก Sheet นี้ชีตเดียวเมื่อผู้ใช้ขอดูยอดคงเหลือ (`CheckBalance`) เพื่อความรวดเร็ว

> กำหนดชื่อ Sheet สรุปได้ผ่าน `GOOGLE_SUMMARY_SHEET_NAME` ใน `.env` (default: `รวมทุกชีต`)

---

## 🤖 Dialogflow Intents & Entities

### 4 Intents หลัก

| Intent | ประเภท | Entity ที่ใช้ | Sheet ที่บันทึก |
| :--- | :--- | :--- | :--- |
| **บันทึกรายรับ** | รายรับทั่วไป | `Income_category` | รายรับ-รายจ่าย |
| **บันทึกรายจ่าย** | รายจ่ายทั่วไป | `Expense-category` | รายรับ-รายจ่าย |
| **บันทึกการขาย** | ขายสินทรัพย์การลงทุน | `Asset-type` | การลงทุน |
| **บันทึกการซื้อ** | ซื้อสินทรัพย์การลงทุน | `Asset-type` | การลงทุน |

> **หมายเหตุ:** หากไม่มี Entity ส่งมา ระบบจะใช้ `inferCategory()` เดาหมวดหมู่จากชื่อรายการเป็น Fallback อัตโนมัติ

### 3 Entities ที่ต้องสร้างใน Dialogflow

**Entity: `Income_category`**

| Value | Synonyms ตัวอย่าง |
| :--- | :--- |
| ค่าแรง/เงินเดือน | ค่าแรง, เงินเดือน, โบนัส, ค่าจ้าง |
| รายได้จากการขาย | ขายของ, ขายสินค้า, รายได้ขาย |
| รายได้อื่นๆ | ดอกเบี้ย, เงินปันผล, ให้เช่า |

**Entity: `Expense-category`**

| Value | Synonyms ตัวอย่าง |
| :--- | :--- |
| อาหาร | ข้าว, อาหาร, ก๋วยเตี๋ยว, ขนม |
| เครื่องดื่ม | กาแฟ, ชา, นม, น้ำผลไม้ |
| เดินทาง | รถ, แท็กซี่, น้ำมัน, Grab |
| ค่าสาธารณูปโภค | ไฟ, น้ำ, อินเทอร์เน็ต, โทรศัพท์ |
| สุขภาพ | ยา, หมอ, โรงพยาบาล |
| ช้อปปิ้ง | เสื้อ, กางเกง, รองเท้า, ซื้อของ |

**Entity: `Asset-type`**

| Value | Synonyms ตัวอย่าง |
| :--- | :--- |
| หุ้น | หุ้น, stock, SET, mai, ตลาดหุ้น |
| กองทุน | กองทุน, fund, RMF, SSF, LTF, ETF |
| ทองคำ | ทองคำ, gold, ทอง, ทองแท่ง, ทองรูปพรรณ |
| คริปโต | คริปโต, crypto, bitcoin, BTC, ETH, ethereum |
| อื่นๆ | อื่นๆ, forex, น้ำมัน, other |

### Parameters ที่ต้องตั้งค่าใน Intent

**Intent: บันทึกรายรับ**
```
item            → @sys.any           (ชื่อรายการ)
number          → @sys.number        (จำนวนเงิน)
Income_category → @Income_category   (หมวดหมู่รายรับ)
```

**Intent: บันทึกรายจ่าย**
```
item              → @sys.any
number            → @sys.number
Expense-category  → @Expense-category
```

**Intent: บันทึกการซื้อ / บันทึกการขาย (สินทรัพย์)**
```
item            → @sys.any           (ชื่อสินทรัพย์ เช่น PTT, Bitcoin)
number          → @sys.number        (จำนวนหน่วย)
unit-currency   → @sys.unit-currency (ยอดเงินรวม)
Asset-type      → @Asset-type        (ประเภทสินทรัพย์)
```

---

## 🔍 OCR Providers ที่รองรับ

| Provider | ค่าใช้จ่าย | เหมาะสำหรับ | `OCR_PROVIDER` |
| :--- | :--- | :--- | :--- |
| **Tesseract** | ฟรี | ทดสอบ / ใช้งานทั่วไป | `tesseract` |
| **AWS Textract** | จ่ายตามใช้ | เอกสารซับซ้อน | `aws` |
| **iApp Technology** | มี Free Tier | ใบเสร็จไทย | `iapp` |
| **APPMAN OCR** | มี Free Tier | เอกสารไทย (98% accuracy) | `appman` |
| **SpaceOCR** | มี Free Tier | สลิปธนาคารไทย | `spaceocr` |

เปลี่ยนค่าย OCR ได้ทันทีโดยแก้ไข `OCR_PROVIDER` ใน `.env` โดยไม่ต้องแก้ไขโค้ด

---

## 👤 ระบบระบุผู้บันทึก

ระบบดึงข้อมูลผู้ใช้จาก `originalDetectIntentRequest` ของ Dialogflow อัตโนมัติ:

| ช่องทาง | ข้อมูลที่ดึง | ตัวอย่างใน Google Sheets |
| :--- | :--- | :--- |
| **Telegram** | Username หรือ ชื่อ-นามสกุล | `[Telegram] @username` |
| **LINE** | LINE User ID | `[LINE] LINE:Uxxxxxxxx...` |
| **Facebook** | Facebook PSID | `[Facebook] FB:12345678...` |
| **อื่นๆ** | Session ID | `[Unknown] User:xxxxxxxx` |

---

## 🚀 การติดตั้งและใช้งาน

### ขั้นตอนที่ 1 — เตรียม Google Sheets

1. สร้าง Google Spreadsheet ใหม่ จดจำ **Spreadsheet ID** จาก URL
2. สร้าง Sheet ชื่อ **`รายรับ-รายจ่าย`** (สำหรับรายการทั่วไป)
3. สร้าง Sheet ชื่อ **`การลงทุน`** (สำหรับซื้อ/ขายสินทรัพย์)
4. สร้าง Sheet ชื่อ **`รวมทุกชีต`** และใส่สูตร `IMPORTRANGE` เพื่อรวมข้อมูลจาก Sheet 1 และ 2
5. ไปที่ [Google Cloud Console](https://console.cloud.google.com) → สร้าง **Service Account**
6. ดาวน์โหลด JSON Key และเก็บค่า `client_email` และ `private_key`
7. แชร์ Google Sheet ให้กับ `client_email` ของ Service Account (Editor)

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

GOOGLE_SHEET_NAME=รายรับ-รายจ่าย
GOOGLE_INVEST_SHEET_NAME=การลงทุน
GOOGLE_SUMMARY_SHEET_NAME=รวมทุกชีต

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

**Option D: Local Development**
```bash
npm install
npm run dev
```

### ขั้นตอนที่ 4 — ตั้งค่า Dialogflow

1. ไปที่ **Fulfillment** → เปิดใช้งาน **Webhook**
2. ใส่ URL: `https://your-domain.com/webhook/dialogflow`
3. สร้าง Intent ตามตารางด้านล่าง และเปิดใช้งาน **"Enable webhook call for this intent"**

| Intent Name | Training Phrases ตัวอย่าง |
| :--- | :--- |
| บันทึกรายรับ | "รายรับ 500 บาท", "ได้เงิน 1000", "ค่าแรง 600 บาท" |
| บันทึกรายจ่าย | "ซื้อกาแฟ 60 บาท", "จ่ายค่าไฟ 1200" |
| บันทึกการขาย | "ขายหุ้น PTT 100 หุ้น", "ขาย Bitcoin 0.01" |
| บันทึกการซื้อ | "ซื้อหุ้น PTT 100 หุ้น ราคา 35.50", "ซื้อทองคำ 1 บาท" |
| CheckBalance | "/balance", "ขอดูยอดหน่อย", "เหลือเงินเท่าไหร่" |

---

## 📡 API Endpoints

| Method | Path | คำอธิบาย |
| :--- | :--- | :--- |
| `POST` | `/webhook/dialogflow` | Dialogflow Webhook หลัก |
| `POST` | `/api/ocr/scan` | สแกนสลิป/ใบเสร็จ (JSON response) |
| `POST` | `/api/ocr/scan-dialogflow` | สแกนสลิปและตอบในรูปแบบ Dialogflow |
| `GET` | `/api/ocr/providers` | ดูรายชื่อ OCR providers ที่รองรับ |
| `GET` | `/health` | Health check พร้อมข้อมูล Sheet ทั้ง 3 ชีต |

---

## 💬 ตัวอย่างการใช้งาน

**บันทึกรายจ่าย:**
```
ผู้ใช้: "ซื้อกาแฟ 60 บาท"
บอท:
📝 ฉันบันทึก ซื้อกาแฟ
📂 หมวดหมู่รายจ่าย: เครื่องดื่ม 💪
💵 จำนวน 60.00 บาท
✅ ให้คุณเรียบร้อยแล้ว
```

**บันทึกการซื้อหุ้น:**
```
ผู้ใช้: "ซื้อหุ้น PTT 100 หุ้น ราคา 35.50 บาท"
บอท:
📝 ฉันบันทึก ซื้อหุ้น
📈 สินทรัพย์: PTT
📂 ประเภท: หุ้น
📦 จำนวน: 100 หุ้น
💲 ราคา/หน่วย: 35.50 บาท
💵 ยอดรวม: 3,550.00 บาท
✅ ให้คุณเรียบร้อยแล้ว
```

**เช็คยอดคงเหลือ:**
```
ผู้ใช้: "/balance"
บอท:
📅 ยอดประจำวันที่ 11 พ.ค. 2569
📋 ข้อมูลจาก Sheet: รวมทุกชีต

📝 รายการวันนี้
ซื้อกาแฟ 60.00 บาท
ค่าแรง 600.00 บาท

💸 รายรับวันนี้  600.00 บาท
🛍️ รายจ่ายวันนี้  60.00 บาท

💰 รายรับเดือนนี้  16,252.94 บาท
📄 รายจ่ายเดือนนี้  3,737.00 บาท

🪙 ยอดคงเหลือ 12,515.94 บาท
```

---

## 🏗️ โครงสร้างโปรเจกต์

```
Income-and-expenses-by-manus/
├── src/
│   ├── index.js                    ← Express Server หลัก (v2.0.0)
│   ├── routes/
│   │   ├── dialogflow.js           ← Webhook Handler (4 Intents + 3 Entities)
│   │   └── ocr.js                  ← OCR API Endpoints
│   ├── services/
│   │   └── googleSheets.js         ← Google Sheets (3 Sheets: รายรับ-รายจ่าย, การลงทุน, รวมทุกชีต)
│   ├── ocr/
│   │   ├── ocrManager.js           ← OCR Provider Manager (เลือกค่ายได้)
│   │   └── providers/
│   │       ├── tesseractProvider.js  ← Tesseract (ฟรี)
│   │       ├── awsProvider.js        ← AWS Textract
│   │       ├── iappProvider.js       ← iApp Technology (ไทย)
│   │       ├── appmanProvider.js     ← APPMAN OCR (ไทย)
│   │       └── spaceocrProvider.js   ← SpaceOCR (สลิปธนาคารไทย)
│   └── utils/
│       ├── responseBuilder.js      ← สร้างข้อความตอบกลับ (รายรับ/รายจ่าย/ลงทุน/balance)
│       └── userExtractor.js        ← ดึงข้อมูลผู้ใช้ (Telegram/LINE/Facebook)
├── .env.example                    ← ตัวอย่าง Environment Variables ครบถ้วน
├── Dockerfile
├── railway.json
├── render.yaml
├── package.json
└── README.md
```

---

## 🔗 ลิงก์ที่เกี่ยวข้อง

- [Dialogflow Console](https://dialogflow.cloud.google.com)
- [Google Cloud Console](https://console.cloud.google.com)
- [iApp Technology OCR](https://iapp.co.th)
- [APPMAN OCR](https://www.appman.co.th)
- [SpaceOCR](https://spaceocr.com)
- [Railway](https://railway.app)
- [Render](https://render.com)

---

*จัดทำโดย Manus AI — Version 2.0.0*
