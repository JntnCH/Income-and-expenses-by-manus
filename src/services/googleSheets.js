const { google } = require('googleapis');

/**
 * Google Sheets Service
 * จัดการการอ่าน/เขียนข้อมูลลง Google Sheets
 *
 * Sheet 1: รายรับ-รายจ่าย (ชีวิตประจำวัน)
 *   คอลัมน์: วันที่/เวลา | รายการ | ประเภท | จำนวนเงิน | หมวดหมู่ | หมายเหตุ | ช่องทาง | ผู้บันทึก
 *
 * Sheet 2: การลงทุน (ซื้อ/ขาย หุ้น กองทุน ทองคำ คริปโต)
 *   คอลัมน์: วันที่/เวลา | การดำเนินการ | ประเภทสินทรัพย์ | ชื่อสินทรัพย์ | จำนวนหน่วย | ราคา/หน่วย | ยอดรวม | ช่องทาง | ผู้บันทึก
 *
 * Sheet สรุป: รวมทุกชีต (IMPORTRANGE รวมข้อมูลจากทุก Sheet ไว้แล้ว)
 *   ใช้สำหรับ getBalanceSummary() อ่านชีตเดียวแทนการวนอ่านทุก Sheet
 *   env: GOOGLE_SUMMARY_SHEET_NAME=รวมทุกชีต
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

function getBangkokDateString() {
  return new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ============================================================
// Sheet 1: บันทึกรายรับ-รายจ่าย (ชีวิตประจำวัน)
// ============================================================

/**
 * บันทึกรายการรายรับ/รายจ่ายลง Google Sheets
 * @param {Object} data - { item, type, amount, category, note, platform, recorder }
 */
async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  const row = [
    getBangkokDateString(),           // A: วันที่/เวลา
    data.item || 'ไม่ระบุ',           // B: รายการ
    data.type || 'รายจ่าย',           // C: ประเภท
    parseFloat(data.amount) || 0,     // D: จำนวนเงิน
    data.category || 'ทั่วไป',        // E: หมวดหมู่
    data.note || '',                  // F: หมายเหตุ
    data.platform || 'Unknown',       // G: ช่องทาง
    data.recorder || 'ไม่ระบุ'        // H: ผู้บันทึก ← คอลัมน์ท้ายสุด
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  return { success: true, row };
}

// ============================================================
// Sheet 2: บันทึกการซื้อ/ขายสินทรัพย์การลงทุน
// ============================================================

/**
 * บันทึกการซื้อ/ขายสินทรัพย์การลงทุนลง Sheet แยก
 * @param {Object} data - { action, assetType, assetName, quantity, pricePerUnit, totalAmount, platform, recorder }
 *
 * action      : 'ซื้อ' หรือ 'ขาย'
 * assetType   : 'หุ้น' | 'กองทุน' | 'ทองคำ' | 'คริปโต' | 'อื่นๆ'
 * assetName   : ชื่อสินทรัพย์ เช่น "PTT", "Bitcoin", "ทองคำ 96.5%"
 * quantity    : จำนวนหน่วย/หุ้น/กรัม/เหรียญ
 * pricePerUnit: ราคาต่อหน่วย (ถ้ามี)
 * totalAmount : ยอดรวม
 */
async function saveInvestmentRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const investSheetName = process.env.GOOGLE_INVEST_SHEET_NAME || 'การลงทุน';

  await ensureInvestmentHeaderRow(sheets, spreadsheetId, investSheetName);

  const row = [
    getBangkokDateString(),                    // A: วันที่/เวลา
    data.action || 'ซื้อ',                     // B: การดำเนินการ (ซื้อ/ขาย)
    data.assetType || 'อื่นๆ',                 // C: ประเภทสินทรัพย์
    data.assetName || 'ไม่ระบุ',               // D: ชื่อสินทรัพย์
    parseFloat(data.quantity) || 0,            // E: จำนวนหน่วย
    parseFloat(data.pricePerUnit) || 0,        // F: ราคา/หน่วย
    parseFloat(data.totalAmount) || 0,         // G: ยอดรวม (บาท)
    data.platform || 'Unknown',                // H: ช่องทาง
    data.recorder || 'ไม่ระบุ'                 // I: ผู้บันทึก ← คอลัมน์ท้ายสุด
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${investSheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  console.log(`[SHEETS] Investment record saved: ${data.action} ${data.assetName} (${data.assetType})`);
  return { success: true, row };
}

// ============================================================
// ดูยอดคงเหลือ — อ่านจาก Sheet "รวมทุกชีต" ชีตเดียว
// ============================================================

/**
 * ดึงข้อมูลสรุปยอดรายรับ-รายจ่าย
 * อ่านจาก Sheet "รวมทุกชีต" ชีตเดียว ซึ่งใช้ IMPORTRANGE รวมข้อมูลจากทุก Sheet ไว้แล้ว
 * กำหนดชื่อ Sheet ได้ผ่าน env: GOOGLE_SUMMARY_SHEET_NAME (default: รวมทุกชีต)
 */
async function getBalanceSummary() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // ชื่อ Sheet สรุปที่ใช้ IMPORTRANGE รวมข้อมูลไว้แล้ว
  const summarySheetName = process.env.GOOGLE_SUMMARY_SHEET_NAME || 'รวมทุกชีต';

  console.log(`[SHEETS] Reading balance from summary sheet: "${summarySheetName}"`);

  const now = new Date();
  const bangkokNow = new Date(now.toLocaleString('th', { timeZone: 'Asia/Bangkok' }));
  const todayDay = bangkokNow.getDate();
  const todayMonth = bangkokNow.getMonth();
  const todayYear = bangkokNow.getFullYear();

  let dailyIncome = 0, dailyExpense = 0;
  let monthlyIncome = 0, monthlyExpense = 0;
  const todayItems = [];

  // อ่านข้อมูลจาก Sheet รวมทุกชีต ชีตเดียว
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${summarySheetName}!A:H`
  });

  const rows = response.data.values || [];
  console.log(`[SHEETS] Total rows in "${summarySheetName}": ${rows.length - 1}`);

  // เริ่มจากแถวที่ 2 (ข้าม Header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    const rowDate = new Date(row[0]);
    const rowType = row[2];
    const rowAmount = parseFloat(row[3]) || 0;
    const rowItem = row[1] || '';
    const rowRecorder = row[7] || 'ไม่ระบุ';

    if (isNaN(rowDate.getTime())) continue;
    if (rowType !== 'รายรับ' && rowType !== 'รายจ่าย') continue;

    const bangkokRowDate = new Date(rowDate.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));

    if (bangkokRowDate.getMonth() === todayMonth && bangkokRowDate.getFullYear() === todayYear) {
      if (rowType === 'รายรับ') monthlyIncome += rowAmount;
      if (rowType === 'รายจ่าย') monthlyExpense += rowAmount;

      if (bangkokRowDate.getDate() === todayDay) {
        if (rowType === 'รายรับ') dailyIncome += rowAmount;
        if (rowType === 'รายจ่าย') dailyExpense += rowAmount;
        todayItems.push({
          item: rowItem,
          type: rowType,
          amount: rowAmount,
          recorder: rowRecorder
        });
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
    summarySheet: summarySheetName
  };
}

// ============================================================
// Utility: ตรวจสอบและสร้าง Header Row
// ============================================================

/**
 * ตรวจสอบและสร้าง Header Row สำหรับ Sheet รายรับ-รายจ่าย
 */
async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:H1`
    });
    const firstRow = response.data.values?.[0];
    if (!firstRow || firstRow[0] !== 'วันที่/เวลา') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'วันที่/เวลา',   // A
            'รายการ',        // B
            'ประเภท',        // C
            'จำนวนเงิน',     // D
            'หมวดหมู่',      // E
            'หมายเหตุ',      // F
            'ช่องทาง',       // G
            'ผู้บันทึก'      // H ← ท้ายสุด
          ]]
        }
      });
      console.log(`[SHEETS] Header row created for sheet: ${sheetName}`);
    }
  } catch (e) {
    console.warn(`[SHEETS] Could not ensure header for "${sheetName}": ${e.message}`);
  }
}

/**
 * ตรวจสอบและสร้าง Header Row สำหรับ Sheet การลงทุน
 */
async function ensureInvestmentHeaderRow(sheets, spreadsheetId, sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:I1`
    });
    const firstRow = response.data.values?.[0];
    if (!firstRow || firstRow[0] !== 'วันที่/เวลา') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:I1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'วันที่/เวลา',       // A
            'การดำเนินการ',      // B (ซื้อ/ขาย)
            'ประเภทสินทรัพย์',   // C (หุ้น/กองทุน/ทองคำ/คริปโต/อื่นๆ)
            'ชื่อสินทรัพย์',     // D (PTT, Bitcoin, ทองคำ 96.5%)
            'จำนวนหน่วย',        // E
            'ราคา/หน่วย (บาท)',  // F
            'ยอดรวม (บาท)',      // G
            'ช่องทาง',           // H
            'ผู้บันทึก'          // I ← ท้ายสุด
          ]]
        }
      });
      console.log(`[SHEETS] Investment header row created for sheet: ${sheetName}`);
    }
  } catch (e) {
    console.warn(`[SHEETS] Could not ensure investment header for "${sheetName}": ${e.message}`);
  }
}

/**
 * ดึงรายการล่าสุด N รายการ
 */
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
  const data = rows.slice(1);
  return data.slice(-limit).reverse();
}

module.exports = {
  saveRecord,
  saveInvestmentRecord,
  getBalanceSummary,
  getRecentRecords
};
