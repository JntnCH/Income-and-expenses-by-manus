const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { parsePrivateKey, parseServiceAccountJson } = require('../utils/credentialsParser');

/**
 * Google Sheets Service
 * Fixed: Centralized credentials parsing for all environments
 */

function getAuthClient() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  if (process.env.K_SERVICE) {
    return new google.auth.GoogleAuth({ scopes });
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes,
      });
    } catch (error) {
      console.error('[AUTH] GOOGLE_SERVICE_ACCOUNT_JSON parsing failed:', error.message);
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  if (email && privateKeyRaw) {
    return new JWT({
      email,
      key: parsePrivateKey(privateKeyRaw),
      scopes,
    });
  }

  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return new google.auth.GoogleAuth({ scopes });
  }

  throw new Error(
    '[AUTH] Missing credentials. Configure GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY, or run on Google Cloud with Application Default Credentials'
  );
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

module.exports = { saveRecord, getBalanceSummary };
