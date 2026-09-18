/**
 * Telegram Service
 * ระบบจัดการ Telegram Bot สำหรับบันทึกรายรับ-รายจ่าย, เช็คยอดเงิน, สแกนสลิปโอนเงิน (OCR)
 * และจัดการระบบเตือนชำระบิลผ่าน Telegram Webhook
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { processChatMessage, calculateLocalBalanceSummary, getRecentTransactions, recordLocalTransaction, updateTransactionCategory } = require('./chatService');
const { processImage } = require('../ocr/ocrManager');
const { resolveCategory, getCategoriesByType, addOrUpdateCategory, importFromDialogflow, exportToDialogflow, addCorrectionRule, getAllCategories } = require('./categoryManager');
const { listEntityTypes, getEntityType, addOrUpdateEntityEntry, deleteEntityEntry } = require('./dialogflowEntityService');
const { getBalanceSummary, saveRecord, findTransaction, updateTransaction } = require('./googleSheets');
const { cacheCardPayload } = require('../routes/imageCard');
const { createTransactionSvg, createBalanceSummarySvg, createEditConfirmationSvg, renderSvgToPng } = require('./imageCardGenerator');
const {
  buildBalanceSummary,
  buildEditConfirmation,
  buildMultipleMatchesResponse,
  buildNotFoundResponse
} = require('../utils/responseBuilder');

const CONFIG_FILE = path.join(__dirname, '../../data/telegram_config.json');

// สถานะการสนทนาโต้ตอบของผู้ใช้ (สำหรับ Flow แก้ไขหมวดหมู่ / เพิ่ม Dialogflow Entity)
const userStates = new Map();

function setUserState(chatId, state) {
  userStates.set(String(chatId), { ...state, updatedAt: Date.now() });
}

function getUserState(chatId) {
  const s = userStates.get(String(chatId));
  if (!s) return null;
  // หมดอายุใน 15 นาที
  if (Date.now() - s.updatedAt > 15 * 60 * 1000) {
    userStates.delete(String(chatId));
    return null;
  }
  return s;
}

function clearUserState(chatId) {
  userStates.delete(String(chatId));
}


// โฟลเดอร์ data
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * โหลดคอนฟิก Telegram จากไฟล์ หรือ Environment Variables
 */
function getTelegramConfig() {
  let saved = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.warn('[TELEGRAM] Error reading config file:', e.message);
    }
  }

  const token = saved.token || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '';
  const defaultChatId = saved.defaultChatId || process.env.MY_TELEGRAM_CHAT_ID || '';
  const webhookUrl = saved.webhookUrl || '';

  return {
    token,
    defaultChatId,
    webhookUrl,
    enabled: !!token,
    lastUpdated: saved.lastUpdated || null
  };
}

/**
 * บันทึกคอนฟิก Telegram
 */
function saveTelegramConfig({ token, defaultChatId, webhookUrl }) {
  const current = getTelegramConfig();
  const updated = {
    token: token !== undefined ? token.trim() : current.token,
    defaultChatId: defaultChatId !== undefined ? String(defaultChatId).trim() : current.defaultChatId,
    webhookUrl: webhookUrl !== undefined ? webhookUrl.trim() : current.webhookUrl,
    lastUpdated: new Date().toISOString()
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/**
 * เรียก Telegram Bot API
 */
async function callTelegramApi(method, data = {}, customToken = null) {
  const token = customToken || getTelegramConfig().token;
  if (!token) {
    throw new Error('Telegram Bot Token is not configured. กรุณาระบุ TELEGRAM_BOT_TOKEN หรือบันทึกในระบบ');
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await axios.post(url, data, {
    timeout: 20000,
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.data || !response.data.ok) {
    throw new Error(response.data?.description || `Telegram API error on ${method}`);
  }

  return response.data.result;
}

/**
 * ตรวจสอบข้อมูล Bot (getMe)
 */
async function getMe(customToken = null) {
  return await callTelegramApi('getMe', {}, customToken);
}

/**
 * ดึงสถานะ Webhook ล่าสุดจาก Telegram
 */
async function getWebhookInfo(customToken = null) {
  return await callTelegramApi('getWebhookInfo', {}, customToken);
}

/**
 * ลงทะเบียน Webhook URL กับ Telegram
 */
async function setWebhook(webhookUrl, customToken = null) {
  if (!webhookUrl) {
    throw new Error('กรุณาระบุ Webhook URL');
  }

  const result = await callTelegramApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query', 'edited_message'],
    drop_pending_updates: false
  }, customToken);

  // บันทึก URL ที่ลงทะเบียนไว้
  saveTelegramConfig({ webhookUrl });
  return result;
}

/**
 * ลบ Webhook (กลับไปใช้ Polling ถ้าต้องการ)
 */
async function deleteWebhook(customToken = null) {
  return await callTelegramApi('deleteWebhook', { drop_pending_updates: false }, customToken);
}

/**
 * ส่งข้อความธรรมดา
 */
async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'Markdown',
    ...options
  };
  return await callTelegramApi('sendMessage', payload);
}

/**
 * ส่งการกระทำในห้องแชท (เช่น typing, upload_photo)
 */
async function sendChatAction(chatId, action = 'typing') {
  try {
    return await callTelegramApi('sendChatAction', {
      chat_id: chatId,
      action
    });
  } catch (e) {
    // Ignore action error
    return false;
  }
}

/**
 * ส่งรูปภาพ (URL หรือ Buffer)
 */
async function sendPhoto(chatId, photo, caption = '', options = {}) {
  const token = getTelegramConfig().token;
  if (!token) throw new Error('Telegram Bot Token not configured');

  // กรณีเป็น Buffer ให้ส่งแบบ multipart/form-data
  if (Buffer.isBuffer(photo)) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', photo, { filename: 'card.png', contentType: 'image/png' });
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', options.parse_mode || 'Markdown');
    }
    if (options.reply_markup) {
      formData.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
    }

    const res = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
      headers: formData.getHeaders(),
      timeout: 25000
    });
    return res.data.result;
  }

  // กรณีเป็น URL (string)
  const payload = {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: options.parse_mode || 'Markdown',
    ...options
  };
  return await callTelegramApi('sendPhoto', payload);
}

/**
 * ตอบกลับ Callback Query จากการกด Inline Button
 */
async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
  return await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert
  });
}

/**
 * ดึงข้อมูลไฟล์รูปภาพจาก Telegram Servers
 */
async function getFile(fileId) {
  return await callTelegramApi('getFile', { file_id: fileId });
}

/**
 * ดาวน์โหลดไฟล์เป็น Buffer จาก Telegram
 */
async function downloadTelegramFile(filePath) {
  const token = getTelegramConfig().token;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return Buffer.from(response.data);
}

/**
 * แป้นพิมพ์ลัดหลักของ Telegram (Inline Keyboard)
 */
function getMainInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' },
        { text: '🕒 รายการล่าสุด', callback_data: 'action:recent' }
      ],
      [
        { text: '🏷️ จัดการหมวดหมู่', callback_data: 'action:categories' },
        { text: '📑 บิลค้างจ่าย', callback_data: 'action:bills' }
      ],
      [
        { text: '🍜 ตัวอย่างบันทึก', callback_data: 'action:help' }
      ]
    ]
  };
}

/**
 * ฟังก์ชันสร้างข้อความต้อนรับ
 */
function getWelcomeMessage(userName) {
  return (
    `👋 *สวัสดีครับคุณ ${userName}!* 🤖\n` +
    `ยินดีต้อนรับสู่ระบบบันทึกบัญชีอัจฉริยะ *DevMus Assistant*\n\n` +
    `💬 *คุณสามารถพิมพ์ข้อความธรรมชาติเพื่อบันทึกได้ทันที:*\n` +
    `• 🔴 *รายจ่าย:* \`กินข้าว 60\`, \`ซื้อของ 250\`, \`เติมน้ำมัน 800 กสิกร\`\n` +
    `• 🟢 *รายรับ:* \`เงินเดือนเข้า 35,000\`, \`ขายของได้ 1,200\`\n` +
    `• 📷 *สแกนสลิป:* ส่งรูปสลิปโอนเงิน หรือใบเสร็จเข้ามาได้เลย\n` +
    `• 📊 *ตรวจยอด:* พิมพ์ \`เช็คยอด\` หรือกดปุ่มด้านล่าง\n\n` +
    `⚡ *คำสั่งลัด:*\n` +
    `• /balance - สรุปยอดเงินคงเหลือสุทธิ\n` +
    `• /recent - ดู 10 รายการบันทึกล่าสุด\n` +
    `• /categories - จัดการ/ซิงค์หมวดหมู่ Dialogflow\n` +
    `• /bills - ตรวจสอบกำหนดจ่ายบิลประจำเดือน\n` +
    `• /help - วิธีใช้งานและหมวดหมู่ทั้งหมด`
  );
}

/**
 * สรุปยอดเงินพร้อมข้อความและการ์ด
 */
async function handleBalanceRequest(chatId, req) {
  await sendChatAction(chatId, 'typing');

  let summary;
  try {
    if (process.env.GOOGLE_SPREADSHEET_ID &&
        (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) {
      summary = await getBalanceSummary();
    }
  } catch (e) {
    console.warn('[TELEGRAM BALANCE] Sheets fallback:', e.message);
  }

  if (!summary) {
    summary = calculateLocalBalanceSummary();
  }

  const netBalance = Number(summary.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const income = Number(summary.dailyIncome || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const expense = Number(summary.dailyExpense || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  let accountsText = '';
  if (summary.accountBalances && summary.accountBalances.length > 0) {
    accountsText = `\n💳 *ยอดแยกตามบัญชี:*\n` +
      summary.accountBalances.map(a => `• *${a.name}:* ${Number(a.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`).join('\n');
  }

  const text = `📊 *สรุปยอดเงินคงเหลือ*\n` +
               `━━━━━━━━━━━━━━━━━━━\n` +
               `💰 *ยอดเงินสุทธิ:* *${netBalance} บาท*\n` +
               `🟢 *รายรับวันนี้:* +${income} บาท\n` +
               `🔴 *รายจ่ายวันนี้:* -${expense} บาท\n` +
               accountsText + `\n` +
               `━━━━━━━━━━━━━━━━━━━\n` +
               `📅 ข้อมูล ณ วันที่: ${summary.formattedDate || new Date().toLocaleDateString('th-TH')}`;

  // สร้าง Image Card รูปภาพสรุปยอด
  try {
    const svg = createBalanceSummarySvg(summary);
    const pngBuffer = await renderSvgToPng(svg);
    await sendPhoto(chatId, pngBuffer, text, {
      reply_markup: getMainInlineKeyboard()
    });
    return;
  } catch (cardErr) {
    console.warn('[TELEGRAM] Balance card render error:', cardErr.message);
  }

  // Fallback เป็นข้อความปกติ
  await sendMessage(chatId, text, {
    reply_markup: getMainInlineKeyboard()
  });
}

/**
 * จัดการคำสั่งแก้ไขรายการสำหรับ Telegram Bot
 * รองรับ:
 * - "แก้รายการซื้อกาแฟ 41 เป็น 50"
 * - "แก้ซื้อกาแฟเป็นซื้อขนม"
 * - "แก้รายการเดินทาง 195 เป็น 200"
 * - "แก้หมวดหมู่ซื้อกาแฟเป็นอาหาร"
 * - "แก้บัญชีซื้อกาแฟเป็นกสิกรไทย"
 * - "/edit ซื้อกาแฟ 41 เป็น 50"
 * 
 * Flow:
 * updateTransaction() -> buildEditConfirmation() -> createEditConfirmationSvg() -> sendPhoto()
 * ถ้าเกิด Image Error -> sendMessage() (Fallback ทันที)
 */
async function handleEditRequest(chatId, text, req) {
  await sendChatAction(chatId, 'typing');

  const clean = text.replace(/^\/edit\s*/i, '').trim();

  let oldItem = null;
  let oldAmount = null;
  let newItem = null;
  let newAmount = null;
  let newCategory = null;
  let newAccount = null;

  // Pattern 1: แก้บัญชี (ของ) X เป็น Y
  const accMatch = clean.match(/^แก้บัญชี(?:ของ)?(?:รายการ)?\s*(.+?)\s*เป็น\s*(.+)/i);
  if (accMatch) {
    oldItem = accMatch[1].trim();
    newAccount = accMatch[2].trim();
  }

  // Pattern 2: แก้หมวดหมู่ (ของ) X เป็น Y
  const catMatch = clean.match(/^แก้หมวด(?:หมู่)?(?:ของ)?(?:รายการ)?\s*(.+?)\s*เป็น\s*(.+)/i);
  if (catMatch) {
    oldItem = catMatch[1].trim();
    newCategory = catMatch[2].trim();
  }

  // Pattern 3: แก้ (รายการ) [ชื่อ] [จำนวนเดิม] เป็น [จำนวนใหม่]
  const numToNumMatch = clean.match(/^แก้(?:รายการ)?\s*(.+?)\s*(\d+(?:\.\d+)?)\s*(?:เป็น|->|=)\s*(\d+(?:\.\d+)?)/i);
  if (numToNumMatch) {
    oldItem = numToNumMatch[1].trim();
    oldAmount = parseFloat(numToNumMatch[2]);
    newAmount = parseFloat(numToNumMatch[3]);
  }

  // Pattern 4: แก้ (รายการ) [ชื่อ] เป็น [ใหม่]
  const genericMatch = clean.match(/^แก้(?:รายการ)?\s*(.+?)\s*(?:เป็น|->|=)\s*(.+)/i);
  if (genericMatch && !numToNumMatch && !accMatch && !catMatch) {
    oldItem = genericMatch[1].trim();
    const targetVal = genericMatch[2].trim();
    if (!isNaN(parseFloat(targetVal))) {
      newAmount = parseFloat(targetVal);
    } else {
      newItem = targetVal;
    }
  }

  if (!oldItem && !newAmount && !newItem && !newCategory && !newAccount) {
    const rawParts = clean.split(/\s+/);
    oldItem = rawParts[0];
  }

  const criteria = {
    oldItem,
    oldAmount
  };

  const updates = {
    newItem,
    newAmount,
    newCategory,
    newAccount,
    platform: 'Telegram',
    recorder: 'Telegram User'
  };

  try {
    const matches = await findTransaction(criteria);

    if (matches.length === 0) {
      const notFoundText = buildNotFoundResponse(criteria);
      await sendMessage(chatId, notFoundText, { reply_markup: getMainInlineKeyboard() });
      return;
    }

    if (matches.length > 1) {
      const multiText = buildMultipleMatchesResponse(matches);
      await sendMessage(chatId, multiText, { reply_markup: getMainInlineKeyboard() });
      return;
    }

    // Exactly 1 match found -> Update in-place and verify!
    const targetMatch = matches[0];
    const editResult = await updateTransaction(targetMatch.rowIndex, updates);
    const confirmationText = buildEditConfirmation(editResult);

    // Primary: Send Photo
    try {
      const svg = createEditConfirmationSvg(editResult);
      const pngBuffer = await renderSvgToPng(svg);
      await sendPhoto(chatId, pngBuffer, confirmationText, {
        reply_markup: getMainInlineKeyboard()
      });
      return;
    } catch (imgErr) {
      console.warn('[TELEGRAM EDIT IMAGE WARN]', imgErr.message);
    }

    // Fallback: Send Text message
    await sendMessage(chatId, confirmationText, {
      reply_markup: getMainInlineKeyboard()
    });

  } catch (err) {
    console.error('[TELEGRAM EDIT ERROR]', err.message);
    await sendMessage(chatId, `❌ การแก้ไขรายการล้มเหลว: ${err.message}`, {
      reply_markup: getMainInlineKeyboard()
    });
  }
}

/**
 * ดึงรายการบันทึกล่าสุด
 */
async function handleRecentRequest(chatId) {
  await sendChatAction(chatId, 'typing');
  const transactions = getRecentTransactions(8);

  if (!transactions || transactions.length === 0) {
    await sendMessage(chatId, '📭 *ยังไม่มีรายการบันทึกในระบบ*\nลองพิมพ์ เช่น `กินข้าว 60` เพื่อเริ่มต้นบันทึกได้เลยครับ', {
      reply_markup: getMainInlineKeyboard()
    });
    return;
  }

  let text = `🕒 *ประวัติ 8 รายการล่าสุด*\n━━━━━━━━━━━━━━━━━━━\n`;
  transactions.forEach((t, index) => {
    const isInc = t.type === 'รายรับ';
    const icon = isInc ? '🟢' : '🔴';
    const sign = isInc ? '+' : '-';
    const amountStr = Number(t.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    text += `${index + 1}. ${icon} *${t.item}*\n` +
            `   └ ${sign}${amountStr} ฿ | 🏷️ ${t.category || 'ทั่วไป'} | 💳 ${t.account || 'เงินสด'} (${t.date} ${t.time})\n`;
  });
  text += `━━━━━━━━━━━━━━━━━━━\n💡 พิมพ์รายการใหม่ หรือกดปุ่มด้านล่างได้เลยครับ`;

  await sendMessage(chatId, text, {
    reply_markup: getMainInlineKeyboard()
  });
}

/**
 * ประมวลผลการส่งรูปสลิปจาก Telegram
 */
async function handlePhotoMessage(message, req) {
  const chatId = message.chat.id;
  const userName = message.from.first_name || message.from.username || 'ผู้ใช้ Telegram';

  await sendChatAction(chatId, 'upload_photo');
  const waitMsg = await sendMessage(chatId, '⏳ *กำลังสแกนสลิป/ใบเสร็จด้วยระบบ OCR...*\nกรุณารอสักครู่ครับ');

  try {
    // ดึงรูปที่มีขนาดใหญ่สุด (ชัดที่สุด)
    const photos = message.photo;
    const highestResPhoto = photos[photos.length - 1];

    // 1. ดึง File Path จาก Telegram
    const fileInfo = await getFile(highestResPhoto.file_id);
    if (!fileInfo || !fileInfo.file_path) {
      throw new Error('ไม่สามารถดึงรูปภาพจาก Telegram Server ได้');
    }

    // 2. ดาวน์โหลด Buffer ของภาพ
    const imageBuffer = await downloadTelegramFile(fileInfo.file_path);

    // 3. วิ่งเข้า OCR Engine
    const ocrResult = await processImage(imageBuffer);
    const amount = ocrResult.amount || 0;
    const rawItem = ocrResult.item || 'สลิปโอนเงิน / ใบเสร็จ';
    const bank = ocrResult.bank || 'สลิปโอนเงิน';

    if (amount <= 0) {
      await sendMessage(chatId, 
        `⚠️ *ตรวจพบรูปภาพแต่ไม่พบยอดเงินที่ชัดเจน*\n\n` +
        `• รายการที่ตรวจพบ: ${rawItem}\n` +
        `• ธนาคาร: ${bank}\n\n` +
        `💡 *คำแนะนำ:* ลองถ่ายภาพให้สว่างและขนานกับสลิป หรือพิมพ์ยอดเงินด้วยตัวเอง เช่น \`โอนเงิน 350 ${bank}\``, {
        reply_markup: getMainInlineKeyboard()
      });
      return;
    }

    // 4. สกัดหมวดหมู่และบันทึก
    const resolution = resolveCategory({
      item: rawItem,
      category: ocrResult.category || 'ทั่วไป',
      type: 'รายจ่าย',
      queryText: ocrResult.rawText || rawItem
    });

    const finalCategory = resolution.resolvedCategory;
    const finalItem = rawItem === 'ใบเสร็จ' ? (resolution.matchedKeyword || 'ชำระค่าสินค้า/บริการ') : rawItem;

    const recordPayload = {
      item: finalItem,
      type: 'รายจ่าย',
      amount,
      category: finalCategory,
      account: bank,
      platform: 'Telegram (Slip OCR)',
      recorder: userName
    };

    // บันทึกลง Local Ledger
    const savedTx = recordLocalTransaction(recordPayload);

    // บันทึกลง Google Sheets ถ้ามี
    try {
      if (process.env.GOOGLE_SPREADSHEET_ID &&
          (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) {
        await saveRecord(recordPayload);
      }
    } catch (sheetErr) {
      console.warn('[TELEGRAM SLIP] Google Sheets save warning:', sheetErr.message);
    }

    // 5. สร้าง Receipt Card PNG
    const caption = `🧾 *สแกนสลิปสำเร็จ! (OCR)* ⚡\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `📝 *รายการ:* ${finalItem}\n` +
                    `💸 *จำนวนเงิน:* *${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท*\n` +
                    `🏷️ *หมวดหมู่:* ${finalCategory}\n` +
                    `💳 *ช่องทาง:* ${bank}\n` +
                    `🕒 *เวลา:* ${savedTx.date} ${savedTx.time}\n` +
                    `━━━━━━━━━━━━━━━━━━━`;

    try {
      const svg = createTransactionSvg({
        ...recordPayload,
        date: `${savedTx.date} ${savedTx.time}`
      });
      const pngBuffer = await renderSvgToPng(svg);
      await sendPhoto(chatId, pngBuffer, caption, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ แก้ไขหมวดหมู่', callback_data: `edit_cat:${savedTx.id}` }],
            [
              { text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' },
              { text: '🕒 รายการล่าสุด', callback_data: 'action:recent' }
            ]
          ]
        }
      });
    } catch (cardErr) {
      await sendMessage(chatId, caption, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ แก้ไขหมวดหมู่', callback_data: `edit_cat:${savedTx.id}` }],
            [
              { text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' },
              { text: '🕒 รายการล่าสุด', callback_data: 'action:recent' }
            ]
          ]
        }
      });
    }

  } catch (error) {
    console.error('[TELEGRAM OCR ERROR]', error);
    await sendMessage(chatId, `❌ *เกิดข้อผิดพลาดในการอ่านสลิป:*\n_${error.message}_\n\nสามารถพิมพ์บันทึกเป็นข้อความแทนได้นะครับ เช่น \`โอนเงิน 250\``, {
      reply_markup: getMainInlineKeyboard()
    });
  }
}

/**
 * ประมวลผลข้อความแชททั่วไปจาก Telegram
 */
async function handleTextMessage(message, req) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const userName = message.from.first_name || message.from.username || 'ผู้ใช้ Telegram';

  // 1. ตรวจจับคำสั่งระบบ (Bot Commands)
  if (text.startsWith('/start')) {
    await sendMessage(chatId, getWelcomeMessage(userName), {
      reply_markup: getMainInlineKeyboard()
    });
    return;
  }

  if (text.startsWith('/help') || text === 'วิธีใช้งาน' || text === 'ช่วยเหลือ') {
    const helpText = (
      `💡 *คู่มือการใช้งานบอท DevMus Assistant*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔴 *การบันทึกรายจ่าย:*\n` +
      `• พิมพ์ชื่อรายการ + ยอดเงิน เช่น:\n` +
      `  - \`กินข้าว 60\`\n` +
      `  - \`กาแฟอเมซอน 65 กสิกร\`\n` +
      `  - \`เติมน้ำมัน 800 SCB\`\n` +
      `  - \`ซื้อของเซเว่น 185\`\n\n` +
      `🟢 *การบันทึกรายรับ:*\n` +
      `• ระบุคำว่า เงินเดือน, ขายของ, รายรับ เช่น:\n` +
      `  - \`เงินเดือนเข้า 35,000\`\n` +
      `  - \`ขายของได้ 1,500 พร้อมเพย์\`\n` +
      `  - \`รับเงินค่าจ้าง 3000\`\n\n` +
      `📷 *สแกนสลิป / ใบเสร็จ:*\n` +
      `• ส่งภาพสลิปเข้าห้องแชทได้ทันที ระบบจะอ่านยอดเงินและธนาคารอัตโนมัติ\n\n` +
      `📊 *คำสั่งตรวจสอบ:*\n` +
      `• /balance หรือ \`เช็คยอด\` : ดูยอดคงเหลือสุทธิและการ์ดสรุป\n` +
      `• /recent หรือ \`ประวัติ\` : ดู 10 รายการล่าสุด\n` +
      `• /categories หรือ \`หมวดหมู่\` : ดึง/เพิ่ม/ซิงค์ Entities จาก Dialogflow`
    );
    await sendMessage(chatId, helpText, {
      reply_markup: getMainInlineKeyboard()
    });
    return;
  }

  if (text.startsWith('/balance') || text.startsWith('/summary') || 
      text === 'เช็คยอด' || text === 'ยอดเงิน' || text === 'เหลือเงินเท่าไหร่' || text === 'สรุป') {
    await handleBalanceRequest(chatId, req);
    return;
  }

  if (text.startsWith('/recent') || text.startsWith('/history') || text === 'ประวัติ' || text === 'รายการล่าสุด') {
    await handleRecentRequest(chatId);
    return;
  }

  if (text.startsWith('/bills') || text === 'บิล' || text === 'กำหนดจ่าย') {
    await handleBillsRequest(chatId);
    return;
  }

  if (text.startsWith('/categories') || text.startsWith('/category') || text === 'หมวดหมู่' || text === 'จัดการหมวดหมู่') {
    await handleCategoriesMenu(chatId);
    return;
  }

  if (text.startsWith('/edit') || text.startsWith('แก้')) {
    await handleEditRequest(chatId, text, req);
    return;
  }

  // 1.1 ตรวจสอบ User State สำหรับการพิมพ์โต้ตอบแบบขั้นตอน (Multi-step Flow)
  const userState = getUserState(chatId);
  if (userState) {
    if (text === 'ยกเลิก' || text === '/cancel') {
      clearUserState(chatId);
      await sendMessage(chatId, '❌ *ยกเลิกรายการเรียบร้อยแล้ว*', {
        reply_markup: getMainInlineKeyboard()
      });
      return;
    }

    // Flow: ผู้ใช้พิมพ์ชื่อหมวดหมู่ที่ต้องการแก้ไขเอง
    if (userState.step === 'AWAIT_CUSTOM_CATEGORY') {
      const { txId } = userState;
      clearUserState(chatId);
      const newCategory = text.trim();
      const updateRes = updateTransactionCategory(txId, newCategory);
      if (updateRes.success) {
        // เพิ่ม Auto-correction rule อัตโนมัติ เพื่อให้ครั้งต่อไปเรียนรู้
        try {
          if (updateRes.tx && updateRes.tx.item) {
            addCorrectionRule({
              keyword: updateRes.tx.item,
              targetCategory: newCategory,
              type: updateRes.tx.type || 'รายจ่าย'
            });
          }
        } catch (e) {
          console.warn('[TELEGRAM] Failed to add correction rule:', e.message);
        }

        await sendMessage(chatId, 
          `✅ *แก้ไขหมวดหมู่สำเร็จ!*\n━━━━━━━━━━━━━━━━━━━\n` +
          `📝 *รายการ:* ${updateRes.tx.item}\n` +
          `🏷️ *หมวดหมู่ใหม่:* *${newCategory}* (เดิม: ${updateRes.oldCategory})\n` +
          `🧠 *ระบบบันทึกกฎจำแนกคำว่า "${updateRes.tx.item}" ให้เป็นหมวดหมู่นี้อัตโนมัติแล้วครับ!*\n━━━━━━━━━━━━━━━━━━━`, {
          reply_markup: getMainInlineKeyboard()
        });
      } else {
        await sendMessage(chatId, `⚠️ ไม่สามารถแก้ไขได้: ${updateRes.message || 'ไม่พบรายการ'}`, {
          reply_markup: getMainInlineKeyboard()
        });
      }
      return;
    }

    // Flow: ผู้ใช้พิมพ์ชื่อ Entity Entry ใหม่เพื่อเพิ่มเข้า Dialogflow & ระบบ
    if (userState.step === 'AWAIT_NEW_CATEGORY_NAME') {
      const catType = userState.type || 'expense';
      const typeLabel = catType === 'expense' ? 'รายจ่าย' : 'รายรับ';
      const categoryName = text.trim();

      setUserState(chatId, {
        step: 'AWAIT_NEW_CATEGORY_SYNONYMS',
        type: catType,
        categoryName
      });

      await sendMessage(chatId, 
        `🏷️ *ชื่อหมวดหมู่:* *${categoryName}* (${typeLabel})\n\n` +
        `💬 กรุณาพิมพ์ *คำพ้อง / คำค้นหา (Synonyms)* โดยคั่นด้วยเครื่องหมายจุลภาค (,) เช่น:\n` +
        `\`ชาบู, ปิ้งย่าง, หมูกระทะ, บุฟเฟต์\`\n\n` +
        `(หรือพิมพ์ \`-\` หากไม่ต้องการระบุคำพ้อง / หรือพิมพ์ \`ยกเลิก\`)`
      );
      return;
    }

    if (userState.step === 'AWAIT_NEW_CATEGORY_SYNONYMS') {
      const { type: catType, categoryName } = userState;
      clearUserState(chatId);

      let synonyms = [];
      if (text !== '-' && text !== 'ไม่มี') {
        synonyms = text.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
      }

      await sendChatAction(chatId, 'typing');
      try {
        // 1. เพิ่มลงใน Local Category Manager
        addOrUpdateCategory(catType, {
          name: categoryName,
          synonyms: synonyms
        });

        // 2. พยายามซิงค์ไปยัง Dialogflow Entity ทันทีถ้ามีการตั้งค่า
        let dfSyncNote = '';
        try {
          const entityTypeName = catType === 'expense' ? 'Expense-category' : 'Income_category';
          await addOrUpdateEntityEntry(entityTypeName, {
            value: categoryName,
            synonyms: [categoryName, ...synonyms]
          });
          dfSyncNote = '\n☁️ *ซิงค์เข้า Dialogflow Entity สำเร็จ!*';
        } catch (dfErr) {
          dfSyncNote = `\n💡 *บันทึกในระบบเรียบร้อย* (Dialogflow sync: ${dfErr.message})`;
        }

        await sendMessage(chatId,
          `🎉 *เพิ่มหมวดหมู่ใหม่สำเร็จ!*\n━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ *หมวดหมู่:* ${categoryName}\n` +
          `📌 *ประเภท:* ${catType === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}\n` +
          `🔤 *คำพ้อง:* ${synonyms.length > 0 ? synonyms.join(', ') : '-'}` +
          `${dfSyncNote}\n━━━━━━━━━━━━━━━━━━━`, {
          reply_markup: getMainInlineKeyboard()
        });
      } catch (err) {
        await sendMessage(chatId, `❌ เกิดข้อผิดพลาดในการเพิ่มหมวดหมู่: ${err.message}`, {
          reply_markup: getMainInlineKeyboard()
        });
      }
      return;
    }
  }

  // 2. ส่งข้อความเข้า Thai Financial NLU Engine (chatService)
  await sendChatAction(chatId, 'typing');
  const chatResult = await processChatMessage(text, {
    req,
    recorder: userName,
    platform: 'Telegram'
  });

  if (!chatResult.success) {
    await sendMessage(chatId, `❌ ${chatResult.text || 'ไม่สามารถประมวลผลข้อความได้'}`, {
      reply_markup: getMainInlineKeyboard()
    });
    return;
  }

  // หากเป็นรายการบันทึกสำเร็จ (รายรับ/รายจ่าย)
  if (chatResult.data && (chatResult.intent === 'บันทึกรายรับ' || chatResult.intent === 'บันทึกรายจ่าย')) {
    const tx = chatResult.data;
    const isInc = tx.type === 'รายรับ';
    const amountFormatted = Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    
    const caption = `${isInc ? '🟢' : '🔴'} *${isInc ? 'บันทึกรายรับสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ'}*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `📝 *รายการ:* ${tx.item}\n` +
                    `💸 *จำนวนเงิน:* *${amountFormatted} บาท*\n` +
                    `🏷️ *หมวดหมู่:* ${tx.category}\n` +
                    `💳 *บัญชี:* ${tx.account}\n` +
                    `🕒 *เวลา:* ${tx.date} ${tx.time}\n` +
                    `━━━━━━━━━━━━━━━━━━━`;

    const txKeyboard = {
      inline_keyboard: [
        [{ text: '✏️ แก้ไขหมวดหมู่', callback_data: `edit_cat:${tx.id}` }],
        [
          { text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' },
          { text: '🕒 ดูประวัติล่าสุด', callback_data: 'action:recent' }
        ]
      ]
    };

    // ลองสร้างการ์ดรูปภาพแบบ PNG Buffer ส่งไปใน Telegram
    try {
      const svg = createTransactionSvg({
        ...tx,
        date: `${tx.date} ${tx.time}`
      });
      const pngBuffer = await renderSvgToPng(svg);
      await sendPhoto(chatId, pngBuffer, caption, {
        reply_markup: txKeyboard
      });
      return;
    } catch (e) {
      console.warn('[TELEGRAM] Transaction card generation failed, sending text:', e.message);
    }

    await sendMessage(chatId, caption, {
      reply_markup: txKeyboard
    });
    return;
  }

  // ตอบกลับข้อความทั่วไป (เช่น คำถาม หรือข้อความอธิบาย)
  await sendMessage(chatId, chatResult.text, {
    reply_markup: getMainInlineKeyboard()
  });
}

/**
 * ดึงรายการบิลที่ครบกำหนดชำระ
 */
async function handleBillsRequest(chatId) {
  await sendChatAction(chatId, 'typing');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const today = new Date();
  const currentMonthAbbr = months[today.getMonth()];
  const currentDay = today.getDate();

  // รายการบิลตัวอย่างหรือจาก Google Sheets
  const sampleBills = [
    { name: 'ค่าไฟ 💡', dueDay: 18, amount: 1450 },
    { name: 'ค่าน้ำประปา 💧', dueDay: 20, amount: 280 },
    { name: 'ค่าอินเทอร์เน็ตบ้าน 🌐', dueDay: 25, amount: 640 },
    { name: 'ค่าบัตรเครดิต 💳', dueDay: currentDay, amount: 4890 }
  ];

  const inlineKeyboard = sampleBills.map(b => [
    { text: `✅ จ่ายแล้ว: ${b.name} (${b.amount}฿)`, callback_data: `pay:${b.name}:${currentMonthAbbr}` }
  ]);

  inlineKeyboard.push([{ text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' }]);

  const message = `📝 *รายการบิลและกำหนดชำระประจำเดือน (${currentMonthAbbr})*\n` +
                  `━━━━━━━━━━━━━━━━━━━\n` +
                  sampleBills.map(b => `• *${b.name}:* ${b.amount.toLocaleString()} บาท (กำหนดวันที่ ${b.dueDay})\n`).join('') +
                  `━━━━━━━━━━━━━━━━━━━\n` +
                  `💡 *หากทำการชำระแล้ว กดปุ่มด้านล่างเพื่อบันทึกและติ๊กชำระได้ทันทีครับ:*`;

  await sendMessage(chatId, message, {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
}


/**
 * เมนูจัดการหมวดหมู่และการเชื่อมต่อ Dialogflow
 */
async function handleCategoriesMenu(chatId) {
  await sendChatAction(chatId, 'typing');
  const allCats = getAllCategories();
  const expenseCount = (allCats.categories.expense || []).length;
  const incomeCount = (allCats.categories.income || []).length;

  const text = `🏷️ *ระบบจัดการหมวดหมู่และ Dialogflow Entities*\n━━━━━━━━━━━━━━━━━━━\n` +
               `• 🔴 *หมวดหมู่รายจ่าย:* ${expenseCount} หมวดหมู่\n` +
               `• 🟢 *หมวดหมู่รายรับ:* ${incomeCount} หมวดหมู่\n` +
               `━━━━━━━━━━━━━━━━━━━\n` +
               `💡 คุณสามารถดึงข้อมูล entities จาก Dialogflow มาดู/แก้ไข หรือเพิ่มหมวดหมู่ใหม่ได้ทันทีผ่านปุ่มด้านล่าง:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📥 ดึงหมวดหมู่จาก Dialogflow', callback_data: 'cat:df_pull' },
        { text: '📤 ส่งหมวดหมู่ไป Dialogflow', callback_data: 'cat:df_push' }
      ],
      [
        { text: '🔴 ดูหมวดหมู่รายจ่าย', callback_data: 'cat:list:expense' },
        { text: '🟢 ดูหมวดหมู่รายรับ', callback_data: 'cat:list:income' }
      ],
      [
        { text: '➕ เพิ่มหมวดหมู่รายจ่าย', callback_data: 'cat:add:expense' },
        { text: '➕ เพิ่มหมวดหมู่รายรับ', callback_data: 'cat:add:income' }
      ],
      [
        { text: '🏠 กลับเมนูหลัก', callback_data: 'action:help' }
      ]
    ]
  };

  await sendMessage(chatId, text, { reply_markup: keyboard });
}

/**
 * แสดงรายการหมวดหมู่แบบละเอียด
 */
async function handleListCategories(chatId, type = 'expense') {
  await sendChatAction(chatId, 'typing');
  const isExp = type === 'expense';
  const categories = getCategoriesByType(type);
  const typeTitle = isExp ? 'รายจ่าย 🔴' : 'รายรับ 🟢';

  if (!categories || categories.length === 0) {
    await sendMessage(chatId, `📭 ไม่พบหมวดหมู่${typeTitle}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '➕ เพิ่มหมวดหมู่นี้', callback_data: `cat:add:${type}` }]]
      }
    });
    return;
  }

  let text = `🏷️ *รายการหมวดหมู่${typeTitle} (${categories.length} หมวดหมู่)*\n━━━━━━━━━━━━━━━━━━━\n`;
  categories.slice(0, 15).forEach((c, i) => {
    const syns = (c.synonyms || []).slice(0, 4).join(', ');
    text += `${i + 1}. *${c.name}*\n` +
            `   └ 💬 คำพ้อง: ${syns || '-'}\n`;
  });

  if (categories.length > 15) {
    text += `\n_...และอีก ${categories.length - 15} หมวดหมู่_\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: `➕ เพิ่มหมวดหมู่${isExp ? 'รายจ่าย' : 'รายรับ'}`, callback_data: `cat:add:${type}` },
        { text: '🔄 ซิงค์ Dialogflow', callback_data: 'cat:df_pull' }
      ],
      [
        { text: '🏷️ เมนูหมวดหมู่', callback_data: 'action:categories' },
        { text: '🏠 เมนูหลัก', callback_data: 'action:help' }
      ]
    ]
  };

  await sendMessage(chatId, text, { reply_markup: keyboard });
}

/**
 * จัดการ Callback Query เมื่อผู้ใช้กด Inline Button
 */

async function handleCallbackQuery(callbackQuery, req) {
  const queryId = callbackQuery.id;
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    if (data === 'action:balance') {
      await answerCallbackQuery(queryId, 'กำลังดึงสรุปยอด...');
      await handleBalanceRequest(chatId, req);
      return;
    }

    if (data === 'action:recent') {
      await answerCallbackQuery(queryId, 'กำลังโหลดประวัติ...');
      await handleRecentRequest(chatId);
      return;
    }

    if (data === 'action:help') {
      await answerCallbackQuery(queryId);
      await handleTextMessage({ chat: { id: chatId }, text: '/help', from: callbackQuery.from }, req);
      return;
    }

    if (data === 'action:bills') {
      await answerCallbackQuery(queryId);
      await handleBillsRequest(chatId);
      return;
    }

    if (data === 'action:categories') {
      await answerCallbackQuery(queryId);
      await handleCategoriesMenu(chatId);
      return;
    }

    // 1. แสดงตัวเลือกเปลี่ยนหมวดหมู่ของรายการที่บันทึก
    if (data.startsWith('edit_cat:')) {
      const txId = data.replace('edit_cat:', '');
      await answerCallbackQuery(queryId, 'เลือกหมวดหมู่ใหม่...');

      const expenseCategories = getCategoriesByType('expense');
      const buttons = [];
      const topCats = expenseCategories.slice(0, 8);
      for (let i = 0; i < topCats.length; i += 2) {
        const row = [
          { text: topCats[i].name, callback_data: `set_cat:${txId}:${topCats[i].name}` }
        ];
        if (topCats[i + 1]) {
          row.push({ text: topCats[i + 1].name, callback_data: `set_cat:${txId}:${topCats[i + 1].name}` });
        }
        buttons.push(row);
      }

      buttons.push([
        { text: '✏️ พิมพ์หมวดหมู่เอง', callback_data: `custom_cat:${txId}` },
        { text: '❌ ปิด', callback_data: 'cat:close' }
      ]);

      await sendMessage(chatId, 
        `✏️ *กรุณาเลือกหมวดหมู่ที่ถูกต้องสำหรับรายการนี้:*\n` +
        `💡 เลือกลิสต์ด้านล่าง หรือกด "พิมพ์หมวดหมู่เอง"`, {
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // 2. อัปเดตหมวดหมู่ทันทีเมื่อกดเลือกจากปุ่ม
    if (data.startsWith('set_cat:')) {
      const parts = data.split(':');
      const txId = parts[1];
      const newCategory = parts.slice(2).join(':');

      const updateRes = updateTransactionCategory(txId, newCategory);
      if (updateRes.success) {
        await answerCallbackQuery(queryId, `✅ เปลี่ยนเป็น "${newCategory}" เรียบร้อย!`, false);
        
        // เพิ่ม Auto-correction rule อัตโนมัติ เพื่อการเรียนรู้
        try {
          if (updateRes.tx && updateRes.tx.item) {
            addCorrectionRule({
              keyword: updateRes.tx.item,
              targetCategory: newCategory,
              type: updateRes.tx.type || 'รายจ่าย'
            });
          }
        } catch (e) {
          console.warn('[TELEGRAM] Error adding correction rule:', e.message);
        }

        await sendMessage(chatId,
          `✅ *แก้ไขหมวดหมู่สำเร็จ!*\n━━━━━━━━━━━━━━━━━━━\n` +
          `📝 *รายการ:* ${updateRes.tx.item}\n` +
          `🏷️ *หมวดหมู่ใหม่:* *${newCategory}* (เดิม: ${updateRes.oldCategory})\n` +
          `🧠 *ระบบจะจำว่า "${updateRes.tx.item}" คือหมวดนี้ในครั้งต่อไปครับ!*\n━━━━━━━━━━━━━━━━━━━`, {
          reply_markup: getMainInlineKeyboard()
        });
      } else {
        await answerCallbackQuery(queryId, 'ไม่พบรายการที่ต้องการแก้ไข', true);
      }
      return;
    }

    // 3. ขอให้พิมพ์หมวดหมู่เอง
    if (data.startsWith('custom_cat:')) {
      const txId = data.replace('custom_cat:', '');
      setUserState(chatId, { step: 'AWAIT_CUSTOM_CATEGORY', txId });
      await answerCallbackQuery(queryId);
      await sendMessage(chatId, 
        `✍️ *กรุณาพิมพ์ชื่อหมวดหมู่ที่ต้องการตั้ง:*\n(เช่น \`อาหารสัตว์\`, \`ค่าของขวัญ\`, \`บำรุงรถ\` หรือพิมพ์ \`ยกเลิก\`)`
      );
      return;
    }

    // 4. ดูรายการหมวดหมู่ (รายรับ/รายจ่าย)
    if (data.startsWith('cat:list:')) {
      const type = data.replace('cat:list:', '');
      await answerCallbackQuery(queryId);
      await handleListCategories(chatId, type);
      return;
    }

    // 5. เริ่มต้นขั้นตอนเพิ่มหมวดหมู่ใหม่
    if (data.startsWith('cat:add:')) {
      const type = data.replace('cat:add:', '');
      const typeLabel = type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢';
      setUserState(chatId, { step: 'AWAIT_NEW_CATEGORY_NAME', type });
      await answerCallbackQuery(queryId);
      await sendMessage(chatId, 
        `➕ *เพิ่มหมวดหมู่${typeLabel} ใหม่*\n━━━━━━━━━━━━━━━━━━━\n` +
        `กรุณาพิมพ์ *ชื่อหมวดหมู่* ที่ต้องการเพิ่ม เช่น \`สัตว์เลี้ยง\`, \`สุขภาพ\`, \`ประกันภัย\`\n(พิมพ์ \`ยกเลิก\` เพื่อยกเลิก)`
      );
      return;
    }

    // 6. ดึง Entities ทั้งหมดจาก Dialogflow
    if (data === 'cat:df_pull') {
      await answerCallbackQuery(queryId, 'กำลังดึง Entities จาก Dialogflow...');
      await sendChatAction(chatId, 'typing');
      try {
        const importRes = await importFromDialogflow();
        await sendMessage(chatId, 
          `📥 *ดึงข้อมูลจาก Dialogflow สำเร็จ!*\n━━━━━━━━━━━━━━━━━━━\n` +
          `• 🔴 รายจ่าย: ${importRes.expenseCount} หมวดหมู่\n` +
          `• 🟢 รายรับ: ${importRes.incomeCount} หมวดหมู่\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `💡 หมวดหมู่ทั้งหมดได้รับการอัปเดตเข้าสู่ระบบเรียบร้อยแล้ว`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔴 ดูหมวดหมู่รายจ่าย', callback_data: 'cat:list:expense' },
                { text: '🟢 ดูหมวดหมู่รายรับ', callback_data: 'cat:list:income' }
              ],
              [{ text: '🏷️ เมนูหมวดหมู่', callback_data: 'action:categories' }]
            ]
          }
        });
      } catch (dfErr) {
        await sendMessage(chatId, 
          `⚠️ *ไม่สามารถเชื่อมต่อ Dialogflow ได้:*\n${dfErr.message}\n\n` +
          `💡 กรุณาตรวจสอบว่าได้ตั้งค่า Service Account หรือ DIALOGFLOW_PROJECT_ID ในการตั้งค่าแล้ว`, {
          reply_markup: getMainInlineKeyboard()
        });
      }
      return;
    }

    // 7. ส่งหมวดหมู่ขึ้นไป Dialogflow
    if (data === 'cat:df_push') {
      await answerCallbackQuery(queryId, 'กำลังส่งหมวดหมู่ไปยัง Dialogflow...');
      await sendChatAction(chatId, 'typing');
      try {
        const exportRes = await exportToDialogflow();
        await sendMessage(chatId, 
          `📤 *ส่งหมวดหมู่ไปยัง Dialogflow สำเร็จ!*\n━━━━━━━━━━━━━━━━━━━\n` +
          `• 🔴 รายจ่าย (${exportRes.expense.displayName}): ${exportRes.expense.count} หมวดหมู่\n` +
          `• 🟢 รายรับ (${exportRes.income.displayName}): ${exportRes.income.count} หมวดหมู่\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🎉 Dialogflow Agent ได้รับ Entities ล่าสุดแล้ว!`, {
          reply_markup: getMainInlineKeyboard()
        });
      } catch (dfErr) {
        await sendMessage(chatId, 
          `⚠️ *ส่งหมวดหมู่ไปยัง Dialogflow ไม่สำเร็จ:*\n${dfErr.message}`, {
          reply_markup: getMainInlineKeyboard()
        });
      }
      return;
    }

    // 8. ปิดหน้าต่างการเลือก
    if (data === 'cat:close') {
      await answerCallbackQuery(queryId);
      await callTelegramApi('deleteMessage', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // กรณีปุ่มชำระบิล: "pay:<billName>:<month>"
    if (data.startsWith('pay:')) {
      const parts = data.split(':');
      const targetCategory = parts[1] || 'บิลค่าใช้จ่าย';
      const targetMonth = parts[2] || '';

      // บันทึกลงระบบรายจ่าย
      const recordPayload = {
        item: `ชำระ ${targetCategory}`,
        type: 'รายจ่าย',
        amount: 0, // หรือตามยอดบิล
        category: 'ค่าสาธารณูปโภค',
        account: 'กสิกร',
        platform: 'Telegram Bill Pay',
        recorder: callbackQuery.from.first_name || 'ผู้ใช้ Telegram'
      };
      recordLocalTransaction(recordPayload);

      await answerCallbackQuery(queryId, `✅ บันทึกชำระ "${targetCategory}" เรียบร้อย!`, false);

      const updatedText = (callbackQuery.message.text || '') + 
        `\n\n🟢 *บันทึกเรียบร้อย:* ได้ทำการชำระ ${targetCategory} ประจำเดือน ${targetMonth} เรียบร้อยแล้ว!`;

      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        parse_mode: 'Markdown'
      });
      return;
    }

    await answerCallbackQuery(queryId);
  } catch (err) {
    console.error('[TELEGRAM CALLBACK ERROR]', err);
    await answerCallbackQuery(queryId, 'เกิดข้อผิดพลาด: ' + err.message, true);
  }
}

/**
 * ฟังก์ชันหลักในการรับและกระจาย Webhook Updates จาก Telegram
 */
async function processTelegramUpdate(update, req) {
  if (!update) return;

  // 1. ข้อความใหม่ (Text หรือ Photo)
  if (update.message) {
    const msg = update.message;

    // ถ้ามีรูปภาพ (เช่น สลิปโอนเงิน)
    if (msg.photo && msg.photo.length > 0) {
      await handlePhotoMessage(msg, req);
      return;
    }

    // ถ้าเป็นข้อความตัวอักษร
    if (msg.text) {
      await handleTextMessage(msg, req);
      return;
    }
  }

  // 2. การกดปุ่ม Inline Button (Callback Query)
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, req);
    return;
  }
}

module.exports = {
  getTelegramConfig,
  saveTelegramConfig,
  callTelegramApi,
  getMe,
  getWebhookInfo,
  setWebhook,
  deleteWebhook,
  sendMessage,
  sendPhoto,
  sendChatAction,
  answerCallbackQuery,
  processTelegramUpdate,
  handleBalanceRequest,
  handleRecentRequest
};
