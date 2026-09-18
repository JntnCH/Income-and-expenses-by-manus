const sharp = require('sharp');

/**
 * Utility to escape XML/SVG special characters
 */
function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format currency number
 */
function formatNum(num) {
  return parseFloat(num || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Generate a Transaction Card SVG (Income / Expense)
 */
function createTransactionSvg(data) {
  const isIncome = data.type === 'รายรับ' || data.type === 'income';
  const primaryColor = isIncome ? '#10B981' : '#EF4444';
  const gradientStart = isIncome ? '#059669' : '#DC2626';
  const gradientEnd = isIncome ? '#10B981' : '#F87171';
  const lightBg = isIncome ? '#ECFDF5' : '#FEF2F2';
  const title = isIncome ? 'บันทึกรายรับสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ';
  const dateStr = data.date || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const amountStr = `${isIncome ? '+' : '-'}${formatNum(data.amount)} ฿`;

  return `
  <svg width="600" height="420" viewBox="0 0 600 420" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${gradientStart}" />
        <stop offset="100%" stop-color="${gradientEnd}" />
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.12" />
      </filter>
    </defs>

    <rect width="600" height="420" fill="#F3F4F6" rx="0" />
    <rect x="25" y="25" width="550" height="370" rx="20" fill="#FFFFFF" filter="url(#shadow)" />
    
    <!-- Top Header Banner -->
    <rect x="25" y="25" width="550" height="85" rx="20" fill="url(#headerGrad)" />
    <rect x="25" y="90" width="550" height="20" fill="url(#headerGrad)" />
    
    <text x="50" y="65" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">${escapeXml(title)}</text>
    <text x="50" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#E5E7EB">${escapeXml(dateStr)}</text>
    <text x="540" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="end" fill="#FFFFFF">${isIncome ? '💰' : '🛍️'}</text>

    <!-- Amount Display Box -->
    <rect x="50" y="125" width="500" height="75" rx="14" fill="${lightBg}" />
    <text x="75" y="152" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#6B7280" font-weight="600">ยอดเงิน</text>
    <text x="75" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="bold" fill="${primaryColor}">${escapeXml(amountStr)}</text>

    <!-- Details Grid -->
    <g transform="translate(50, 220)">
      <text x="20" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">📝 รายการ</text>
      <text x="20" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.item || 'ไม่ระบุ')}</text>

      <text x="270" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">📦 หมวดหมู่</text>
      <text x="270" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.category || 'ทั่วไป')}</text>

      <text x="20" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">💳 บัญชี</text>
      <text x="20" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.account || 'เงินสด')}</text>

      <text x="270" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">👤 ผู้บันทึก / ช่องทาง</text>
      <text x="270" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.recorder || 'User')} (${escapeXml(data.platform || 'Dialogflow')})</text>
    </g>

    <text x="300" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#9CA3AF" text-anchor="middle">✓ บันทึกลง Google Sheets เรียบร้อยแล้ว</text>
  </svg>
  `;
}

/**
 * Generate Edit Confirmation Card SVG (✏️ แก้ไขรายการ)
 * Shows exact comparison: เดิม (Old) vs ใหม่ (New) with Status Badge
 */
function createEditConfirmationSvg(data) {
  const oldTx = data.oldTransaction || data.old || {};
  const newTx = data.newTransaction || data.new || {};

  const oldItem = oldTx.item || data.oldItem || 'ไม่ระบุ';
  const oldAmount = formatNum(oldTx.amount !== undefined ? oldTx.amount : data.oldAmount);
  const oldAccount = oldTx.account || data.oldAccount || '';
  const oldCat = oldTx.category || data.oldCategory || '';

  const newItem = newTx.item || data.newItem || oldItem;
  const newAmount = formatNum(newTx.amount !== undefined ? newTx.amount : data.newAmount);
  const newAccount = newTx.account || data.newAccount || oldAccount;
  const newCat = newTx.category || data.newCategory || oldCat;

  const dateStr = newTx.date || data.date || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  return `
  <svg width="600" height="480" viewBox="0 0 600 480" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="editGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4F46E5" />
        <stop offset="100%" stop-color="#7C3AED" />
      </linearGradient>
      <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.10" />
      </filter>
    </defs>

    <rect width="600" height="480" fill="#F3F4F6" />
    <rect x="25" y="20" width="550" height="440" rx="20" fill="#FFFFFF" filter="url(#cardShadow)" />

    <!-- Top Header -->
    <rect x="25" y="20" width="550" height="80" rx="20" fill="url(#editGrad)" />
    <rect x="25" y="80" width="550" height="20" fill="url(#editGrad)" />
    
    <text x="50" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">✏️ แก้ไขรายการสำเร็จ</text>
    <text x="50" y="84" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#E0E7FF">📅 ${escapeXml(dateStr)} • ปรับปรุงข้อมูลใน Google Sheets แล้ว</text>
    <text x="540" y="70" font-family="system-ui, -apple-system, sans-serif" font-size="26" text-anchor="end" fill="#FFFFFF">📝</text>

    <!-- Box 1: เดิม (Old Values) -->
    <g transform="translate(50, 115)">
      <rect x="0" y="0" width="500" height="115" rx="14" fill="#FEF2F2" stroke="#FECACA" stroke-width="1" />
      <text x="20" y="28" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#DC2626">⏳ ข้อมูลเดิม</text>
      
      <text x="20" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#4B5563">รายการ:</text>
      <text x="95" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(oldItem)}</text>
      
      <text x="20" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#4B5563">จำนวนเงิน:</text>
      <text x="95" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#991B1B">${escapeXml(oldAmount)} บาท</text>
      
      ${oldCat ? `<text x="320" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#6B7280">หมวด: ${escapeXml(oldCat)}</text>` : ''}
      ${oldAccount ? `<text x="320" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#6B7280">บัญชี: ${escapeXml(oldAccount)}</text>` : ''}
    </g>

    <!-- Box 2: ใหม่ (New Values) -->
    <g transform="translate(50, 245)">
      <rect x="0" y="0" width="500" height="115" rx="14" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1" />
      <text x="20" y="28" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#059669">✨ ข้อมูลใหม่ (อัปเดต)</text>
      
      <text x="20" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#4B5563">รายการ:</text>
      <text x="95" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#065F46">${escapeXml(newItem)}</text>
      
      <text x="20" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#4B5563">จำนวนเงิน:</text>
      <text x="95" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#047857">${escapeXml(newAmount)} บาท</text>
      
      ${newCat ? `<text x="320" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#065F46">หมวด: ${escapeXml(newCat)}</text>` : ''}
      ${newAccount ? `<text x="320" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#065F46">บัญชี: ${escapeXml(newAccount)}</text>` : ''}
    </g>

    <!-- Bottom Status Badge -->
    <g transform="translate(50, 380)">
      <rect x="0" y="0" width="500" height="48" rx="12" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1" />
      <text x="250" y="30" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="bold" fill="#166534" text-anchor="middle">✅ อัปเดตข้อมูลใน Google Sheets เรียบร้อยแล้ว</text>
    </g>

    <text x="300" y="450" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#9CA3AF" text-anchor="middle">DevMus Accounting Bot • Single Row In-Place Update</text>
  </svg>
  `;
}

/**
 * Generate Balance Summary Card SVG (2 Clear Sections)
 * ส่วนที่ 1: รายการวันนี้ + สรุปยอด
 * ส่วนที่ 2: ยอดคงเหลือแต่ละบัญชี + ยอดรวมทุกบัญชี
 */
function createBalanceSummarySvg(summary) {
  const dateStr = summary.formattedDate || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const sheetName = summary.summarySheet || 'BotDashboard';
  const balance = summary.balance || 0;
  const balanceColor = balance >= 0 ? '#10B981' : '#EF4444';

  const todayItems = summary.todayItems || [];
  let todayItemsSvg = '';
  if (todayItems.length > 0) {
    const displayItems = todayItems.slice(0, 3);
    todayItemsSvg = displayItems.map((item, idx) => {
      const isInc = item.type === 'รายรับ';
      const sign = isInc ? '+' : '-';
      const color = isInc ? '#059669' : '#DC2626';
      const y = idx * 24 + 20;
      return `
        <text x="15" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#374151">• ${escapeXml(item.item)}</text>
        <text x="475" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="${color}" text-anchor="end">${sign}${escapeXml(formatNum(item.amount))} ฿</text>
      `;
    }).join('\n');
  } else {
    todayItemsSvg = `<text x="245" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#9CA3AF" text-anchor="middle">ยังไม่มีรายการวันนี้</text>`;
  }

  const accountBalances = summary.accountBalances || [];
  let accountRowsSvg = '';
  if (accountBalances.length > 0) {
    const rows = accountBalances.slice(0, 6);
    accountRowsSvg = rows.map((acc, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = col === 0 ? 20 : 260;
      const y = row * 26 + 32;
      return `
        <text x="${x}" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#4B5563">🏦 ${escapeXml(acc.name)}:</text>
        <text x="${x + 215}" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#111827" text-anchor="end">${escapeXml(formatNum(acc.amount))} ฿</text>
      `;
    }).join('\n');
  } else {
    accountRowsSvg = `<text x="245" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#9CA3AF" text-anchor="middle">ไม่มีข้อมูลยอดแยกบัญชี</text>`;
  }

  return `
  <svg width="600" height="740" viewBox="0 0 600 740" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="summaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E3A8A" />
        <stop offset="100%" stop-color="#2563EB" />
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.10" />
      </filter>
    </defs>

    <rect width="600" height="740" fill="#F3F4F6" />
    <rect x="25" y="20" width="550" height="700" rx="20" fill="#FFFFFF" filter="url(#shadow)" />

    <!-- Top Banner -->
    <rect x="25" y="20" width="550" height="75" rx="20" fill="url(#summaryGrad)" />
    <rect x="25" y="75" width="550" height="20" fill="url(#summaryGrad)" />
    
    <text x="50" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">📊 สรุปยอดการเงิน</text>
    <text x="50" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#BFDBFE">📅 ยอดประจำวันที่ ${escapeXml(dateStr)} | 📋 ข้อมูลจากชีต: ${escapeXml(sheetName)}</text>
    <text x="540" y="68" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="end" fill="#FFFFFF">🪙</text>

    <!-- ========================================== -->
    <!-- ส่วนที่ 1: รายการ + สรุปยอด -->
    <!-- ========================================== -->
    <g transform="translate(50, 110)">
      <!-- Section 1 Header -->
      <rect x="0" y="0" width="500" height="32" rx="8" fill="#F1F5F9" />
      <text x="15" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#1E293B">📝 ส่วนที่ 1: รายการวันนี้ &amp; ยอดสรุป</text>

      <!-- Today Items Container -->
      <rect x="0" y="40" width="500" height="85" rx="10" fill="#FAFAFA" stroke="#E2E8F0" stroke-width="1" />
      <g transform="translate(5, 45)">
        ${todayItemsSvg}
      </g>

      <!-- 4 Stats Cards (Daily Income, Daily Expense, Monthly Income, Monthly Expense) -->
      <g transform="translate(0, 135)">
        <!-- Today Income -->
        <rect x="0" y="0" width="240" height="60" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1" />
        <text x="15" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#059669">💸 รายรับวันนี้</text>
        <text x="15" y="47" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="bold" fill="#047857">+${escapeXml(formatNum(summary.dailyIncome))} ฿</text>

        <!-- Today Expense -->
        <rect x="260" y="0" width="240" height="60" rx="10" fill="#FEF2F2" stroke="#FECACA" stroke-width="1" />
        <text x="15" y="22" transform="translate(260, 0)" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#DC2626">🛍️ รายจ่ายวันนี้</text>
        <text x="15" y="47" transform="translate(260, 0)" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="bold" fill="#B91C1C">-${escapeXml(formatNum(summary.dailyExpense))} ฿</text>

        <!-- Monthly Income -->
        <rect x="0" y="70" width="240" height="60" rx="10" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1" />
        <text x="15" y="22" transform="translate(0, 70)" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#16A34A">💰 รายรับเดือนนี้</text>
        <text x="15" y="47" transform="translate(0, 70)" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="bold" fill="#15803D">+${escapeXml(formatNum(summary.monthlyIncome))} ฿</text>

        <!-- Monthly Expense -->
        <rect x="260" y="70" width="240" height="60" rx="10" fill="#FFF1F2" stroke="#FFE4E6" stroke-width="1" />
        <text x="15" y="22" transform="translate(260, 70)" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#E11D48">🛒 รายจ่ายเดือนนี้</text>
        <text x="15" y="47" transform="translate(260, 70)" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="bold" fill="#BE123C">-${escapeXml(formatNum(summary.monthlyExpense))} ฿</text>
      </g>
    </g>

    <!-- Divider Line Between Section 1 and Section 2 -->
    <line x1="50" y1="390" x2="550" y2="390" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6,4" />

    <!-- ========================================== -->
    <!-- ส่วนที่ 2: ยอดคงเหลือแต่ละบัญชี -->
    <!-- ========================================== -->
    <g transform="translate(50, 410)">
      <!-- Section 2 Header -->
      <rect x="0" y="0" width="500" height="32" rx="8" fill="#F8FAFC" />
      <text x="15" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#1E293B">🏦 ส่วนที่ 2: ยอดคงเหลือแต่ละบัญชี</text>

      <!-- Account List Container -->
      <rect x="0" y="40" width="500" height="120" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" />
      <g transform="translate(5, 45)">
        ${accountRowsSvg}
      </g>

      <!-- Total Net Balance Box (Prominent) -->
      <g transform="translate(0, 175)">
        <rect x="0" y="0" width="500" height="75" rx="14" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5" />
        <text x="20" y="28" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#475569">🪙 ยอดรวมทุกบัญชี</text>
        <text x="20" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="${balanceColor}">${escapeXml(formatNum(balance))} บาท</text>
      </g>
    </g>

    <!-- Footer -->
    <text x="300" y="700" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#9CA3AF" text-anchor="middle">DevMus Accounting Bot • ข้อมูลอัปเดตอัตโนมัติจาก Google Sheets</text>
  </svg>
  `;
}

/**
 * Generate Investment Card SVG
 */
function createInvestmentSvg(data) {
  const isBuy = data.action === 'ซื้อ';
  const color = isBuy ? '#3B82F6' : '#F59E0B';
  const title = isBuy ? 'บันทึกซื้อสินทรัพย์' : 'บันทึกขายสินทรัพย์';

  return `
  <svg width="600" height="380" viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="380" fill="#F3F4F6" />
    <rect x="25" y="25" width="550" height="330" rx="20" fill="#FFFFFF" />
    <rect x="25" y="25" width="550" height="80" rx="20" fill="${color}" />
    <rect x="25" y="80" width="550" height="25" fill="${color}" />
    
    <text x="50" y="65" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">📈 ${escapeXml(title)}: ${escapeXml(data.assetName)}</text>
    <text x="50" y="90" font-family="system-ui, sans-serif" font-size="14" fill="#FFFFFF">ประเภท: ${escapeXml(data.assetType || 'สินทรัพย์')}</text>

    <g transform="translate(50, 130)">
      <text x="20" y="30" font-family="system-ui, sans-serif" font-size="15" fill="#6B7280">📦 จำนวน</text>
      <text x="20" y="60" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#111827">${escapeXml(data.quantity || 0)}</text>

      <text x="270" y="30" font-family="system-ui, sans-serif" font-size="15" fill="#6B7280">💲 ราคาต่อหน่วย</text>
      <text x="270" y="60" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#111827">${escapeXml(formatNum(data.pricePerUnit))} ฿</text>

      <rect x="0" y="90" width="500" height="70" rx="12" fill="#F3F4F6" />
      <text x="20" y="115" font-family="system-ui, sans-serif" font-size="13" fill="#6B7280">💵 ยอดรวมทั้งหมด</text>
      <text x="20" y="145" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="${color}">${escapeXml(formatNum(data.totalAmount))} บาท</text>
    </g>

    <text x="300" y="335" font-family="system-ui, sans-serif" font-size="12" fill="#9CA3AF" text-anchor="middle">✓ บันทึกลงแถบการลงทุนเรียบร้อยแล้ว</text>
  </svg>
  `;
}

/**
 * Render SVG into PNG Buffer using Sharp
 */
async function renderSvgToPng(svgString) {
  return await sharp(Buffer.from(svgString))
    .png({ quality: 90 })
    .toBuffer();
}

module.exports = {
  createTransactionSvg,
  createBalanceSummarySvg,
  createEditConfirmationSvg,
  createInvestmentSvg,
  renderSvgToPng
};
