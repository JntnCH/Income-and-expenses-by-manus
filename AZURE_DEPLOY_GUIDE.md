# 🚀 คู่มือการย้ายระบบไป Azure App Service

คู่มือนี้จะช่วยให้คุณย้ายโปรเจ็ค **Income-Expense-by-Manus** จาก Railway มายัง Azure ได้อย่างราบรื่น โดยเน้นการตั้งค่าผ่านมือถือครับ

---

## 1. สร้าง Web App บน Azure
1. เข้าไปที่ [Azure Portal](https://portal.azure.com)
2. กด **"Create a resource"** > ค้นหา **"Web App"**
3. ตั้งค่าพื้นฐาน:
   - **Subscription**: เลือกอันที่มี Credits ของคุณ
   - **Resource Group**: สร้างใหม่ (เช่น `IncomeProject`)
   - **Name**: ตั้งชื่อแอปของคุณ (เช่น `my-income-bot`)
   - **Publish**: เลือก `Code`
   - **Runtime stack**: เลือก `Node 20 LTS`
   - **Operating System**: เลือก `Linux` (แนะนำ)
4. กด **"Review + create"** และรอจนเสร็จ

---

## 2. เชื่อมต่อ GitHub (Deployment)
1. เข้าไปที่หน้า Web App ที่สร้างไว้
2. ไปที่เมนู **"Deployment Center"** (อยู่แถบซ้ายมือ)
3. เลือก Source เป็น **"GitHub"**
4. ล็อกอิน GitHub และเลือก Repository: `JntnCH/Income-and-expenses-by-manus`
5. เลือก Branch: `main`
6. กด **"Save"** ระบบจะเริ่มดึงโค้ดมา Deploy ทันที

---

## 3. ตั้งค่าตัวแปร (Environment Variables)
**สำคัญมาก!** ระบบจะทำงานไม่ได้ถ้าขาดขั้นตอนนี้:
1. ไปที่เมนู **"Configuration"** > แท็บ **"Application settings"**
2. กด **"+ New application setting"** และเพิ่มตัวแปรเหล่านี้ทีละตัว:

| Name | Value |
| :--- | :--- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | (Email ของ Service Account ของคุณ) |
| `GOOGLE_PRIVATE_KEY` | (คีย์ยาวๆ ที่ขึ้นต้นด้วย `-----BEGIN PRIVATE KEY-----`) |
| `OPENAI_API_KEY` | (คีย์ AI สำหรับวิเคราะห์ข้อมูล) |
| `MAIN_SPREADSHEET_ID` | (ID ของไฟล์ Income-Expanses by manus) |
| `MONTHLY_SPREADSHEET_ID` | (ID ของไฟล์ ค่าใช้จ่ายแต่ละเดือน) |
| `DEBT_SPREADSHEET_ID` | (ID ของไฟล์ หนี้ที่ค้างจ่าย) |
| `PORT` | `8080` (Azure มักใช้พอร์ตนี้) |

3. กด **"Save"** และกดยืนยัน (ระบบจะ Restart แอปอัตโนมัติ)

---

## 4. ตรวจสอบสถานะ
1. เปิด URL ของแอปคุณ (เช่น `https://my-income-bot.azurewebsites.net/health`)
2. ถ้าขึ้นข้อความ JSON แสดงว่า Server พร้อมใช้งานแล้ว
3. ลองเข้าหน้า `/debug-auth` เพื่อเช็คการเชื่อมต่อ Google Sheets อีกครั้ง

---

## 💡 ข้อควรระวังสำหรับ Azure
- **Startup Command**: หากแอปไม่รัน ให้ไปที่ **Configuration > General settings** และใส่ Startup Command เป็น: `pm2 start ecosystem.config.js --no-daemon`
- **Python**: Azure App Service (Linux) มักมี Python ติดตั้งมาให้อยู่แล้ว สคริปต์ของผมจะพยายามเรียกใช้งานโดยอัตโนมัติครับ

หากติดปัญหาตรงไหนใน Azure Portal สามารถแคปหน้าจอมาถามผมได้ทันทีครับ! 😊
