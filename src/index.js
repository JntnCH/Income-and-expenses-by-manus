require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const dialogflowRoutes = require('./routes/dialogflow');
const ocrRoutes = require('./routes/ocr');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting — ป้องกัน abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ============================================================
// Routes
// ============================================================
app.use('/webhook', dialogflowRoutes);
app.use('/api/ocr', ocrRoutes);

// ============================================================
// Health Check
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Income & Expense Bot is running',
    version: '2.0.0',
    ocr_provider: process.env.OCR_PROVIDER || 'tesseract',
    sheets: {
      income_expense: process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย',
      investment: process.env.GOOGLE_INVEST_SHEET_NAME || 'การลงทุน',
      summary: process.env.GOOGLE_SUMMARY_SHEET_NAME || 'รวมทุกชีต'
    },
    intents: [
      'บันทึกรายรับ (Entity: Income_category)',
      'บันทึกรายจ่าย (Entity: Expense-category)',
      'บันทึกการขาย (Entity: Asset-type) — สินทรัพย์การลงทุน',
      'บันทึกการซื้อ (Entity: Asset-type) — สินทรัพย์การลงทุน',
      'CheckBalance — อ่านจาก Sheet รวมทุกชีต'
    ],
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Root
// ============================================================
app.get('/', (req, res) => {
  res.json({
    name: 'Income & Expense Dialogflow Webhook',
    version: '2.0.0',
    description: 'ระบบบันทึกรายรับ-รายจ่าย + สินทรัพย์การลงทุน ผ่าน Dialogflow + OCR',
    endpoints: {
      webhook: 'POST /webhook/dialogflow',
      ocr_scan: 'POST /api/ocr/scan',
      ocr_providers: 'GET /api/ocr/providers',
      health: 'GET /health'
    },
    intents: {
      'บันทึกรายรับ': 'บันทึกรายรับทั่วไป (Entity: Income_category)',
      'บันทึกรายจ่าย': 'บันทึกรายจ่ายทั่วไป (Entity: Expense-category)',
      'บันทึกการขาย': 'ขายสินทรัพย์การลงทุน เช่น หุ้น/กองทุน/ทองคำ/คริปโต (Entity: Asset-type)',
      'บันทึกการซื้อ': 'ซื้อสินทรัพย์การลงทุน เช่น หุ้น/กองทุน/ทองคำ/คริปโต (Entity: Asset-type)',
      'CheckBalance': 'ดูยอดคงเหลือจาก Sheet "รวมทุกชีต" (IMPORTRANGE)'
    },
    entities: {
      'Income_category': 'หมวดหมู่รายรับ เช่น ค่าแรง/เงินเดือน, รายได้จากการขาย',
      'Expense-category': 'หมวดหมู่รายจ่าย เช่น อาหาร, เดินทาง, ค่าสาธารณูปโภค',
      'Asset-type': 'ประเภทสินทรัพย์: หุ้น | กองทุน | ทองคำ | คริปโต | อื่นๆ'
    },
    platforms: ['Telegram', 'LINE', 'Facebook Messenger']
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔍 OCR Provider   : ${process.env.OCR_PROVIDER || 'tesseract'}`);
  console.log(`📊 Spreadsheet ID : ${process.env.GOOGLE_SPREADSHEET_ID || 'NOT SET'}`);
  console.log(`📋 Sheet รายรับ-รายจ่าย : ${process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย'}`);
  console.log(`📈 Sheet การลงทุน       : ${process.env.GOOGLE_INVEST_SHEET_NAME || 'การลงทุน'}`);
  console.log(`🗂️  Sheet สรุป (Balance) : ${process.env.GOOGLE_SUMMARY_SHEET_NAME || 'รวมทุกชีต'}`);
});

module.exports = app;
