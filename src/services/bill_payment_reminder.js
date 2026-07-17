const { google } = require('googleapis');
const axios = require('axios');

// กำหนด Spreadsheet ID ของทั้งสองไฟล์
// ในไฟล์ .js ของคุณ
// โค้ดจะวิ่งไปอ่านจาก YAML/Cloud Run ก่อน ถ้าไม่มีจะมาดึงค่าสำรองจากไฟล์ .env ในเครื่อง
const SPREADSHEET_ID = process.env.MONTHLY_SPREADSHEET_ID || process.env.LOCAL_MONTHLY_SHEET_ID;

// แล้วใน GitHub Actions YAML คุณใช้คำสั่ง replace หรือส่งเป็น env
// env:
//   SPREADSHEET_ID: ${{ secrets.MONTHLY_SPREADSHEET_ID }}

// ฟังก์ชันดึงเดือนย่อภาษาไทยอัตโนมัติให้ตรงกับในชีต (เช่น "ก.ค.")
function getThaiShortMonth() {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const today = new Date();
  return months[today.getMonth()];
}

app.get('/cron/check-bills', async (req, res) => {
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthAbbr = getThaiShortMonth(); // ได้ผลลัพธ์เป็นตัวย่อ เช่น "ก.ค."

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // ดึงข้อมูลจากไฟล์ที่ 1 แถบ "กำหนดจ่าย" ตั้งแต่แถวที่ 4 ลงไป
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId = process.env.MONTHLY_SPREADSHEET_ID || process.env.LOCAL_MONTHLY_SHEET_ID,
      range: 'กำหนดจ่าย!B4:G',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).send('ไม่พบข้อมูลบิล');
    }

    let todayBills = [];
    let overdueBills = [];

    rows.forEach((row) => {
      if (row.length < 5 || !row[0]) return;

      const billName = row[0];       // คอลัมน์ B: รายการ
      const status = row[1];         // คอลัมน์ C: สถานะ
      const dueDateText = row[2];    // คอลัมน์ D: กำหนดจ่าย
      const dueDay = parseInt(row[4]); // คอลัมน์ F: เลือกวัน

      if (dueDay === currentDay) {
        todayBills.push({ name: billName, due: dueDateText });
      }

      if (status && status.includes('เกินกำหนด')) {
        overdueBills.push({ name: billName, status: status });
      }
    });

    if (todayBills.length === 0 && overdueBills.length === 0) {
      return res.status(200).send('วันนี้ไม่มีบิลต้องจ่าย');
    }

    let message = `📝 *รายงานกำหนดจ่ายเงินวันนี้ (${currentMonthAbbr})*\n\n`;
    const inlineKeyboardButtons = [];

    if (todayBills.length > 0) {
      message += `🔔 *ครบกำหนดวันนี้:*\n`;
      todayBills.forEach(bill => {
        message += `• ${bill.name} (${bill.due})\n`;
        inlineKeyboardButtons.push([{
          text: `✅ จ่ายแล้ว: ${bill.name}`,
          callback_data: `pay:${bill.name}:${currentMonthAbbr}` // ส่ง Data ไปรอประมวลผลตอนกดคลิก
        }]);
      });
      message += `\n`;
    }

    if (overdueBills.length > 0) {
      message += `⚠️ *บิลค้างจ่าย (เกินกำหนด):*\n`;
      overdueBills.forEach(bill => {
        message += `• ${bill.name} -> _${bill.status}_\n`;
        inlineKeyboardButtons.push([{
          text: `✅ จ่ายแล้ว: ${bill.name}`,
          callback_data: `pay:${bill.name}:${currentMonthAbbr}`
        }]);
      });
    }

    message += `หากทำการชำระเงินเรียบร้อยแล้ว สามารถกดปุ่มด้านล่างเพื่ออัปเดตสเปรดชีตได้เลยครับ`;

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const CHAT_ID = process.env.MY_TELEGRAM_CHAT_ID;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboardButtons
      }
    });

    res.status(200).send('ส่งข้อความแจ้งเตือนเรียบร้อย');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error checking bills');
  }
});
