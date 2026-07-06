require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { google } = require('googleapis');

const dialogflowRoutes = require("./routes/dialogflow");
const ocrRoutes = require("./routes/ocr");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false, // ปิด CSP ชั่วคราวเพื่อให้รันสคริปต์ในหน้า debug ได้ง่าย
}));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// Rate Limiting — ป้องกัน abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// ============================================================
// Debug Routes
// ============================================================

// 1. หน้า UI สำหรับ Debug
app.get("/debug-auth", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/debug.html"));
});

// 2. API สำหรับส่งข้อมูล Debug (เรียกจากหน้า HTML)
app.get("/api/debug-auth-data", async (req, res) => {
  let logs = [];
  const addLog = (title, message, status = 'success', detail = null) => 
    logs.push({ title, message, status, detail });

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Check Email
  if (!email) addLog("Service Account Email", "ไม่พบ Email ใน .env", "error");
  else addLog("Service Account Email", `${email.substring(0, 5)}...${email.substring(email.indexOf('@'))}`, "success");

  // Check Private Key
  if (!privateKey) addLog("Private Key", "ไม่พบ Private Key ใน .env", "error");
  else if (!privateKey.includes('BEGIN PRIVATE KEY')) addLog("Private Key", "รูปแบบคีย์ไม่ถูกต้อง (ขาด Header)", "error");
  else addLog("Private Key", "รูปแบบเบื้องต้นถูกต้อง", "success");

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey ? privateKey.replace(/\\n/g, '\n') : ""
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    addLog("Authentication Status", "ล็อกอินเข้า Google สำเร็จ!", "success");

    if (spreadsheetId) {
      const sheets = google.sheets({ version: 'v4', auth: authClient });
      const response = await sheets.spreadsheets.get({ spreadsheetId });
      addLog("Spreadsheet Access", `เชื่อมต่อไฟล์ "${response.data.properties.title}" สำเร็จ`, "success");
    } else {
      addLog("Spreadsheet Access", "ไม่ได้ระบุ GOOGLE_SPREADSHEET_ID", "warning");
    }
  } catch (error) {
    let detail = error.message;
    if (error.response && error.response.data) {
      detail = JSON.stringify(error.response.data, null, 2);
    }
    addLog("Error Details", "การเชื่อมต่อล้มเหลว", "error", detail);
  }

  res.json({ logs });
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
    version: "2.1.0",
    ocr_provider: process.env.OCR_PROVIDER || "tesseract",
    timestamp: new Date().toISOString()
  });
});

// Root Route
app.get("/", (req, res) => {
  res.json({
    name: "Income & Expense Dialogflow Webhook",
    version: "2.1.0",
    endpoints: {
      webhook: "POST /webhook/dialogflow",
      debug_auth: "GET /debug-auth",
      health: "GET /health"
    }
  });
});

// 404 & Error Handlers
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

module.exports = app;
