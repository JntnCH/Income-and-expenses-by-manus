// ฟังก์ชันสำหรับล้างเว้นวรรคและอีโมจิออก เพื่อป้องกันปัญหาเคส "ค่าไฟ💡" กับ "ค่าไฟ 💡" ไม่ตรงกัน
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
}

app.post('/telegram/webhook', async (req, res) => {
  const body = req.body;

  // 1. ตรวจสอบว่าเป็นการกดปุ่มส่งข้อมูลกลับมา (Callback Query) หรือไม่
  if (body.callback_query) {
    const callbackQuery = body.callback_query;
    const callbackData = callbackQuery.data; // เช่น "pay:ค่าไฟ 💡:ก.ค."
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (callbackData.startsWith('pay:')) {
      const parts = callbackData.split(':');
      const targetCategory = parts[1]; // "ค่าไฟ 💡"
      const targetMonth = parts[2];    // "ก.ค."

      try {
        const auth = new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 2. ไปดึงข้อมูลจากไฟล์ที่ 2 แท็บ Monthly-expense 2026
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID_2,
          range: 'Monthly-expense 2026!A4:H', // โหลดคอลัมน์ A ถึง H ตั้งแต่แถว 4
        });

        const rows = response.data.values;
        let matchedRowIndex = -1;

        if (rows && rows.length > 0) {
          // วนลูปจับคู่ แถวเดือน (Col A) และ แถวหมวดหมู่ (Col G)
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowMonth = row[0];       // คอลัมน์ A (เดือน)
            const rowCategory = row[6] || ''; // คอลัมน์ G (หมวดหมู่)

            if (rowMonth === targetMonth && cleanText(rowCategory) === cleanText(targetCategory)) {
              matchedRowIndex = i + 4; // นำ Index ที่เจอ บวกกลับด้วย offset (เริ่มอ่านที่แถว 4)
              break;
            }
          }
        }

        const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

        if (matchedRowIndex !== -1) {
          // 3. ทำการเขียนค่า TRUE (ติ๊กถูก) ไปที่พิกัดคอลัมน์ H ของแถวนั้นโดยตรง
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID_2,
            range: `Monthly-expense 2026!H${matchedRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[true]] // ส่งค่า boolean true เพื่อติ๊กช่อง Checkbox ในชีต
            }
          });

          // แจ้งเตือน Popup สั้นๆ บน Telegram
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: `✅ ทำเครื่องหมายถูกรายการ "${targetCategory}" ในชีตเรียบร้อยแล้ว!`,
            show_alert: false
          });

          // แก้ไขข้อความในห้องแชทเพื่อบันทึกสถานะ
          const updatedText = callbackQuery.message.text + `\n\n🟢 *บันทึกเรียบร้อย:* ได้ทำการชำระ ${targetCategory} ประจำเดือน ${targetMonth} เรียบร้อยแล้ว!`;
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: updatedText,
            parse_mode: 'Markdown'
          });

        } else {
          // หากหาไม่พบ
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: `❌ ไม่พบรายการ "${targetCategory}" ของเดือน ${targetMonth} ในสเปรดชีต`,
            show_alert: true
          });
        }

      } catch (err) {
        console.error(err);
        res.status(500).send('Error updating sheet');
        return;
      }
    }
    return res.status(200).send('OK');
  }

  // ... (ใส่ Logic Dialogflow เดิมของคุณที่นี่หากไม่ใช่ callback_query) ...
  res.status(200).send('OK');
});
