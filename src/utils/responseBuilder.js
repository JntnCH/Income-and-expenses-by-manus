/**
 * Response Builder Utility (Image Edition)
 * สร้างข้อความตอบกลับ + รูปภาพสลิปสำหรับ Dialogflow/Telegram
 */

const { buildReceiptHTML, buildBalanceReceiptHTML } = require('./receiptTemplate');
const { generateImage } = require('./imageGenerator');

// ============================================================
// 1. Dialogflow Response Helpers
// ============================================================

function buildDialogflowResponse(text) {
  return {
    fulfillmentMessages: [
      { text: { text: [text] } }
    ]
  };
}

function buildDialogflowImageResponse(imageUrl, caption = '') {
  return {
    fulfillmentMessages: [
      {
        payload: {
          telegram: {
            photo: imageUrl,
            caption: caption,
            parse_mode: 'HTML'
          }
        }
      }
    ]
  };
}

function buildDialogflowMixedResponse(text, imageUrl, caption = '') {
  const messages = [
    { text: { text: [text] } }
  ];

  if (imageUrl) {
    messages.push({
      payload: {
        telegram: {
          photo: imageUrl,
          caption: caption,
          parse_mode: 'HTML'
        }
      }
    });
  }

  return { fulfillmentMessages: messages };
}

// ============================================================
// 2. Transaction Confirmations (พร้อมสร้างรูป)
// ============================================================

async function buildTransactionConfirmation(type, item, amount, category, account, recorder = 'ไม่ระบุ') {
  const html = buildReceiptHTML({
    type,
    item,
    amount,
    category,
    account,
    recorder,
    date: new Date()
  });

  const filename = `receipt_${Date.now()}`;
  const imagePath = await generateImage(html, filename);

  const caption = `✅ บันทึก${type} "${item}" จำนวน ${formatAmount(amount)} บาท เรียบร้อยแล้ว`;

  return {
    imagePath,
    filename: `${filename}.png`,
    caption,
    textFallback: buildTransactionText(type, item, amount, category, account)
  };
}

async function buildIncomeConfirmation(item, amount, category, account, recorder) {
  return buildTransactionConfirmation('รายรับ', item, amount, category, account, recorder);
}

async function buildExpenseConfirmation(item, amount, category, account, recorder) {
  return buildTransactionConfirmation('รายจ่าย', item, amount, category, account, recorder);
}

function buildTransactionText(type, item, amount, category, account) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 ประเภท : ${type}\n` +
         `📦 หมวดหมู่ : ${category}\n` +
         `💳 บัญชี : ${account || 'เงินสด'} \n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

// ============================================================
// 3. OCR Confirmation
// ============================================================

async function buildOCRConfirmation(ocrResult, type = 'รายจ่าย', recorder = 'ไม่ระบุ') {
  const html = buildReceiptHTML({
    type,
    item: ocrResult.item || 'สแกนจากสลิป',
    amount: ocrResult.amount || 0,
    category: ocrResult.category || 'ทั่วไป',
    account: ocrResult.account || 'ไม่ระบุ',
    recorder,
    date: new Date()
  });

  const filename = `ocr_${Date.now()}`;
  const imagePath = await generateImage(html, filename);

  return {
    imagePath,
    filename: `${filename}.png`,
    caption: `📸 อ่านข้อมูลจากสลิปสำเร็จ! บันทึก ${ocrResult.item || 'รายการ'} เรียบร้อยแล้ว`,
    textFallback: `📸 อ่านข้อมูลจากสลิปสำเร็จ!\n` +
                  `📝 รายการ: ${ocrResult.item || 'สแกนจากสลิป'}\n` +
                  `📂 ประเภท: ${type}\n` +
                  `💵 จำนวน: ${formatAmount(ocrResult.amount)} บาท\n` +
                  `✅ บันทึกลง Google Sheets ให้แล้วครับ`
  };
}

// ============================================================
// 4. Investment Confirmations
// ============================================================

async function buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount, recorder = 'ไม่ระบุ') {
  const html = buildReceiptHTML({
    type: 'ซื้อสินทรัพย์',
    item: `${assetName} (${assetType})`,
    amount: totalAmount,
    category: assetType,
    account: 'พอร์ตการลงทุน',
    recorder,
    date: new Date()
  });

  const filename = `buy_${Date.now()}`;
  const imagePath = await generateImage(html, filename);

  let textLines = [];
  textLines.push(`📝 ฉันบันทึก ซื้อ${assetType}`);
  textLines.push(`📈 สินทรัพย์: ${assetName}`);
  textLines.push('');
  if (quantity > 0) textLines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) textLines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) textLines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  textLines.push('');
  textLines.push('✅ ให้คุณเรียบร้อยแล้ว');

  return {
    imagePath,
    filename: `${filename}.png`,
    caption: `✅ บันทึกซื้อ${assetType} ${assetName} เรียบร้อยแล้ว`,
    textFallback: textLines.join('\n')
  };
}

async function buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount, recorder = 'ไม่ระบุ') {
  const html = buildReceiptHTML({
    type: 'ขายสินทรัพย์',
    item: `${assetName} (${assetType})`,
    amount: totalAmount,
    category: assetType,
    account: 'พอร์ตการลงทุน',
    recorder,
    date: new Date()
  });

  const filename = `sell_${Date.now()}`;
  const imagePath = await generateImage(html, filename);

  let textLines = [];
  textLines.push(`📝 ฉันบันทึก ขาย${assetType}`);
  textLines.push(`📈 สินทรัพย์: ${assetName}`);
  textLines.push('');
  if (quantity > 0) textLines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) textLines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) textLines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  textLines.push('');
  textLines.push('✅ ให้คุณเรียบร้อยแล้ว');

  return {
    imagePath,
    filename: `${filename}.png`,
    caption: `✅ บันทึกขาย${assetType} ${assetName} เรียบร้อยแล้ว`,
    textFallback: textLines.join('\n')
  };
}

// ============================================================
// 5. Balance Summary (รูปภาพ + ข้อความ)
// ============================================================

/**
 * สร้างสลิปสรุปยอดเป็นรูปภาพ (async)
 * @returns {Promise<{imagePath, filename, caption, textFallback}>}
 */
async function buildBalanceSummary(summary, recorder = 'ไม่ระบุ') {
  const html = buildBalanceReceiptHTML(summary, recorder);
  const filename = `balance_${Date.now()}`;
  const imagePath = await generateImage(html, filename);

  const textFallback = buildBalanceSummaryText(summary);

  return {
    imagePath,
    filename: `${filename}.png`,
    caption: `📊 สรุปยอดคงเหลือ ${summary.formattedDate}`,
    textFallback
  };
}

/**
 * สร้างข้อความสรุปยอดแบบเดิม (ไม่ต้องใช้ async)
 * ใช้สำหรับ fallback หรือกรณีไม่ต้องการรูปภาพ
 */
function buildBalanceSummaryText(summary) {
  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => `- ${i.item} ${formatAmount(i.amount)} บาท`)
      .join('\n');
  } else {
    itemsText = '- ยังไม่มีรายการวันนี้';
  }

  let accountText = '';
  if (summary.accountBalances && summary.accountBalances.length > 0) {
    accountText = '\n🏦 ยอดรวมแยกตามบัญชี\n' + 
      summary.accountBalances
        .map(acc => ` - ${acc.name} : ${formatAmount(acc.amount)} บาท`)
        .join('\n');
  }

  return (
    `📅 ยอดประจำวันที่ ${summary.formattedDate}\n` +
    `📋 ข้อมูลจากชีต : ${summary.summarySheet}\n\n` +
    `📝 รายการวันนี้\n` +
    `${itemsText}\n\n` +
    `💸 รายรับวันนี้  ${formatAmount(summary.dailyIncome)} บาท\n` +
    `🛍️ รายจ่ายวันนี้ ${formatAmount(summary.dailyExpense)} บาท\n` +
    `💰 รายรับเดือนนี้  ${formatAmount(summary.monthlyIncome)} บาท\n` +
    `🛒 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท` +
    `${accountText}\n\n`+
    `🪙 ยอดรวมทุกบัญชี ${formatAmount(summary.balance)} บาท`
  );
}

// ============================================================
// 6. Utilities
// ============================================================

function formatAmount(amount) {
  return parseFloat(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = {
  // Dialogflow responses
  buildDialogflowResponse,
  buildDialogflowImageResponse,
  buildDialogflowMixedResponse,

  // Confirmations (async - return image info)
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildOCRConfirmation,
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,

  // Text-only fallback
  buildBalanceSummaryText,
  buildTransactionText,

  // Utils
  formatAmount
};
