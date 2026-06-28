const { google } = require('googleapis');

/**
 * Google Sheets Service
 * ปรับปรุงใหม่ตามโครงสร้างชีต "รวมทุกชีต" ของผู้ใช้
 * 
 * รายรับ: G=วันที่, H=รายการ, I=จำนวนเงิน, J=กลุ่มรายรับ
 * รายจ่าย: A=วันที่, B=รายการ, C=จำนวนเงิน, D=กลุ่มรายจ่าย
 */

function getAuthClient() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

/**
 * รูปแบบวันที่: 27 มิ.ย. 2026
 */
function formatThaiDate(date) {
  const months = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getBangkokDateString() {
  const d = new Date();
  const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return d.toLocaleString('th-TH', options);
}

async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const row = [
    getBangkokDateString(),
    data.item || 'ไม่ระบุ',
    data.type || 'รายจ่าย',
    parseFloat(data.amount) || 0,
    data.category || 'ทั่วไป',
    data.note || '',
    data.platform || 'Unknown',
    data.recorder || 'ไม่ระบุ'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
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

/**
 * ดึงข้อมูลสรุปยอดจากชีต "รวมทุกชีต"
 * รายรับ: G=วันที่, H=รายการ, I=จำนวนเงิน, J=กลุ่มรายรับ
 * รายจ่าย: A=วันที่, B=รายการ, C=จำนวนเงิน, D=กลุ่มรายจ่าย
 */
async function getBalanceSummary() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const summarySheetName = process.env.GOOGLE_SUMMARY_SHEET_NAME || 'รวมทุกชีต';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${summarySheetName}!A:J`
  });

  const rows = response.data.values || [];
  
  const now = new Date();
  const bangkokNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const todayDay = bangkokNow.getDate();
  const todayMonth = bangkokNow.getMonth();
  const todayYear = bangkokNow.getFullYear();

  let dailyIncome = 0, dailyExpense = 0;
  let monthlyIncome = 0, monthlyExpense = 0;
  const todayItems = [];

  // เริ่มจากแถวที่ 2
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // --- ประมวลผลรายจ่าย (A-D) ---
    if (row[0] && row[2]) {
      const expDate = parseDate(row[0]);
      const expAmount = parseFloat(row[2].replace(/,/g, '')) || 0;
      const expItem = row[1] || '';

      if (expDate && !isNaN(expAmount)) {
        if (expDate.getMonth() === todayMonth && expDate.getFullYear() === todayYear) {
          monthlyExpense += expAmount;
          if (expDate.getDate() === todayDay) {
            dailyExpense += expAmount;
            todayItems.push({ item: expItem, type: 'รายจ่าย', amount: expAmount });
          }
        }
      }
    }

    // --- ประมวลผลรายรับ (G-J) ---
    if (row[6] && row[8]) {
      const incDate = parseDate(row[6]);
      const incAmount = parseFloat(row[8].replace(/,/g, '')) || 0;
      const incItem = row[7] || '';

      if (incDate && !isNaN(incAmount)) {
        if (incDate.getMonth() === todayMonth && incDate.getFullYear() === todayYear) {
          monthlyIncome += incAmount;
          if (incDate.getDate() === todayDay) {
            dailyIncome += incAmount;
            todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
          }
        }
      }
    }
  }

  return {
    dailyIncome,
    dailyExpense,
    monthlyIncome,
    monthlyExpense,
    balance: monthlyIncome - monthlyExpense,
    todayItems,
    summarySheet: summarySheetName,
    formattedDate: formatThaiDate(bangkokNow)
  };
}

/**
 * ช่วยแปลงวันที่จากชีตให้เป็น Date Object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  // รองรับรูปแบบ DD/MM/YYYY หรือ YYYY-MM-DD
  let d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // ลองแปลงแบบไทย DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      d = new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }
  return isNaN(d.getTime()) ? null : d;
}

async function getRecentRecords(limit = 10) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:H`
  });

  const rows = response.data.values || [];
  return rows.slice(1).slice(-limit).reverse();
}

module.exports = {
  saveRecord,
  saveInvestmentRecord,
  getBalanceSummary,
  getRecentRecords,
  formatThaiDate
};
