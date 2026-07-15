const { google } = require('googleapis');

/**
 * Google Sheets Service
 * ปรับปรุงใหม่เพื่อรองรับคอลัมน์ Account และยอดแยกบัญชี
 */

function getAuthClient() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }

  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

function getBangkokNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

function formatThaiDate(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getBangkokDateString() {
  return formatThaiDate(getBangkokNow());
}

async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const typeMap = {
    'รายรับ': 'income',
    'รายจ่าย': 'expense'
  };
  const type = typeMap[data.type] || data.type;

  // โครงสร้างใหม่:
  // A:วันที่, B:ประเภท, C:รายการ, D:จำนวนเงิน, E:หมวดหมู่, F:Account, G:ช่องทาง, H:ผู้บันทึก
  const row = [
    getBangkokDateString(),       // A: วันที่
    type,                         // B: ประเภท
    data.item || 'ไม่ระบุ',         // C: รายการ
    parseFloat(data.amount) || 0, // D: จำนวนเงิน
    data.category || 'ทั่วไป',     // E: หมวดหมู่
    data.account || 'เงินสด',      // F: Account (บัญชีธนาคาร/เงินสด)
    data.platform || 'Unknown',   // G: ช่องทาง
    data.recorder || 'ไม่ระบุ'      // H: ผู้บันทึก
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  return { success: true, row };
}

async function getBalanceSummary() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const dashboardSheetName = 'BotDashboard'; 

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${dashboardSheetName}!A1:Z40` // ขยาย range เพื่อให้ครอบคลุมคอลัมน์ Account ด้านขวา
  });

  const rows = response.data.values || [];
  const bangkokNow = getBangkokNow();

  // --- 1. ดึงตัวเลขสรุปจากคอลัมน์ B (แถวที่ 2 ถึง 6) ---
  const dailyIncome   = parseFloat(String(rows[1]?.[1] || 0).replace(/,/g, ''));
  const dailyExpense  = parseFloat(String(rows[2]?.[1] || 0).replace(/,/g, ''));
  const monthlyIncome = parseFloat(String(rows[3]?.[1] || 0).replace(/,/g, ''));
  const monthlyExpense= parseFloat(String(rows[4]?.[1] || 0).replace(/,/g, ''));
  const balance       = parseFloat(String(rows[5]?.[1] || 0).replace(/,/g, ''));

  // --- 2. ดึงยอดเงินแยกตามบัญชี (แถว 2 และ 3 เริ่มจากคอลัมน์ F) ---
  const accountBalances = [];
  const accountNamesRow = rows[1] || []; // แถว 2
  const accountAmountsRow = rows[2] || []; // แถว 3

  // วนลูปตั้งแต่คอลัมน์ F (Index 5) เป็นต้นไป
  for (let col = 5; col < accountNamesRow.length; col++) {
    const name = accountNamesRow[col];
    const amountStr = accountAmountsRow[col];
    if (name && name.trim() !== '') {
      const amount = parseFloat(String(amountStr || 0).replace(/,/g, ''));
      accountBalances.push({ name, amount });
    }
  }

  // --- 3. ดึงรายการรายวันจาก BotDashboard (แถวที่ 8 เป็นต้นไป) ---
  const todayItems = [];
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // รายรับ: B8:รายรับ, C8:จำนวนเงิน
    const incItem = row[1];
    const incAmount = parseFloat(String(row[2] || 0).replace(/,/g, ''));
    if (incItem && incItem !== 'รายรับ' && incItem !== 'วันที่' && !isNaN(incAmount) && incAmount > 0) {
      todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
    }

    // รายจ่าย: G8:รายจ่าย, H8:จำนวนเงิน
    if (row.length >= 8) {
      const expItem = row[6];
      const expAmount = parseFloat(String(row[7] || 0).replace(/,/g, ''));
      if (expItem && expItem !== 'รายจ่าย' && expItem !== 'วันที่' && !isNaN(expAmount) && expAmount > 0) {
        todayItems.push({ item: expItem, type: 'รายจ่าย', amount: expAmount });
      }
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
    formattedDate: formatThaiDate(bangkokNow)
  };
}

module.exports = {
  saveRecord,
  getBalanceSummary
};
