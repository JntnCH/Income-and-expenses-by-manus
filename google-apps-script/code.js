
/**
 * Google Apps Script: AI Financial Analyst (Powered by Gemini)
 * ระบบวิเคราะห์ข้อมูลรายรับ-รายจ่ายและหนี้สินอัตโนมัติ
 */

const GEMINI_API_KEY = "ใส่_API_KEY_ของคุณที่นี่"; // ขอได้ที่ https://aistudio.google.com/
const SPREADSHEET_IDS = {
  main: "1M541e-cbFTFXMc94SANX4Svi1SK4WauehhPB3i7Wnw4",
  monthly: "1OFH68Lp0U70xAuRdpDb0QxGwOzTxX1VLwLYEnnur6Nc",
  debt: "1yPNCTj0RF9GHcOIuwLyqKECSIwF8oQ4cr2BVBidzFdU"
};

/**
 * ฟังก์ชันหลักสำหรับถามคำถาม AI
 * @param {string} query คำถามภาษาไทย
 * @return {string} คำตอบจาก AI
 */
function askAI(query) {
  try {
    const dataContext = getAllSheetsContext();
    const prompt = `
      คุณคือผู้ช่วยวิเคราะห์ข้อมูลการเงินส่วนบุคคล
      ข้อมูลปัจจุบัน: วันที่ ${new Date().toLocaleDateString('th-TH')}
      
      ข้อมูลจาก Google Sheets:
      ${dataContext}
      
      คำถามจากผู้ใช้: "${query}"
      
      คำแนะนำ:
      - ถ้าถามว่า "ทำงานกี่วัน" ให้ดูรายการที่มีคำว่า "ค่าแรง" ในรายรับ
      - ตอบเป็นภาษาไทยที่สุภาพ กระชับ และแม่นยำตามข้อมูลจริง
    `;

    return callGeminiAPI(prompt);
  } catch (e) {
    return "ขออภัยครับ เกิดข้อผิดพลาด: " + e.message;
  }
}

/**
 * ดึงข้อมูลจากทุกไฟล์และทุกชีตมาทำเป็น Context
 */
function getAllSheetsContext() {
  let context = "";
  
  for (let key in SPREADSHEET_IDS) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_IDS[key]);
    const sheets = ss.getSheets();
    
    context += `\n--- ไฟล์: ${ss.getName()} ---\n`;
    sheets.forEach(sheet => {
      const name = sheet.getName();
      // ดึงเฉพาะ 50 แถวล่าสุดเพื่อไม่ให้ข้อมูลเยอะเกินไปสำหรับ AI
      const lastRow = sheet.getLastRow();
      if (lastRow > 0) {
        const startRow = Math.max(1, lastRow - 50);
        const data = sheet.getRange(startRow, 1, (lastRow - startRow) + 1, sheet.getLastColumn()).getValues();
        context += `ชีต: ${name}\n${JSON.stringify(data)}\n`;
      }
    });
  }
  
  return context;
}

/**
 * เรียกใช้ Gemini API
 */
function callGeminiAPI(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  if (json.candidates && json.candidates[0].content.parts[0].text) {
    return json.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Gemini API Error: " + response.getContentText());
  }
}

/**
 * สร้างเมนูใน Google Sheets เพื่อให้กดถามได้ง่ายๆ
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI Analyst')
      .addItem('ถาม AI', 'showPrompt')
      .addToUi();
}

function showPrompt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('ถาม AI เกี่ยวกับข้อมูลการเงิน', 'พิมพ์คำถามของคุณที่นี่ (เช่น เดือนนี้ทำงานกี่วัน):', ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const query = response.getResponseText();
    const answer = askAI(query);
    ui.alert('คำตอบจาก AI', answer, ui.ButtonSet.OK);
  }
}
