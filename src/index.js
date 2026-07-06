require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { google } = require('googleapis');

const dialogflowRoutes = require("./routes/dialogflow");
const ocrRoutes = require("./routes/ocr");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate Limiting — ป้องกัน abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// ============================================================
// Debug Route (For Mobile Access)
// ============================================================
app.get("/debug-auth", async (req, res) => {
  let logs = [];
  const log = (msg, success = true) => logs.push(`<li style="color: ${success ? 'green' : 'red'}">${msg}</li>`);

  log("=== 🔍 Google Auth Debugger ===");

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!email) log("❌ Error: GOOGLE_SERVICE_ACCOUNT_EMAIL is missing", false);
  else log(`✅ Email found: ${email.substring(0, 5)}...${email.substring(email.indexOf('@'))}`);

  if (!privateKey) log("❌ Error: GOOGLE_PRIVATE_KEY is missing", false);
  else if (!privateKey.includes('BEGIN PRIVATE KEY')) log("❌ Error: GOOGLE_PRIVATE_KEY format seems wrong", false);
  else log("✅ Private Key format looks valid");

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    log("✅ Authentication Successful!");

    if (spreadsheetId) {
      log(`Attempting to read Spreadsheet (ID: ${spreadsheetId.substring(0, 5)}...)...`);
      const sheets = google.sheets({ version: 'v4', auth: authClient });
      const response = await sheets.spreadsheets.get({ spreadsheetId });
      log(`✅ Success! Spreadsheet Title: ${response.data.properties.title}`);
    }
  } catch (error) {
    log(`❌ FAILED: ${error.message}`, false);
    if (error.response && error.response.data) {
      log(`Detail: ${JSON.stringify(error.response.data)}`, false);
    }
  }

  const html = `
    <html>
      <head>
        <title>Debug Google Auth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
          h2 { color: #333; }
          ul { background: #f4f4f4; padding: 20px; border-radius: 8px; list-style: none; }
          li { margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; word-break: break-all; }
        </style>
      </head>
      <body>
        <h2>🔍 Google Auth Debug Results</h2>
        <ul>${logs.join('')}</ul>
        <button onclick="location.reload()">Run Again</button>
      </body>
    </html>
  `;
  res.send(html);
});

// ============================================================
// Routes
// ============================================================
app.use("/webhook", dialogflowRoutes);
app.use("/api/ocr", ocrRoutes);

// ============================================================
// Health Check
// ============================================================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Income & Expense Bot is running",
    version: "2.0.0",
    ocr_provider: process.env.OCR_PROVIDER || "tesseract",
    sheets: {
      income_expense: process.env.GOOGLE_SHEET_NAME || "รายรับ-รายจ่าย",
      investment: process.env.GOOGLE_INVEST_SHEET_NAME || "การลงทุน",
      summary: process.env.GOOGLE_SUMMARY_SHEET_NAME || "รวมทุกชีต"
    },
    intents: [
      "บันทึกรายรับ (Entity: Income_category)",
      "บันทึกรายจ่าย (Entity: Expense-category)",
      "บันทึกการขาย (Entity: Asset-type) — สินทรัพย์การลงทุน",
      "บันทึกการซื้อ (Entity: Asset-type) — สินทรัพย์การลงทุน",
      "CheckBalance — อ่านจาก Sheet รวมทุกชีต",
      "QueryExcel — ถาม-ตอบข้อมูลจาก Excel"
    ],
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Root
// ============================================================
app.get("/", (req, res) => {
  res.json({
    name: "Income & Expense Dialogflow Webhook",
    version: "2.0.0",
    description: "ระบบบันทึกรายรับ-รายจ่าย + สินทรัพย์การลงทุน ผ่าน Dialogflow + OCR",
    endpoints: {
      webhook: "POST /webhook/dialogflow",
      ocr_scan: "POST /api/ocr/scan",
      ocr_providers: "GET /api/ocr/providers",
      health: "GET /health",
      debug_auth: "GET /debug-auth"
    },
    intents: {
      "บันทึกรายรับ": "บันทึกรายรับทั่วไป (Entity: Income_category)",
      "บันทึกรายจ่าย": "บันทึกรายจ่ายทั่วไป (Entity: Expense-category)",
      "บันทึกการขาย": "ขายสินทรัพย์การลงทุน เช่น หุ้น/กองทุน/ทองคำ/คริปโต (Entity: Asset-type)",
      "บันทึกการซื้อ": "ซื้อสินทรัพย์การลงทุน เช่น หุ้น/กองทุน/ทองคำ/คริปโต (Entity: Asset-type)",
      "CheckBalance": "ดูยอดคงเหลือจาก Sheet \"รวมทุกชีต\" (IMPORTRANGE)",
      "QueryExcel": "ถาม-ตอบข้อมูลจาก Excel เช่น เดือนนี้ทำงานได้กี่วัน"
    },
    entities: {
      "Income_category": "หมวดหมู่รายรับ เช่น ค่าแรง/เงินเดือน, รายได้จากการขาย",
      "Expense-category": "หมวดหมู่รายจ่าย เช่น อาหาร, เดินทาง, ค่าสาธารณูปโภค",
      "Asset-type": "ประเภทสินทรัพย์: หุ้น | กองทุน | ทองคำ | คริปโต | อื่นๆ"
    },
    platforms: ["Telegram", "LINE", "Facebook Messenger"]
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔍 OCR Provider   : ${process.env.OCR_PROVIDER || "tesseract"}`);
  console.log(`📊 Spreadsheet ID : ${process.env.GOOGLE_SPREADSHEET_ID || "NOT SET"}`);
  console.log(`📋 Sheet รายรับ-รายจ่าย : ${process.env.GOOGLE_SHEET_NAME || "รายรับ-รายจ่าย"}`);
  console.log(`📈 Sheet การลงทุน       : ${process.env.GOOGLE_INVEST_SHEET_NAME || "การลงทุน"}`);
  console.log(`🗂️  Sheet สรุป (Balance) : ${process.env.GOOGLE_SUMMARY_SHEET_NAME || "รวมทุกชีต"}`);
});

module.exports = app;
