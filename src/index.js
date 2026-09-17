require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { google } = require('googleapis');
const healthCheckService = require('./healthCheck');
const { requireAdmin, requireWebhookSecret } = require('./middleware/security');

const dialogflowRoutes = require("./routes/dialogflow");
const ocrRoutes = require("./routes/ocr");
const { router: imageCardRoutes } = require("./routes/imageCard");
const categoriesRoutes = require("./routes/categories");
const chatRoutes = require("./routes/chat");
const telegramRoutes = require("./routes/telegram");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set("trust proxy", 1);

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : (isProduction ? [] : true),
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use("/api/", limiter);
app.use("/webhook/", webhookLimiter);

// Administrative and diagnostic endpoints must never be public.
app.get("/admin", requireAdmin, (req, res) => res.sendFile(path.join(__dirname, "../public/admin.html")));
app.get("/debug-auth", requireAdmin, (req, res) => res.sendFile(path.join(__dirname, "../public/admin.html")));
app.get("/api/admin/config", requireAdmin, (req, res) => {
  res.json({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID || "",
    OCR_PROVIDER: process.env.OCR_PROVIDER || "tesseract",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "********" : "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "********" : ""
  });
});
app.post("/api/admin/config", requireAdmin, (req, res) => {
  const allowedKeys = new Set(['GOOGLE_SPREADSHEET_ID', 'GOOGLE_SHEET_NAME', 'GOOGLE_INVESTMENT_SHEET_NAME', 'OCR_PROVIDER']);
  for (const [key, value] of Object.entries(req.body || {})) {
    if (allowedKeys.has(key) && typeof value === 'string' && value.length <= 200) process.env[key] = value;
  }
  res.json({ success: true, message: "Runtime config updated" });
});
app.get("/api/debug-auth-data", requireAdmin, async (req, res) => {
  const logs = [];
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!email) logs.push({ title: 'Service Account Email', message: 'Missing', status: 'error' });
  else logs.push({ title: 'Service Account Email', message: `${email.substring(0, 5)}...${email.substring(email.indexOf('@'))}`, status: 'success' });
  if (!privateKey) logs.push({ title: 'Private Key', message: 'Missing', status: 'error' });
  else logs.push({ title: 'Private Key', message: privateKey.includes('BEGIN PRIVATE KEY') ? 'Format appears valid' : 'Invalid format', status: privateKey.includes('BEGIN PRIVATE KEY') ? 'success' : 'error' });
  try {
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: privateKey ? privateKey.replace(/\\n/g, '\n') : '' }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const client = await auth.getClient();
    if (spreadsheetId) {
      const result = await google.sheets({ version: 'v4', auth: client }).spreadsheets.get({ spreadsheetId });
      logs.push({ title: 'Spreadsheet Access', message: `Connected to "${result.data.properties.title}"`, status: 'success' });
    } else logs.push({ title: 'Spreadsheet Access', message: 'Spreadsheet ID missing', status: 'warning' });
  } catch (error) {
    console.error('[ADMIN DEBUG]', error.message);
    logs.push({ title: 'Authentication', message: 'Connection failed', status: 'error' });
  }
  res.json({ logs });
});

app.use("/webhook", requireWebhookSecret, dialogflowRoutes);
app.use("/webhook", telegramRoutes);
app.use("/telegram", telegramRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/card", imageCardRoutes);
app.use("/api/categories", categoriesRoutes);
// Reset is an administrative operation; protect only that route while keeping chat public.
app.use("/api/chat", (req, res, next) => req.path === '/reset' ? requireAdmin(req, res, next) : next(), chatRoutes);
app.use("/api/telegram", telegramRoutes);
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "../public/admin.html")));

app.get("/health", (req, res) => res.status(200).json(healthCheckService.getBasicHealth()));
app.get("/health/live", (req, res) => res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() }));
app.get("/health/ready", async (req, res) => {
  try {
    const health = await healthCheckService.getReadinessHealth();
    res.status(health.status === 'ready' ? 200 : 503).json(health);
  } catch (error) {
    console.error('[HealthCheck]', error.message);
    res.status(503).json({ status: 'not-ready', error: 'Readiness check failed' });
  }
});
app.get("/health/startup", async (req, res) => {
  try {
    const health = await healthCheckService.getStartupHealth();
    const hasErrors = Object.values(health.checks || {}).some(c => c.status === 'error');
    res.status(hasErrors ? 503 : 200).json(health);
  } catch (error) {
    console.error('[HealthCheck]', error.message);
    res.status(503).json({ status: 'error', type: 'startup', error: 'Startup check failed' });
  }
});

app.get("/", (req, res) => {
  if (req.accepts('html')) return res.sendFile(path.join(__dirname, "../public/admin.html"));
  res.json({ name: "Income & Expense Dialogflow Webhook", version: "2.1.0" });
});
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
module.exports = app;
