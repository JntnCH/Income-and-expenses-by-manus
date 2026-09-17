/**
 * Response Builder Utility
 * สร้างข้อความและรูปภาพตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 */

/**
 * สร้าง Dialogflow Fulfillment Response พร้อมรองรับรูปภาพ
 * @param {string} text - ข้อความตอบกลับ
 * @param {string} [imageUrl] - URL รูปภาพการ์ดสรุปยอด/สลิป (ถ้ามี)
 */
function buildDialogflowResponse(text, imageUrl = null) {
  const fulfillmentMessages = [
    {
      text: { text: [text] }
    }
  ];

  if (imageUrl) {
    // 1. Standard Dialogflow Image Message
    fulfillmentMessages.push({
      image: {
        imageUri: imageUrl,
        accessibilityText: 'DevMus Transaction Summary Card'
      }
    });

    // 2. Platform-specific Custom Payloads (LINE / Telegram / Facebook)
    // Removed because standard Dialogflow image response is supported natively
    // across Telegram, LINE, and Facebook Messenger. Incorrect custom payloads
    // can cause the platform integration to fail and drop the image.
  }

  return {
    fulfillmentText: text,
    fulfillmentMessages,
    ...(imageUrl ? { imageUrl } : {})
  };
}

/**
 * ยืนยันการบันทึกรายรับ/รายจ่าย พร้อมแสดงบัญชี (Account)
 */
function buildTransactionConfirmation(type, item, amount, category, account) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 ประเภท : ${type}\n` +
         `📦 หมวดหมู่ : ${category}\n` +
         `💳 บัญชี : ${account || 'เงินสด'} \n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

function buildIncomeConfirmation(item, amount, category, account) {
  return buildTransactionConfirmation('รายรับ', item, amount, category, account);
}

function buildExpenseConfirmation(item, amount, category, account) {
  return buildTransactionConfirmation('รายจ่าย', item, amount, category, account);
}

/**
 * ยืนยันการบันทึกจาก OCR (สลิป/ใบเสร็จ)
 */
function buildOCRConfirmation(ocrResult, type = 'รายจ่าย') {
  return `📸 อ่านข้อมูลจากสลิปสำเร็จ!\n` +
         `📝 รายการ: ${ocrResult.item || 'สแกนจากสลิป'}\n` +
         `📂 ประเภท: ${type}\n` +
         `💵 จำนวน: ${formatAmount(ocrResult.amount)} บาท\n` +
         `✅ บันทึกลง Google Sheets ให้แล้วครับ`;
}

/**
 * ยืนยันการบันทึกการซื้อสินทรัพย์
 */
function buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  let lines = [];
  lines.push(`📝 ฉันบันทึก ซื้อ${assetType}`);
  lines.push(`📈 สินทรัพย์: ${assetName}`);
  lines.push('');
  if (quantity > 0) lines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');
  return lines.join('\n');
}

/**
 * ยืนยันการบันทึกการขายสินทรัพย์
 */
function buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  let lines = [];
  lines.push(`📝 ฉันบันทึก ขาย${assetType}`);
  lines.push(`📈 สินทรัพย์: ${assetName}`);
  lines.push('');
  if (quantity > 0) lines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');
  return lines.join('\n');
}

/**
 * สรุปยอดคงเหลือ ตามรูปแบบที่ผู้ใช้ต้องการ
 * เพิ่ม: การแสดงผลยอดแยกตามบัญชี (Account Balances)
 */
function buildBalanceSummary(summary) {
  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => `- ${i.item} ${formatAmount(i.amount)} บาท`)
      .join('\n');
  } else {
    itemsText = '- ยังไม่มีรายการวันนี้';
  }

  // สร้างส่วนแสดงยอดแยกบัญชี
  let accountText = '';
  if (summary.accountBalances && summary.accountBalances.length > 0) {
    accountText = '\n🏦 ยอดคงเหลือแต่ล่ะบัญชี\n' + 
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
    `🛒 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท\n` +
    `${accountText}\n\n`+
    `🪙 ยอดรวมทุกบัญชี ${formatAmount(summary.balance)} บาท`
  );
}

/**
 * จัดรูปแบบตัวเลขเงิน
 */
function formatAmount(amount) {
  return parseFloat(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = {
  buildDialogflowResponse,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildOCRConfirmation,
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,
  formatAmount
};
