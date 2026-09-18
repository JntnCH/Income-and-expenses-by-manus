const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { parsePrivateKey, parseServiceAccountJson } = require('../utils/credentialsParser');
const { BOT_DASHBOARD_MAPPING, DEFAULT_SHEETS } = require('../config/constants');

/**
 * Google Sheets Service
 * Fixed: Centralized credentials parsing for all environments
 * Features:
 * - saveRecord (Appends row with unique transactionId in Col I)
 * - findTransaction (Search by transactionId, date+item+amount, date+item, or criteria)
 * - updateTransaction (In-place update with verification from Google Sheets)
 * - getBalanceSummary (Parses BotDashboard with strict number normalization)
 * - saveInvestmentRecord (Appends to investment sheet)
 */

function getAuthClient() {
  try {
    // Method 1 (Recommended): Use full JSON from Secret Manager / env
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
      }
    }

    // Method 2: Use separate environment variables
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

/**
 * Normalizes number from sheet cell or user input
 * Handles commas "22,219.32", negative "(500.00)", currency symbols, empty cells, NaN
 */
function normalizeNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/฿/g, '').replace(/\s+/g, '');
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.substring(1, str.length - 1);
  }
  str = str.replace(/,/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function isDateMatch(sheetDate, targetDate) {
  if (!sheetDate || !targetDate) return false;
  const s = String(sheetDate).trim();
  const t = String(targetDate).trim();
  if (t === 'วันนี้' || t.toLowerCase() === 'today') {
    return s === getBangkokDateString();
  }
  if (s === t) return true;
  const partsS = s.split(/[\/\-.]/).map(p => parseInt(p, 10));
  const partsT = t.split(/[\/\-.]/).map(p => parseInt(p, 10));
  if (partsS.length === 3 && partsT.length === 3) {
    return partsS[0] === partsT[0] && partsS[1] === partsT[1] && partsS[2] === partsT[2];
  }
  return false;
}

function isItemMatch(sheetItem, targetItem) {
  if (!sheetItem || !targetItem) return false;
  const s = String(sheetItem).trim().toLowerCase();
  const t = String(targetItem).trim().toLowerCase();
  return s === t || s.includes(t) || t.includes(s);
}

/**
 * Save record to Google Sheets (Append row)
 * Generates unique transactionId in Col I (index 8) if not provided
 */
async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEETS.transactionSheet;

  const typeMap = { 'รายรับ': 'income', 'รายจ่าย': 'expense' };
  const type = typeMap[data.type] || data.type;
  const transactionId = data.transactionId || `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const row = [
    data.date || getBangkokDateString(), // Col A (0): วันที่
    type,                                 // Col B (1): ประเภท
    data.item || 'ไม่ระบุ',               // Col C (2): รายการ
    normalizeNumber(data.amount),         // Col D (3): จำนวนเงิน
    data.category || 'ทั่วไป',            // Col E (4): หมวดหมู่
    data.account || 'เงินสด',             // Col F (5): บัญชี
    data.platform || 'Unknown',           // Col G (6): แพลตฟอร์ม
    data.recorder || 'ไม่ระบุ',           // Col H (7): ผู้บันทึก
    transactionId                         // Col I (8): Transaction ID
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return { success: true, row, transactionId };
}

/**
 * Find transactions matching search criteria
 * Search priority:
 * 1. transactionId
 * 2. date + item + amount
 * 3. date + item
 * 4. conditions from Dialogflow (item and/or amount)
 */
async function findTransaction(criteria = {}) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEETS.transactionSheet;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:I`,
  });

  const rows = response.data.values || [];
  const parsedRows = rows.map((row, idx) => ({
    rowIndex: idx + 2, // Row 1 is header, so index 0 is Row 2
    date: row[0] || '',
    type: row[1] || '',
    item: row[2] || '',
    amount: normalizeNumber(row[3]),
    category: row[4] || '',
    account: row[5] || '',
    platform: row[6] || '',
    recorder: row[7] || '',
    transactionId: row[8] || `tx_${idx + 2}`,
    raw: row
  }));

  // 1. Match by transactionId
  const targetId = criteria.transactionId || criteria.id || criteria.txId;
  if (targetId) {
    const cleanTargetId = String(targetId).trim();
    const match = parsedRows.filter(r => 
      r.transactionId === cleanTargetId || 
      String(r.rowIndex) === cleanTargetId.replace(/\D/g, '')
    );
    if (match.length > 0) return match;
  }

  // 2. Match by วันที่ + รายการ + จำนวนเงิน
  const queryDate = criteria.date || criteria['วันที่'];
  const queryItem = criteria.oldItem || criteria.item || criteria['รายการเดิม'] || criteria['รายการ'];
  const queryAmount = criteria.oldAmount !== undefined ? criteria.oldAmount : (criteria.amount !== undefined ? criteria.amount : (criteria['จำนวนเงินเดิม'] !== undefined ? criteria['จำนวนเงินเดิม'] : criteria['จำนวนเงิน']));

  if (queryDate && queryItem && queryAmount !== undefined && queryAmount !== null && queryAmount !== '') {
    const numAmount = normalizeNumber(queryAmount);
    const matches = parsedRows.filter(r => 
      isDateMatch(r.date, queryDate) &&
      isItemMatch(r.item, queryItem) &&
      Math.abs(r.amount - numAmount) < 0.01
    );
    if (matches.length > 0) return matches;
  }

  // 3. Match by วันที่ + รายการ
  if (queryDate && queryItem) {
    const matches = parsedRows.filter(r => 
      isDateMatch(r.date, queryDate) &&
      isItemMatch(r.item, queryItem)
    );
    if (matches.length > 0) return matches;
  }

  // 4. Match by เงื่อนไขที่ Dialogflow ส่งมา
  if (queryItem && queryAmount !== undefined && queryAmount !== null && queryAmount !== '') {
    const numAmount = normalizeNumber(queryAmount);
    const matches = parsedRows.filter(r => 
      isItemMatch(r.item, queryItem) &&
      Math.abs(r.amount - numAmount) < 0.01
    );
    if (matches.length > 0) return matches;
  }

  if (queryItem) {
    const matches = parsedRows.filter(r => isItemMatch(r.item, queryItem));
    if (matches.length > 0) return matches;
  }

  if (queryAmount !== undefined && queryAmount !== null && queryAmount !== '') {
    const numAmount = normalizeNumber(queryAmount);
    const matches = parsedRows.filter(r => Math.abs(r.amount - numAmount) < 0.01);
    if (matches.length > 0) return matches;
  }

  return [];
}

/**
 * Update transaction in-place (never appends, modifies existing row)
 * Re-fetches updated row from Google Sheets to verify changes before returning.
 */
async function updateTransaction(rowIndexOrId, updates = {}) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEETS.transactionSheet;

  let rowIndex = typeof rowIndexOrId === 'number' ? rowIndexOrId : parseInt(rowIndexOrId, 10);
  if (isNaN(rowIndex) && typeof rowIndexOrId === 'string') {
    const found = await findTransaction({ transactionId: rowIndexOrId });
    if (!found || found.length === 0) {
      throw new Error(`ไม่พบรายการที่มี Transaction ID: ${rowIndexOrId}`);
    }
    rowIndex = found[0].rowIndex;
  }

  if (!rowIndex || rowIndex < 2) {
    throw new Error(`ตำแหน่งแถวไม่ถูกต้อง: ${rowIndex}`);
  }

  // Fetch current row
  const currentRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:I${rowIndex}`,
  });

  const currentRow = currentRes.data.values?.[0] || [];
  if (currentRow.length === 0) {
    throw new Error(`ไม่พบข้อมูลในแถวที่ ${rowIndex}`);
  }

  const oldTransaction = {
    rowIndex,
    date: currentRow[0] || '',
    type: currentRow[1] || '',
    item: currentRow[2] || '',
    amount: normalizeNumber(currentRow[3]),
    category: currentRow[4] || '',
    account: currentRow[5] || '',
    platform: currentRow[6] || '',
    recorder: currentRow[7] || '',
    transactionId: currentRow[8] || `tx_${rowIndex}`
  };

  // Prepare updated values (Partial Update)
  const finalDate = (updates.newDate !== undefined && updates.newDate !== null && updates.newDate !== '') 
    ? updates.newDate : (updates.date || oldTransaction.date);

  const typeMap = { 'รายรับ': 'income', 'รายจ่าย': 'expense' };
  const rawType = updates.newType !== undefined ? updates.newType : (updates.type || oldTransaction.type);
  const finalType = typeMap[rawType] || rawType;

  const finalItem = (updates.newItem !== undefined && updates.newItem !== null && updates.newItem !== '') 
    ? String(updates.newItem).trim() : oldTransaction.item;

  const finalAmount = (updates.newAmount !== undefined && updates.newAmount !== null && updates.newAmount !== '') 
    ? normalizeNumber(updates.newAmount) : oldTransaction.amount;

  const finalCategory = (updates.newCategory !== undefined && updates.newCategory !== null && updates.newCategory !== '') 
    ? String(updates.newCategory).trim() : oldTransaction.category;

  const finalAccount = (updates.newAccount !== undefined && updates.newAccount !== null && updates.newAccount !== '') 
    ? String(updates.newAccount).trim() : oldTransaction.account;

  const finalPlatform = updates.platform || oldTransaction.platform;
  const finalRecorder = updates.recorder || oldTransaction.recorder;
  const finalTxId = oldTransaction.transactionId || `tx_${Date.now()}_${rowIndex}`;

  const updatedRowValues = [
    finalDate,
    finalType,
    finalItem,
    finalAmount,
    finalCategory,
    finalAccount,
    finalPlatform,
    finalRecorder,
    finalTxId
  ];

  // Update row in-place
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:I${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRowValues]
    }
  });

  // Verify by re-fetching the updated row
  const verifyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:I${rowIndex}`,
  });

  const verifiedRow = verifyRes.data.values?.[0];
  if (!verifiedRow) {
    throw new Error('การตรวจสอบหลังแก้ไขล้มเหลว: ไม่พบข้อมูลที่อัปเดตในสเปรดชีต');
  }

  const newTransaction = {
    rowIndex,
    date: verifiedRow[0],
    type: verifiedRow[1],
    item: verifiedRow[2],
    amount: normalizeNumber(verifiedRow[3]),
    category: verifiedRow[4],
    account: verifiedRow[5],
    platform: verifiedRow[6],
    recorder: verifiedRow[7],
    transactionId: verifiedRow[8] || finalTxId
  };

  return {
    success: true,
    verified: true,
    oldTransaction,
    newTransaction,
    rowIndex
  };
}

/**
 * Get Balance Summary from BotDashboard sheet
 * Normalizes all numbers and extracts today's items & account balances
 */
async function getBalanceSummary() {
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const dashboardSheetName = process.env.GOOGLE_BOTDASHBOARD_SHEET_NAME || DEFAULT_SHEETS.dashboardSheet;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${dashboardSheetName}!A1:Z50`,
    });

    const rows = response.data.values || [];
    const bangkokNow = getBangkokNow();

    const dailyIncome    = normalizeNumber(rows[1]?.[1]);
    const dailyExpense   = normalizeNumber(rows[2]?.[1]);
    const monthlyIncome  = normalizeNumber(rows[3]?.[1]);
    const monthlyExpense = normalizeNumber(rows[4]?.[1]);
    const balance        = normalizeNumber(rows[5]?.[1]);

    const accountBalances = [];
    const accountNamesRow   = rows[1] || [];
    const accountAmountsRow = rows[2] || [];

    for (let col = 5; col < accountNamesRow.length; col++) {
      const name = accountNamesRow[col]?.trim();
      if (name) {
        accountBalances.push({ name, amount: normalizeNumber(accountAmountsRow[col]) });
      }
    }

    const todayItems = [];
    for (let i = 7; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const incItem   = row[1];
      const incAmount = normalizeNumber(row[2]);
      if (incItem && !['รายรับ', 'วันที่', 'รวม'].includes(incItem) && incAmount > 0) {
        todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
      }

      const expItem   = row[6];
      const expAmount = normalizeNumber(row[7]);
      if (expItem && !['รายจ่าย', 'วันที่', 'รวม'].includes(expItem) && expAmount > 0) {
        todayItems.push({ item: expItem, type: 'รายจ่าย', amount: expAmount });
      }
    }

    return {
      dailyIncome,
      dailyExpense,
      monthlyIncome,
      monthlyExpense,
      balance,
      todayItems,
      accountBalances,
      summarySheet: dashboardSheetName,
      formattedDate: formatThaiDate(bangkokNow),
    };

  } catch (err) {
    console.error('[BALANCE ERROR]', err.message);
    console.error('[BALANCE ERROR STACK]', err.stack);
    throw err;
  }
}

async function saveInvestmentRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_INVESTMENT_SHEET_NAME || DEFAULT_SHEETS.investmentSheet;

  const row = [
    getBangkokDateString(),
    data.action || 'ซื้อ',
    data.assetType || 'สินทรัพย์',
    data.assetName || 'ไม่ระบุ',
    normalizeNumber(data.quantity),
    normalizeNumber(data.pricePerUnit),
    normalizeNumber(data.totalAmount),
    data.platform || 'Unknown',
    data.recorder || 'ไม่ระบุ',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

module.exports = {
  getAuthClient,
  saveRecord,
  findTransaction,
  updateTransaction,
  getBalanceSummary,
  saveInvestmentRecord,
  normalizeNumber,
  formatThaiDate,
  getBangkokDateString
};
