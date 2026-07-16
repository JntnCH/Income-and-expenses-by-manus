/**
 * OCR Manager
 * จัดการการเลือกค่าย OCR และประมวลผลภาพสลิป/ใบเสร็จ
 * รองรับ: tesseract | aws | iapp | appman | spaceocr | google
 */

const tesseractProvider = require('./providers/tesseractProvider');
const awsProvider = require('./providers/awsProvider');
const iappProvider = require('./providers/iappProvider');
const appmanProvider = require('./providers/appmanProvider');
const spaceocrProvider = require('./providers/spaceocrProvider');
const cloudVisionProvider = require('./providers/cloud-vision'); // ➕ 1. เพิ่มการ Import Google Vision

const PROVIDERS = {
  tesseract: tesseractProvider,
  aws: awsProvider,
  iapp: iappProvider,
  appman: appmanProvider,
  spaceocr: spaceocrProvider,
  google: cloudVisionProvider,         // ➕ 2. ผูกคีย์ 'google' เข้ากับระบบ
  'cloud-vision': cloudVisionProvider   // รองรับกรณีพิมพ์แบบมีขีดใน YAML
};

/**
 * ประมวลผลภาพสลิป/ใบเสร็จด้วยค่าย OCR ที่เลือก
 * @param {Buffer|string} imageInput - Buffer ของภาพ หรือ path ของไฟล์
 * @param {string} providerName - ชื่อค่าย OCR (default จาก .env)
 * @returns {Object} ผลลัพธ์ OCR ที่ผ่านการ parse แล้ว
 */
async function processImage(imageInput, providerName = null) {
  const provider = providerName || process.env.OCR_PROVIDER || 'tesseract';

  if (!PROVIDERS[provider]) {
    throw new Error(`OCR provider "${provider}" ไม่รองรับ กรุณาเลือก: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  console.log(`[OCR] Using provider: ${provider}`);

  try {
    const rawResult = await PROVIDERS[provider].recognize(imageInput); // 💡 จะวิ่งไปเรียกฟังก์ชัน recognize() ของค่ายนั้นๆ
    const parsed = parseOCRResult(rawResult, provider);
    console.log(`[OCR] Parsed result:`, JSON.stringify(parsed));
    return parsed;
  } catch (error) {
    console.error(`[OCR ERROR] Provider "${provider}":`, error.message);
    throw error;
  }
}

/**
 * Parse ผลลัพธ์ OCR ให้เป็นรูปแบบมาตรฐาน
 * @returns {Object} { amount, item, category, date, raw }
 */
function parseOCRResult(rawResult, provider) {
  // iApp และ APPMAN ส่งข้อมูลที่ structured แล้ว
  if (provider === 'iapp' && rawResult.processed) {
    return {
      amount: rawResult.processed.grandTotal || rawResult.processed.totalCost || 0,
      item: rawResult.processed.issuerName || 'ใบเสร็จ',
      category: 'ทั่วไป',
      date: rawResult.processed.invoiceDate || null,
      invoiceId: rawResult.processed.invoiceID || null,
      items: rawResult.processed.items || [],
      raw: rawResult
    };
  }

  if (provider === 'appman' && rawResult.data) {
    return {
      amount: rawResult.data.total_amount || rawResult.data.amount || 0,
      item: rawResult.data.merchant_name || rawResult.data.store_name || 'ใบเสร็จ',
      category: 'ทั่วไป',
      date: rawResult.data.date || null,
      raw: rawResult
    };
  }

  // SpaceOCR ส่งข้อมูลสลิปธนาคาร
  if (provider === 'spaceocr' && rawResult.result) {
    return {
      amount: rawResult.result.amount || 0,
      item: rawResult.result.receiver_name || rawResult.result.description || 'โอนเงิน',
      category: 'โอนเงิน',
      date: rawResult.result.date || null,
      sender: rawResult.result.sender_name || null,
      receiver: rawResult.result.receiver_name || null,
      raw: rawResult
    };
  }

  // 📝 Tesseract, AWS และ Google Cloud Vision ส่งข้อมูลแบบข้อความดิบ (Raw Text)
  // ระบบจะไหลลงมาทำฟังก์ชัน extractFromText ด้านล่างนี้โดยอัตโนมัติครับ
  const text = typeof rawResult === 'string' ? rawResult : rawResult.text || rawResult.raw || '';
  return extractFromText(text, rawResult);
}

/**
 * ดึงข้อมูลสำคัญจาก raw OCR text (Tesseract / AWS / Google)
 */
function extractFromText(text, rawResult) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ดึงจำนวนเงิน - พัฒนาให้แม่นยำขึ้นสำหรับสลิปไทยและ Google Vision
  let amount = 0;
  
  // 1. ค้นหาบรรทัดที่มีคีย์เวิร์ดเกี่ยวกับจำนวนเงินก่อน
  const amountKeywords = ['ยอดเงิน', 'จำนวนเงิน', 'ยอดโอน', 'amount', 'total', 'grand total', 'sum'];
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (amountKeywords.some(kw => lowerLine.includes(kw))) {
      const match = line.match(/(\d[\d,]*\.?\d{0,2})/);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // 2. ถ้ายังไม่เจอ ใช้ Regex Patterns ที่ครอบคลุมมากขึ้น
  if (amount === 0) {
    const amountPatterns = [
      /(?:ยอด|รวม|total|amount|จำนวน|บาท|thb)[^\d]*(\d[\d,]*\.\d{2})/i, // เน้นทศนิยม 2 ตำแหน่งก่อน
      /(\d[\d,]*\.\d{2})\s*(?:บาท|THB|฿)/i,
      /(?:฿|THB)\s*(\d[\d,]*\.?\d*)/i,
      /(\d[\d,]*\.\d{2})/i
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }
  }

  // 3. ถ้ายังไม่เจอจริงๆ ลองหาตัวเลขที่น่าจะเป็นยอดเงิน (มักจะเป็นตัวเลขที่อยู่ท้ายๆ หรือเด่นๆ)
  if (amount === 0) {
    const allNumbers = text.match(/\d[\d,]*\.\d{2}/g) || []; // หาตัวเลขที่มีทศนิยม 2 ตำแหน่ง
    const nums = allNumbers.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => n > 0);
    if (nums.length > 0) {
      // สำหรับสลิปโอนเงิน ยอดเงินมักจะเป็นตัวเลขที่มากที่สุด (ยกเว้นเลขที่บัญชี)
      // แต่เพื่อความปลอดภัย เราจะตัดตัวเลขที่มากเกินไป (เช่น เลขที่บัญชี) ออก
      const plausibleAmounts = nums.filter(n => n < 1000000); // กรองเลขที่เกินล้านออกถ้าไม่ใช่รายการใหญ่จริง
      if (plausibleAmounts.length > 0) {
        amount = Math.max(...plausibleAmounts);
      }
    }
  }

  // ดึงชื่อร้าน/รายการ - ปรับปรุงให้ข้ามบรรทัดที่เป็นหัวข้อสลิปทั่วไป
  let item = 'ใบเสร็จ/สลิป';
  const noiseWords = ['โอนเงินสำเร็จ', 'success', 'slip', 'สลิป', 'บันทึก', 'รายการ', 'e-slip'];
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const isNoise = noiseWords.some(nw => lowerLine.includes(nw));
    const isDate = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/.test(line);
    const isNumber = /^\d+$/.test(line.replace(/[\s\-\,]/g, ''));
    
    if (line.length > 2 && line.length < 50 && !isNoise && !isDate && !isNumber) {
      item = line;
      break;
    }
  }

  // ดึงวันที่
  let date = null;
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
  const dateMatch = text.match(datePattern);
  if (dateMatch) date = dateMatch[1];

  return { amount, item, category: 'ทั่วไป', date, raw: rawResult };
}

/**
 * รายชื่อ OCR providers ที่รองรับ
 */
function getAvailableProviders() {
  return Object.keys(PROVIDERS)
    .filter(key => key !== 'cloud-vision') // ซ่อนตัวซ้ำตอนแสดงผลรายชื่อ
    .map(key => ({
      id: key,
      name: {
        tesseract: 'Tesseract (ฟรี, ทำงานบน Server)',
        aws: 'AWS Textract (แม่นยำสูง)',
        iapp: 'iApp Technology (ไทย, รองรับใบเสร็จไทย)',
        appman: 'APPMAN OCR (ไทย, ความแม่นยำ 98%)',
        spaceocr: 'SpaceOCR (ไทย, เชี่ยวชาญสลิปธนาคาร)',
        google: 'Google Cloud Vision API (แม่นยำสูงมาก, อ่านสลิปและภาษาไทยดีเยี่ยม)' // ➕ 3. เพิ่มคำอธิบายค่ายกูเกิล
      }[key] || key,
      active: (process.env.OCR_PROVIDER || 'tesseract') === key
    }));
}

module.exports = { processImage, getAvailableProviders };
