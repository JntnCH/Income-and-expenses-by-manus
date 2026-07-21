require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { google } = require('googleapis');
const healthCheckService = require('./healthCheck');

const dialogflowRoutes = require("./routes/dialogflow");
const ocrRoutes = require("./routes/ocr");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8080;

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

// 1. หน้า UI สำหรับ Admin & Debug
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

app.get("/debug-auth", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

// 2. API สำหรับดึง Config ปัจจุบัน
app.get("/api/admin/config", (req, res) => {
  const config = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID || "",
    OCR_PROVIDER: process.env.OCR_PROVIDER || "tesseract",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "********" : "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "********" : ""
  };
  res.json(config);
});

// 3. API สำหรับบันทึก Config (Runtime Update)
app.post("/api/admin/config", (req, res) => {
  const newConfig = req.body;
  Object.keys(newConfig).forEach(key => {
    if (newConfig[key] && !newConfig[key].includes('***')) {
      process.env[key] = newConfig[key];
    }
  });
  console.log("[ADMIN] Configuration updated in runtime");
  res.json({ success: true, message: "Runtime config updated" });
});

// 4. API สำหรับส่งข้อมูล Debug (เรียกจากหน้า HTML)
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
// Health Check Endpoints
// ============================================================

/**
 * GET /health - Basic health check (for Docker HEALTHCHECK)
 * Returns 200 if server is running
 * Response time: <50ms
 */
app.get("/health", (req, res) => {
  const health = healthCheckService.getBasicHealth();
  res.status(200).json(health);
});

/**
 * GET /health/ready - Readiness check (for Kubernetes/Cloud Run readiness probe)
 * Returns 200 only if all critical dependencies are OK
 * Response time: <2000ms (includes Google API calls with caching)
 */
app.get("/health/ready", async (req, res) => {
  try {
    const health = await healthCheckService.getReadinessHealth();
    
    // Determine HTTP status code based on checks
    const hasErrors = Object.values(health.checks).some(c => c.status === 'error');
    const statusCode = hasErrors ? 503 : 200;
    
    // If not ready, return 503 (Service Unavailable)
    if (health.status !== 'ready') {
      return res.status(503).json(health);
    }
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[HealthCheck] Readiness check error:', error);
    res.status(503).json({
      status: 'not-ready',
      error: 'Failed to perform readiness check',
      message: error.message
    });
  }
});

/**
 * GET /health/startup - Startup check (for deployment verification)
 * Returns full diagnostic information
 * Response time: <2000ms
 */
app.get("/health/startup", async (req, res) => {
  try {
    const health = await healthCheckService.getStartupHealth();
    
    // Determine HTTP status code
    const hasErrors = Object.values(health.checks).some(c => c.status === 'error');
    const statusCode = hasErrors ? 503 : 200;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[HealthCheck] Startup check error:', error);
    res.status(503).json({
      status: 'error',
      type: 'startup',
      error: 'Failed to perform startup check',
      message: error.message
    });
  }
});

/**
 * GET /health/live - Liveness check (for Kubernetes/Cloud Run liveness probe)
 * Minimal check to ensure container should be restarted if this fails
 */
app.get("/health/live", (req, res) => {
  // Just verify the process is alive
  res.status(200).json({
    status: 'alive',
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
      health: "GET /health",
      "health_ready": "GET /health/ready",
      "health_startup": "GET /health/startup",
      "health_live": "GET /health/live"
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
  console.log(`📊 Health check endpoints available:`);
  console.log(`   - GET /health (basic)`);
  console.log(`   - GET /health/ready (readiness probe)`);
  console.log(`   - GET /health/startup (startup probe)`);
  console.log(`   - GET /health/live (liveness probe)`);
});

module.exports = app;
