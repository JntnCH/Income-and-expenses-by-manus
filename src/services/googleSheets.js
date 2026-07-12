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
  const auth = getAuthClient();[span_10](start_span)[span_10](end_span)
  const sheets = google.sheets({ version: 'v4', auth });[span_11](start_span)[span_11](end_span)
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;[span_12](start_span)[span_12](end_span)
  
  // ชี้เป้าไปที่ชีตหน้าแดชบอร์ดสรุป ดึงมาแค่พื้นที่ A1 ถึง I40 พอครับ
  const dashboardSheetName = 'BotDashboard'; 

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${dashboardSheetName}!A1:I40`
  });

  const rows = response.data.values || [];
  const bangkokNow = getBangkokNow();[span_13](start_span)[span_13](end_span)

  // --- 1. ดึงตัวเลขสรุปจากคอลัมน์ B (แถวที่ 2 ถึง 6) ---
  // โค้ด JavaScript นับ Index เริ่มจาก 0 (ดังนั้น แถว 2 คือ index 1, คอลัมน์ B คือ index 1)
  const dailyIncome   = parseFloat(String(rows[1]?.[1] || 0).replace(/,/g, ''));
  const dailyExpense  = parseFloat(String(rows[2]?.[1] || 0).replace(/,/g, ''));
  const monthlyIncome = parseFloat(String(rows[3]?.[1] || 0).replace(/,/g, ''));
  const monthlyExpense= parseFloat(String(rows[4]?.[1] || 0).replace(/,/g, ''));
  const balance       = parseFloat(String(rows[5]?.[1] || 0).replace(/,/g, ''));

  const todayItems = [];

  // --- 2. ดึงรายการรายวันฝั่งรายรับ (เริ่มแถว 9 คือ index 8 เป็นต้นไป) ---
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // คอลัมน์ B (index 1) คือ ชื่อรายรับ, คอลัมน์ C (index 2) คือ จำนวนเงิน
    const incItem = row[1];
    const incAmount = parseFloat(String(row[2] || 0).replace(/,/g, ''));
    
    if (incItem && incItem !== 'ไม่มีรายรับ' && !isNaN(incAmount) && incAmount > 0) {
      todayItems.push({ item: incItem, type: 'รายรับ', amount: incAmount });
    }
  }

  // --- 3. ดึงรายการรายวันฝั่งรายจ่าย (เริ่มแถว 9 คือ index 8 เป็นต้นไป) ---
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // คอลัมน์ G (index 6) คือ ชื่อรายจ่าย, คอลัมน์ H (index 7) คือ จำนวนเงิน
    const expItem = row[6];
    const expAmount = parseFloat(String(row[7] || 0).replace(/,/g, ''));
    
    if (expItem && expItem !== 'ไม่มีรายจ่าย' && !isNaN(expAmount) && expAmount > 0) {
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
    summarySheet: dashboardSheetName,
    formattedDate: formatThaiDate(bangkokNow)[span_14](start_span)[span_14](end_span)
  };
}
