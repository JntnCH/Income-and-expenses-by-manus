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
  const isIncome = data.type === 'รายรับ';
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
    
    <!-- Main Card Body -->
    <rect x="25" y="25" width="550" height="370" rx="20" fill="#FFFFFF" filter="url(#shadow)" />
    
    <!-- Top Header Banner -->
    <rect x="25" y="25" width="550" height="85" rx="20" fill="url(#headerGrad)" />
    <rect x="25" y="90" width="550" height="20" fill="url(#headerGrad)" />
    
    <!-- Header Text -->
    <text x="50" y="65" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">${escapeXml(title)}</text>
    <text x="50" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#E5E7EB">${escapeXml(dateStr)}</text>
    <text x="540" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="end" fill="#FFFFFF">${isIncome ? '💰' : '🛍️'}</text>

    <!-- Amount Display Box -->
    <rect x="50" y="125" width="500" height="75" rx="14" fill="${lightBg}" />
    <text x="75" y="152" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#6B7280" font-weight="600">ยอดเงิน</text>
    <text x="75" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="bold" fill="${primaryColor}">${escapeXml(amountStr)}</text>

    <!-- Details Grid -->
    <g transform="translate(50, 220)">
      <!-- Item -->
      <text x="20" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">📝 รายการ</text>
      <text x="20" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.item || 'ไม่ระบุ')}</text>

      <!-- Category -->
      <text x="270" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">📦 หมวดหมู่</text>
      <text x="270" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.category || 'ทั่วไป')}</text>

      <!-- Account -->
      <text x="20" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">💳 บัญชี</text>
      <text x="20" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.account || 'เงินสด')}</text>

      <!-- Recorder / Platform -->
      <text x="270" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#6B7280">👤 ผู้บันทึก / ช่องทาง</text>
      <text x="270" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#1F2937">${escapeXml(data.recorder || 'User')} (${escapeXml(data.platform || 'Dialogflow')})</text>
    </g>

    <!-- Bottom Footer Note -->
    <text x="300" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#9CA3AF" text-anchor="middle">✓ บันทึกลง Google Sheets เรียบร้อยแล้ว</text>
  </svg>
  `;
}

/**
 * Generate a Balance Summary Card SVG
 */
function createBalanceSummarySvg(summary) {
  const dateStr = summary.formattedDate || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const sheetName = summary.summarySheet || 'รายรับ-รายจ่าย';
  const balance = summary.balance || 0;
  const balanceColor = balance >= 0 ? '#10B981' : '#EF4444';

  let accountRowsSvg = '';
  if (summary.accountBalances && summary.accountBalances.length > 0) {
    const rows = summary.accountBalances.slice(0, 4);
    accountRowsSvg = rows.map((acc, index) => {
      const x = (index % 2) * 250 + 60;
      const y = Math.floor(index / 2) * 35 + 385;
      return `
        <text x="${x}" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#4B5563">🏦 ${escapeXml(acc.name)}:</text>
        <text x="${x + 220}" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#111827" text-anchor="end">${escapeXml(formatNum(acc.amount))} ฿</text>
      `;
    }).join('\n');
  } else {
    accountRowsSvg = `
      <text x="300" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#9CA3AF" text-anchor="middle">ไม่มียอดแยกบัญชี</text>
    `;
  }

  return `
  <svg width="600" height="520" viewBox="0 0 600 520" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="balanceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E3A8A" />
        <stop offset="100%" stop-color="#3B82F6" />
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.12" />
      </filter>
    </defs>

    <rect width="600" height="520" fill="#F3F4F6" rx="0" />
    
    <!-- Card Container -->
    <rect x="25" y="20" width="550" height="480" rx="20" fill="#FFFFFF" filter="url(#shadow)" />
    
    <!-- Header -->
    <rect x="25" y="20" width="550" height="85" rx="20" fill="url(#balanceGrad)" />
    <rect x="25" y="85" width="550" height="20" fill="url(#balanceGrad)" />
    
    <text x="50" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">📊 สรุปยอดรายรับ-รายจ่าย</text>
    <text x="50" y="82" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#93C5FD">📅 ${escapeXml(dateStr)} | ชีต: ${escapeXml(sheetName)}</text>
    <text x="540" y="70" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="end" fill="#FFFFFF">🪙</text>

    <!-- Balance Total Box -->
    <rect x="50" y="120" width="500" height="75" rx="14" fill="#F8FAFC" stroke="#E2E8F0" />
    <text x="75" y="147" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#64748B" font-weight="600">🪙 ยอดรวมคงเหลือสุทธิ</text>
    <text x="75" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="${balanceColor}">${escapeXml(formatNum(balance))} บาท</text>

    <!-- Daily & Monthly 4-Grid Stats -->
    <g transform="translate(50, 210)">
      <!-- Today Income -->
      <rect x="0" y="0" width="240" height="65" rx="10" fill="#ECFDF5" />
      <text x="15" y="25" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#059669">💸 รายรับวันนี้</text>
      <text x="15" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#047857">+${escapeXml(formatNum(summary.dailyIncome))} ฿</text>

      <!-- Today Expense -->
      <rect x="260" y="0" width="240" height="65" rx="10" fill="#FEF2F2" />
      <text x="275" y="25" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#DC2626">🛍️ รายจ่ายวันนี้</text>
      <text x="275" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#B91C1C">-${escapeXml(formatNum(summary.dailyExpense))} ฿</text>

      <!-- Monthly Income -->
      <rect x="0" y="75" width="240" height="65" rx="10" fill="#F0FDF4" />
      <text x="15" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#16A34A">💰 รายรับเดือนนี้</text>
      <text x="15" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#15803D">+${escapeXml(formatNum(summary.monthlyIncome))} ฿</text>

      <!-- Monthly Expense -->
      <rect x="260" y="75" width="240" height="65" rx="10" fill="#FFF1F2" />
      <text x="275" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#E11D48">🛒 รายจ่ายเดือนนี้</text>
      <text x="275" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#BE123C">-${escapeXml(formatNum(summary.monthlyExpense))} ฿</text>
    </g>

    <!-- Account Balances Header & List -->
    <text x="50" y="370" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#374151">🏦 ยอดเงินในแต่ละบัญชี</text>
    <line x1="50" y1="375" x2="550" y2="375" stroke="#E5E7EB" stroke-width="1" />
    ${accountRowsSvg}

    <!-- Footer -->
    <text x="300" y="480" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#9CA3AF" text-anchor="middle">DevMus Accounting Bot • ข้อมูลอัปเดตอัตโนมัติจาก Google Sheets</text>
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
  createInvestmentSvg,
  renderSvgToPng
};
