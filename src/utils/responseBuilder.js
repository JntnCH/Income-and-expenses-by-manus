/**
 * Response Builder Utility
 * สร้างข้อความตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 *
 * Intent mapping:
 *   บันทึกรายรับ  → buildIncomeConfirmation()       (Entity: Income_category)
 *   บันทึกรายจ่าย → buildExpenseConfirmation()      (Entity: Expense-category)
 *   บันทึกการขาย  → buildSellInvestmentConfirmation() (Entity: Asset-type)
 *   บันทึกการซื้อ  → buildBuyInvestmentConfirmation()  (Entity: Asset-type)
 */

// Emoji ประจำประเภทสินทรัพย์
const ASSET_EMOJI = {
  'หุ้น':    '📈',
  'กองทุน':  '💼',
  'ทองคำ':   '🥇',
  'คริปโต':  '🪙',
  'อื่นๆ':   '📊'
};

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

// ============================================================
// รายรับ / รายจ่าย ทั่วไป
// ============================================================

/**
 * ยืนยันการบันทึกรายรับ (Entity: Income_category)
 */
function buildIncomeConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 หมวดหมู่รายรับ: ${category} 💰\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * ยืนยันการบันทึกรายจ่าย (Entity: Expense-category)
 */
function buildExpenseConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 หมวดหมู่รายจ่าย: ${category} 💪\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

// ============================================================
// การซื้อ/ขายสินทรัพย์การลงทุน
// ============================================================

/**
 * ยืนยันการบันทึกการซื้อสินทรัพย์ (Entity: Asset-type)
 * @param {string} assetName    - ชื่อสินทรัพย์ เช่น "PTT", "Bitcoin"
 * @param {string} assetType    - ประเภท: หุ้น/กองทุน/ทองคำ/คริปโต/อื่นๆ
 * @param {number} quantity     - จำนวนหน่วย/หุ้น/กรัม
 * @param {number} pricePerUnit - ราคาต่อหน่วย (0 = ไม่ระบุ)
 * @param {number} totalAmount  - ยอดรวม
 */
function buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  const emoji = ASSET_EMOJI[assetType] || '📊';
  const unitLabel = getUnitLabel(assetType);

  let lines = [];
  lines.push(`📝 ฉันบันทึก ซื้อ${assetType}`);
  lines.push(`${emoji} สินทรัพย์: ${assetName}`);
  lines.push(`📂 ประเภท: ${assetType}`);
  lines.push('');

  if (quantity > 0) {
    lines.push(`📦 จำนวน: ${formatQuantity(quantity, assetType)} ${unitLabel}`);
  }
  if (pricePerUnit > 0) {
    lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  }
  if (totalAmount > 0) {
    lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  }

  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');

  return lines.join('\n');
}

/**
 * ยืนยันการบันทึกการขายสินทรัพย์ (Entity: Asset-type)
 */
function buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  const emoji = ASSET_EMOJI[assetType] || '📊';
  const unitLabel = getUnitLabel(assetType);

  let lines = [];
  lines.push(`📝 ฉันบันทึก ขาย${assetType}`);
  lines.push(`${emoji} สินทรัพย์: ${assetName}`);
  lines.push(`📂 ประเภท: ${assetType}`);
  lines.push('');

  if (quantity > 0) {
    lines.push(`📦 จำนวน: ${formatQuantity(quantity, assetType)} ${unitLabel}`);
  }
  if (pricePerUnit > 0) {
    lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  }
  if (totalAmount > 0) {
    lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  }

  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');

  return lines.join('\n');
}

// ============================================================
// ยอดคงเหลือ
// ============================================================

/**
 * สรุปยอดคงเหลือ (รวมข้อมูลจากทุก Sheet ยกเว้น Sheet การลงทุน)
 */
function buildBalanceSummary(summary) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => {
        const sheetTag = i.sheet ? ` [${i.sheet}]` : '';
        return `${i.item} ${formatAmount(i.amount)} บาท${sheetTag}`;
      })
      .join('\n');
  } else {
    itemsText = 'ยังไม่มีรายการวันนี้';
  }

  const sheetInfo = summary.sheetsScanned
    ? `\n📋 รวมข้อมูลจาก ${summary.sheetsScanned} ชีต`
    : '';

  return `📅 ยอดประจำวันที่ ${dateStr}${sheetInfo}\n\n` +
         `📝 รายการวันนี้\n${itemsText}\n\n` +
         `💸 รายรับวันนี้  ${formatAmount(summary.dailyIncome)} บาท\n` +
         `🛍️ รายจ่ายวันนี้  ${formatAmount(summary.dailyExpense)} บาท\n\n` +
         `💰 รายรับเดือนนี้  ${formatAmount(summary.monthlyIncome)} บาท\n` +
         `📄 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท\n\n` +
         `🪙 ยอดคงเหลือ ${formatAmount(summary.balance)} บาท`;
}

/**
 * ยืนยันการบันทึกจาก OCR
 */
function buildOCRConfirmation(ocrResult, type) {
  const typeEmoji = type === 'รายรับ' ? '💰' : '🛒';
  const typeText = type === 'รายรับ' ? 'รายรับ' : 'รายจ่าย';
  return `🔍 สแกน${typeText}จากสลิป/ใบเสร็จ\n\n` +
         `📝 รายการ: ${ocrResult.item || 'ไม่ระบุ'}\n` +
         `${typeEmoji} จำนวน: ${formatAmount(ocrResult.amount)} บาท\n` +
         `📂 หมวดหมู่: ${ocrResult.category || 'ทั่วไป'}\n\n` +
         `✅ บันทึกเรียบร้อยแล้ว`;
}

// ============================================================
// Helpers
// ============================================================

/**
 * หน่วยนับตามประเภทสินทรัพย์
 */
function getUnitLabel(assetType) {
  const units = {
    'หุ้น':   'หุ้น',
    'กองทุน': 'หน่วย',
    'ทองคำ':  'กรัม',
    'คริปโต': 'เหรียญ',
    'อื่นๆ':  'หน่วย'
  };
  return units[assetType] || 'หน่วย';
}

/**
 * จัดรูปแบบจำนวนหน่วยตามประเภทสินทรัพย์
 * ทองคำ/คริปโต แสดงทศนิยม 4 ตำแหน่ง, หุ้น/กองทุน แสดงจำนวนเต็ม
 */
function formatQuantity(quantity, assetType) {
  if (assetType === 'ทองคำ' || assetType === 'คริปโต') {
    return parseFloat(quantity).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8
    });
  }
  return parseFloat(quantity).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
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
  buildOCRConfirmation,
  formatAmount
};
