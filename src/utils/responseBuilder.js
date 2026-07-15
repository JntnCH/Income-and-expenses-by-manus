/**
 * Response Builder Utility
 * สร้างข้อความตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 */

/**
 * สร้าง Dialogflow Fulfillment Response
 */
function buildDialogflowResponse(text) {
  return {
    fulfillmentMessages: [
      { text: { text: [text] } }
    ]
  };
}

/**
 * ยืนยันการบันทึกรายรับ/รายจ่าย พร้อมแสดงบัญชี (Account)
 */
function buildTransactionConfirmation(type, item, amount, category, account) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 ประเภท : ${type}\n` +
         `📦 หมวดหมู่ : ${category}\n` +
         `💳 บัญชี : ${account} \n` +
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
 * สรุปยอดคงเหลือ ตามรูปแบบที่ผู้ใช้ต้องการ (จากรูปภาพ)
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
    accountText = '\n\n🏦 ยอดแยกตามบัญชี\n' + 
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
    `🛍️ รายจ่ายวันนี้ ${formatAmount(summary.dailyExpense)} บาท\n\n` +
    `💰 รายรับเดือนนี้  ${formatAmount(summary.monthlyIncome)} บาท\n` +
    `🛒 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท\n\n` +
    `🪙 รวมทุกบัญชี ${formatAmount(summary.balance)} บาท` +
    `${accountText}`
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
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,
  formatAmount,
};
