const { google } = require('googleapis');

/**
 * Google Sheets Service
 * จัดการการอ่าน/เขียนข้อมูลรายรับ-รายจ่ายลงบน Google Sheets
 *
 * โครงสร้างคอลัมน์:
 * A: วันที่/เวลา
 * B: รายการ
 * C: ประเภท (รายรับ/รายจ่าย)
 * D: จำนวนเงิน
 * E: หมวดหมู่
 * F: หมายเหตุ
 * G: ช่องทาง (Telegram/LINE/Facebook)
 * H: ผู้บันทึก  ← คอลัมน์ท้ายสุด
 */

function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth;
}

/**
 * บันทึกรายการลง Google Sheets
 * @param {Object} data - ข้อมูลรายการ
 * @param {string} data.item        - รายการ
 * @param {string} data.type        - ประเภท (รายรับ/รายจ่าย)
 * @param {number} data.amount      - จำนวนเงิน
 * @param {string} data.category    - หมวดหมู่
 * @param {string} data.note        - หมายเหตุ (optional)
 * @param {string} data.platform    - ช่องทาง เช่น Telegram, LINE, Facebook
 * @param {string} data.recorder    - ชื่อผู้บันทึก เช่น [Telegram] @username
 */
async function saveRecord(data) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

  const now = new Date();
  const dateStr = now.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  // คอลัมน์ A-H
  const row = [
    dateStr,                          // A: วันที่/เวลา
    data.item || 'ไม่ระบุ',           // B: รายการ
    data.type,                        // C: ประเภท
    data.amount || 0,                 // D: จำนวนเงิน
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

/**
 * ดึงข้อมูลสรุปยอดรายรับ-รายจ่าย โดยรวมข้อมูลจากทุก Sheet ใน Spreadsheet
 */
async function getBalanceSummary() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // ดึงรายชื่อ Sheet ทั้งหมดใน Spreadsheet
  const metaResponse = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = metaResponse.data.sheets || [];
  const sheetTitles = allSheets.map(s => s.properties.title);

  console.log(`[SHEETS] Found ${sheetTitles.length} sheet(s): ${sheetTitles.join(', ')}`);

  const now = new Date();
  const bangkokNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const todayDay = bangkokNow.getDate();
  const todayMonth = bangkokNow.getMonth();
  const todayYear = bangkokNow.getFullYear();

  let dailyIncome = 0, dailyExpense = 0;
  let monthlyIncome = 0, monthlyExpense = 0;
  const todayItems = [];

  // วนอ่านข้อมูลจากทุก Sheet
  for (const title of sheetTitles) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!A:H`
      });

      const rows = response.data.values || [];

      // เริ่มจากแถวที่ 2 (ข้าม Header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 4) continue;

        const rowDate = new Date(row[0]);
        const rowType = row[2];
        const rowAmount = parseFloat(row[3]) || 0;
        const rowItem = row[1] || '';
        const rowRecorder = row[7] || 'ไม่ระบุ';
        const rowSheet = title; // ชื่อ Sheet ที่มาจาก

        if (isNaN(rowDate.getTime())) continue;
        // รองรับเฉพาะ รายรับ / รายจ่าย เท่านั้น
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
              recorder: rowRecorder,
              sheet: rowSheet
            });
          }
        }
      }
    } catch (sheetError) {
      // ถ้า Sheet ใดอ่านไม่ได้ (เช่น ไม่มีคอลัมน์ตรงกัน) ให้ข้ามไป
      console.warn(`[SHEETS] Skipping sheet "${title}": ${sheetError.message}`);
    }
  }

  return {
    dailyIncome,
    dailyExpense,
    monthlyIncome,
    monthlyExpense,
    balance: monthlyIncome - monthlyExpense,
    todayItems,
    sheetsScanned: sheetTitles.length
  };
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

/**
 * ตรวจสอบและสร้าง Header Row ถ้ายังไม่มี
 */
async function ensureHeaderRow() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'รายรับ-รายจ่าย';

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
          'วันที่/เวลา',    // A
          'รายการ',         // B
          'ประเภท',         // C
          'จำนวนเงิน',      // D
          'หมวดหมู่',       // E
          'หมายเหตุ',       // F
          'ช่องทาง',        // G
          'ผู้บันทึก'       // H ← คอลัมน์ท้ายสุด
        ]]
      }
    });
    console.log('[SHEETS] Header row created');
  }
}

module.exports = { saveRecord, getBalanceSummary, getRecentRecords, ensureHeaderRow };
