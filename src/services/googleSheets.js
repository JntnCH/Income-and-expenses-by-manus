const { google } = require('googleapis');

/**
 * Google Sheets Service
 * ปรับปรุงใหม่ตามโครงสร้างที่ผู้ใช้กำหนด (BotDashboard)
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

  const row = [
    getBangkokDateString(),       // A: วันที่
    type,                         // B: ประเภท
    data.item || 'ไม่ระบุ',         // C: รายการ
    parseFloat(data.amount) || 0, // D: จำนวนเงิน
    data.category || 'ทั่วไป',     // E: หมวดหมู่
    data.platform || 'Unknown',   // F: ช่องทาง
    data.recorder || 'ไม่ระบุ'      // G: ผู้บันทึก
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  return { success: true, row };
}

async function saveInvestmentRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const investSheetName = process.env.GOOGLE_INVEST_SHEET_NAME || 'การลงทุน';

  const row = [
    getBangkokDateString(),
    data.action || 'ซื้อ',
    data.assetType || 'อื่นๆ',
    data.assetName || 'ไม่ระบุ',
    parseFloat(data.quantity) || 0,
    parseFloat(data.pricePerUnit) || 0,
    parseFloat(data.totalAmount) || 0,
    data.platform || 'Unknown',
    data.recorder || 'ไม่ระบุ'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${investSheetName}!A:I`,
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

  // ดึงข้อมูลจากชีต BotDashboard เท่านั้น
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${dashboardSheetName}!A1:I40`
  });

  const rows = response.data.values || [];
  const bangkokNow = getBangkokNow();

  // --- 1. ดึงตัวเลขสรุปจากคอลัมน์ B (แถวที่ 2 ถึง 6) ---
  // B2:รายรับวัน, B3:รายจ่ายวัน, B4:รายรับเดือน, B5:รายจ่ายเดือน, B6:ยอดคงเหลือ
  const dailyIncome   = parseFloat(String(rows[1]?.[1] || 0).replace(/,/g, ''));
  const dailyExpense  = parseFloat(String(rows[2]?.[1] || 0).replace(/,/g, ''));
  const monthlyIncome = parseFloat(String(rows[3]?.[1] || 0).replace(/,/g, ''));
  const monthlyExpense= parseFloat(String(rows[4]?.[1] || 0).replace(/,/g, ''));
  const balance       = parseFloat(String(rows[5]?.[1] || 0).replace(/,/g, ''));

  const todayItems = [];

  // --- 2. ดึงรายการรายวันจาก BotDashboard (แถวที่ 8 เป็นต้นไป) ---
  // รายรับ: B8:รายรับ, C8:จำนวนเงิน
  // รายจ่าย: G8:รายจ่าย, H8:จำนวนเงิน
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // ตรวจสอบฝั่งรายรับ (คอลัมน์ B, C)
    const incItem = row[1];
    const incAmount = parseFloat(String(row[2] || 0).replace(/,/g, ''));
    if (incItem && incItem !== 'รายรับ' && incItem !== 'วันที่' && !isNaN(incAmount) && incAmount > 0) {
      todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
    }

    // ตรวจสอบฝั่งรายจ่าย (คอลัมน์ G, H)
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
    summarySheet: dashboardSheetName,
    formattedDate: formatThaiDate(bangkokNow)
  };
}

module.exports = {
  saveRecord,
  saveInvestmentRecord,
  getBalanceSummary
};
