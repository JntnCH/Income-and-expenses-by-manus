/**
 * Centralized Configuration Layer
 * Validates, normalizes, and exposes configuration without breaking existing references.
 */

const { BOT_DASHBOARD_MAPPING, DEFAULT_SHEETS } = require('./constants');

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  
  cors: {
    origins: process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) 
      : [
          process.env.FRONTEND_URL || 'https://income-expense-docker-274212739997.asia-southeast3.run.app',
          'https://income-and-expenses-by-manus.vercel.app'
        ]
  },

  security: {
    adminApiKey: process.env.ADMIN_API_KEY || '',
    dialogflowWebhookSecret: process.env.DIALOGFLOW_WEBHOOK_SECRET || '',
  },

  google: {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    monthlySpreadsheetId: process.env.MONTHLY_SPREADSHEET_ID || '',
    debtSpreadsheetId: process.env.DEBT_SPREADSHEET_ID || '',
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    sheets: {
      transactions: process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEETS.transactionSheet,
      dashboard: process.env.GOOGLE_BOTDASHBOARD_SHEET_NAME || DEFAULT_SHEETS.dashboardSheet,
      investments: process.env.GOOGLE_INVEST_SHEET_NAME || DEFAULT_SHEETS.investmentSheet,
      monthlyExpense: DEFAULT_SHEETS.monthlySheet
    },
    dashboardMapping: BOT_DASHBOARD_MAPPING
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '',
    defaultChatId: process.env.MY_TELEGRAM_CHAT_ID || ''
  },

  ocr: {
    provider: process.env.OCR_PROVIDER || 'tesseract',
    iappApiKey: process.env.IAPP_API_KEY || '',
    appmanApiKey: process.env.APPMAN_API_KEY || '',
    spaceocrApiKey: process.env.SPACEOCR_API_KEY || ''
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  },

  dialogflow: {
    projectId: process.env.DIALOGFLOW_PROJECT_ID || ''
  }
};

module.exports = config;
