const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { parsePrivateKey, parseServiceAccountJson } = require('../utils/credentialsParser');

/**
 * Google Sheets Service
 * Fixed: Centralized credentials parsing for all environments
 */

function getAuthClient() {
  try {
    // ✅ Method 1 (Recommended): Use full JSON from Secret Manager
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        const credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        return new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } catch (e) {
        console.error('[AUTH] GOOGLE_SERVICE_ACCOUNT_JSON parsing failed:', e.message);
        // Fall through to method 2
      }
    }

    // ✅ Method 2: Use separate environment variables
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !privateKeyRaw) {
      throw new Error(
        '[AUTH] Missing credentials. Provide either GOOGLE_SERVICE_ACCOUNT_JSON or both ' +
        'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY'
      );
    }

    const privateKey = parsePrivateKey(privateKeyRaw);

    return new JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (error) {
    console.error('[AUTH] Failed to initialize JWT client:', error.message);
    throw error;
  }
}

function getBangkokNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

function formatThaiDate(date) {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function getBangkokDateString() {
  return formatThaiDate(getBangkokNow());
}

function toNonNegativeNumber(value, fieldName) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error(`[VALIDATION] ${fieldName} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    error.code = 'INVALID_INVESTMENT_RECORD';
    throw error;
  }
  return parsed;
}

function buildInvestmentRow(data, date = getBangkokDateString()) {
  const action = String(data.action || '').trim();
  if (!['ซื้อ', 'ขาย'].includes(action)) {
    const error = new Error('[VALIDATION] action ต้องเป็น ซื้อ หรือ ขาย');
    error.code = 'INVALID_INVESTMENT_RECORD';
    throw error;
  }

  const assetName = String(data.assetName || '').trim();
  if (!assetName || assetName === 'ไม่ระบุ') {
    const error = new Error('[VALIDATION] กรุณาระบุชื่อสินทรัพย์');
    error.code = 'INVALID_INVESTMENT_RECORD';
    throw error;
  }

  const quantity = toNonNegativeNumber(data.quantity, 'quantity');
  const pricePerUnit = toNonNegativeNumber(data.pricePerUnit, 'pricePerUnit');
  const totalAmount = toNonNegativeNumber(data.totalAmount, 'totalAmount');
  if (totalAmount <= 0) {
    const error = new Error('[VALIDATION] totalAmount ต้องมากกว่า 0');
    error.code = 'INVALID_INVESTMENT_RECORD';
    throw error;
  }

  return [
    date,
    action,
    assetName,
    String(data.assetType || 'อื่นๆ').trim() || 'อื่นๆ',
    quantity,
    pricePerUnit,
    totalAmount,
    String(data.account || '').trim(),
    String(data.platform || 'Unknown').trim(),
    String(data.recorder || 'ไม่ระบุ').trim(),
    String(data.note || '').trim(),
  ];
}

async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const typeMap = { 'รายรับ': 'income', 'รายจ่าย': 'expense' };
  const type = typeMap[data.type] || data.type;

  const row = [
    getBangkokDateString(),
    type,
    data.item || 'ไม่ระบุ',
    parseFloat(data.amount) || 0,
    data.category || 'ทั่วไป',
    data.account,
    data.platform || 'Unknown',
    data.recorder || 'ไม่ระบุ',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

async function saveInvestmentRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_INVESTMENT_SHEET_NAME || 'การลงทุน';
  const row = buildInvestmentRow(data);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

async function getBalanceSummary() {
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const dashboardSheetName = 'BotDashboard';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${dashboardSheetName}!A1:Z40`,
    });

    const rows = response.data.values || [];
    const bangkokNow = getBangkokNow();

    const parse = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;

    const dailyIncome    = parse(rows[1]?.[1]);
    const dailyExpense   = parse(rows[2]?.[1]);
    const monthlyIncome  = parse(rows[3]?.[1]);
    const monthlyExpense = parse(rows[4]?.[1]);
    const balance        = parse(rows[5]?.[1]);

    const accountBalances = [];
    const accountNamesRow   = rows[1] || [];
    const accountAmountsRow = rows[2] || [];

    for (let col = 5; col < accountNamesRow.length; col++) {
      const name = accountNamesRow[col]?.trim();
      if (name) {
        accountBalances.push({ name, amount: parse(accountAmountsRow[col]) });
      }
    }

    const todayItems = [];
    for (let i = 7; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const incItem   = row[1];
      const incAmount = parse(row[2]);
      if (incItem && !['รายรับ', 'วันที่'].includes(incItem) && incAmount > 0) {
        todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
      }

      const expItem   = row[6];
      const expAmount = parse(row[7]);
      if (expItem && !['รายจ่าย', 'วันที่'].includes(expItem) && expAmount > 0) {
        todayItems.push({ item: expItem, type: 'รายจ่าย', amount: expAmount });
      }
    }

    return {
      dailyIncome, dailyExpense,
      monthlyIncome, monthlyExpense,
      balance, todayItems, accountBalances,
      summarySheet: dashboardSheetName,
      formattedDate: formatThaiDate(bangkokNow),
    };

  } catch (err) {
    console.error('[BALANCE ERROR]', err.message);
    console.error('[BALANCE ERROR STACK]', err.stack);
    throw err;
  }
}

module.exports = {
  saveRecord,
  saveInvestmentRecord,
  getBalanceSummary,
  buildInvestmentRow,
};
