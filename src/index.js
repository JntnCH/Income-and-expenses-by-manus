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

// Rate Limiting - ป้องกัน abuse
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

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Income & Expense Bot is running',
    ocr_provider: process.env.OCR_PROVIDER || 'tesseract',
    timestamp: new Date().toISOString()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'Income & Expense Dialogflow Webhook',
    version: '1.0.0',
    endpoints: {
      webhook: 'POST /webhook/dialogflow',
      ocr: 'POST /api/ocr/scan',
      health: 'GET /health'
    }
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
  console.log(`🔍 OCR Provider: ${process.env.OCR_PROVIDER || 'tesseract'}`);
  console.log(`📊 Google Sheet ID: ${process.env.GOOGLE_SPREADSHEET_ID || 'NOT SET'}`);
});

module.exports = app;
