/**
 * Response Builder Utility
 * สร้างข้อความและรูปภาพตอบกลับสำหรับ Dialogflow และ Telegram ในรูปแบบต่างๆ
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
    fulfillmentMessages.push({
      image: {
        imageUri: imageUrl,
        accessibilityText: 'DevMus Transaction Summary Card'
      }
    });
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
         `📦 หมวดหมู่ : ${category || 'ทั่วไป'}\n` +
         `💳 บัญชี : ${account || 'เงินสด'}\n` +
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
 * สรุปยอดคงเหลือ แยก 2 ส่วนชัดเจนตามข้อกำหนด
 * ส่วนที่ 1: รายการวันนี้ + สรุปยอดรายรับ-รายจ่าย (ประจำวันและประจำเดือน)
 * ส่วนที่ 2: ยอดคงเหลือแต่ละบัญชี + ยอดรวมทุกบัญชี
 */
function buildBalanceSummary(summary) {
  // --- ส่วนที่ 1: รายการวันนี้ + สรุปยอด ---
  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => {
        const sign = i.type === 'รายรับ' ? '+' : '-';
        return `- ${i.item} ${sign}${formatAmount(i.amount)} บาท`;
      })
      .join('\n');
  } else {
    itemsText = '- ยังไม่มีรายการวันนี้';
  }

  const section1 = [
    `📅 ยอดประจำวันที่ ${summary.formattedDate}`,
    `📋 ข้อมูลจากชีต : ${summary.summarySheet || 'BotDashboard'}`,
    '',
    `📝 รายการวันนี้`,
    itemsText,
    '',
    `💸 รายรับวันนี้  ${formatAmount(summary.dailyIncome)} บาท`,
    `🛍️ รายจ่ายวันนี้ ${formatAmount(summary.dailyExpense)} บาท`,
    '',
    `💰 รายรับเดือนนี้  ${formatAmount(summary.monthlyIncome)} บาท`,
    `🛒 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท`
  ].join('\n');

  // --- ส่วนที่ 2: ยอดคงเหลือแต่ละบัญชี ---
  let accountText = '';
  if (summary.accountBalances && summary.accountBalances.length > 0) {
    accountText = summary.accountBalances
      .map(acc => `- ${acc.name} : ${formatAmount(acc.amount)} บาท`)
      .join('\n');
  } else {
    accountText = '- ไม่มีข้อมูลบัญชี';
  }

  const section2 = [
    `🏦 ยอดคงเหลือแต่ละบัญชี`,
    accountText,
    '',
    `🪙 ยอดรวมทุกบัญชี ${formatAmount(summary.balance)} บาท`
  ].join('\n');

  return `${section1}\n\n------------------------------\n\n${section2}`;
}

/**
 * ยืนยันการแก้ไขรายการ (Edit Confirmation)
 */
function buildEditConfirmation(editResult) {
  const oldTx = editResult.oldTransaction || {};
  const newTx = editResult.newTransaction || {};

  let text = `✏️ แก้ไขรายการเรียบร้อยแล้ว\n\n` +
             `📋 ข้อมูลเดิม:\n` +
             `• รายการ: ${oldTx.item || 'ไม่ระบุ'}\n` +
             `• จำนวนเงิน: ${formatAmount(oldTx.amount)} บาท\n`;
  if (oldTx.category) text += `• หมวดหมู่: ${oldTx.category}\n`;
  if (oldTx.account) text += `• บัญชี: ${oldTx.account}\n`;

  text += `\n✨ ข้อมูลใหม่:\n` +
          `• รายการ: ${newTx.item || 'ไม่ระบุ'}\n` +
          `• จำนวนเงิน: ${formatAmount(newTx.amount)} บาท\n`;
  if (newTx.category) text += `• หมวดหมู่: ${newTx.category}\n`;
  if (newTx.account) text += `• บัญชี: ${newTx.account}\n`;

  text += `\n✅ บันทึกการแก้ไขลง Google Sheets เรียบร้อยแล้ว`;
  if (newTx.transactionId) {
    text += `\n🆔 Transaction ID: ${newTx.transactionId}`;
  }

  return text;
}

/**
 * เมื่อพบรายการที่เข้าเงื่อนไขมากกว่า 1 รายการ (ห้ามสุ่ม ให้ผู้ใช้เลือก)
 */
function buildMultipleMatchesResponse(matches) {
  let text = `⚠️ พบรายการที่ตรงกับเงื่อนไข ${matches.length} รายการ กรุณาระบุให้ชัดเจนขึ้น หรือระบุ Transaction ID ค่ะ:\n\n`;
  matches.slice(0, 5).forEach((m, idx) => {
    text += `${idx + 1}) [ID: ${m.transactionId || m.rowIndex}] ${m.date} - ${m.item} ${formatAmount(m.amount)} บาท (${m.account || 'เงินสด'})\n`;
  });
  text += `\n💡 ตัวอย่างการสั่ง: "แก้รายการ ID ${matches[0].transactionId || matches[0].rowIndex} เป็น 50"`;
  return text;
}

/**
 * เมื่อค้นหาแล้วไม่พบรายการ
 */
function buildNotFoundResponse(criteria = {}) {
  const queryItem = criteria.oldItem || criteria.item || '';
  const queryAmount = criteria.oldAmount || criteria.amount || '';
  let hint = queryItem ? ` "${queryItem}"` : '';
  if (queryAmount) hint += ` จำนวน ${formatAmount(queryAmount)} บาท`;
  return `❌ ไม่พบรายการ${hint} ในสเปรดชีต กรุณาตรวจสอบชื่อรายการหรือจำนวนเงินอีกครั้งค่ะ`;
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
  buildTransactionConfirmation,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildOCRConfirmation,
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,
  buildEditConfirmation,
  buildMultipleMatchesResponse,
  buildNotFoundResponse,
  formatAmount
};
