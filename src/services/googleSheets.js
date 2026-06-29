const { google } = require('googleapis');

/**
 * Google Sheets Service
 * ปรับปรุงใหม่ตามโครงสร้างที่ผู้ใช้กำหนด
 * 
 * การบันทึก (Write) ลงชีต "รายรับ-รายจ่าย":
 * A: วันที่ (28/6/2026)
 * B: ประเภท (income, expense)
 * C: รายการ
 * D: จำนวนเงิน
 * E: หมวดหมู่
 * F: ช่องทาง
 * G: ผู้บันทึก
 * 
 * การเช็คยอด (Read) จากชีต "รวมทุกชีต":
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
 * ดึงวันเวลาปัจจุบันใน Timezone Asia/Bangkok
 */
function getBangkokNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

/**
 * รูปแบบวันที่สำหรับแสดงผลและบันทึก: 28/6/2026 (ไม่มี 0 นำหน้า)
 */
function formatThaiDate(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * ดึงเฉพาะวันที่สำหรับบันทึก: 28/6/2026
 */
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
    valueInputOption: 'USER_ENTERED', // เปลี่ยนกลับเป็น USER_ENTERED เพื่อลบเครื่องหมาย '
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
    valueInputOption: 'USER_ENTERED', // เปลี่ยนกลับเป็น USER_ENTERED เพื่อลบเครื่องหมาย '
    requestBody: { values: [row] }
  });

  return { success: true, row };
}

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
  
  const bangkokNow = getBangkokNow();
  const todayDay = bangkokNow.getDate();
  const todayMonth = bangkokNow.getMonth();
  const todayYear = bangkokNow.getFullYear();

  let dailyIncome = 0, dailyExpense = 0;
  let monthlyIncome = 0, monthlyExpense = 0;
  const todayItems = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // --- ประมวลผลรายจ่าย (A-D) ---
    if (row[0] && row[2]) {
      const expDate = parseDate(row[0]);
      const expAmount = parseFloat(String(row[2]).replace(/,/g, '')) || 0;
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
      const incAmount = parseFloat(String(row[8]).replace(/,/g, '')) || 0;
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

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // รองรับรูปแบบ "D/M/YYYY" หรือ "DD/MM/YYYY"
  const slashParts = String(dateStr).split(' ')[0].split('/');
  if (slashParts.length === 3) {
    const day = parseInt(slashParts[0]);
    const month = parseInt(slashParts[1]) - 1;
    const year = parseInt(slashParts[2]);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Fallback สำหรับรูปแบบเดิม "28 มิ.ย. 2026"
  const monthsMap = {
    'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
    'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11
  };
  const spaceParts = String(dateStr).split(' ');
  if (spaceParts.length >= 3) {
    const day = parseInt(spaceParts[0]);
    const month = monthsMap[spaceParts[1]];
    const year = parseInt(spaceParts[2]);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  let d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

async function getRecentRecords(limit = 10) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:G`
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
