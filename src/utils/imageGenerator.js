/**
 * Image Generator
 * ใช้ Puppeteer แปลง HTML เป็นรูปภาพ PNG
 * 
 * ติดตั้ง: npm install puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const RECEIPTS_DIR = path.join(__dirname, '../public/receipts');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

let browserInstance = null;

/**
 * เริ่มต้น Browser (reuse ได้)
 */
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browserInstance;
}

/**
 * สร้างรูปภาพสลิปจาก HTML
 * @param {string} html - HTML content
 * @param {string} filename - ชื่อไฟล์ (ไม่ต้องมี .png)
 * @returns {Promise<string>} พาธไฟล์รูปภาพ
 */
async function generateImage(html, filename) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 440, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

    // รอให้ font โหลดเสร็จ
    await page.waitForTimeout(1000);

    // หาขนาดจริงของเนื้อหา
    const bodyHandle = await page.$('body');
    const { width, height } = await bodyHandle.boundingBox();
    await bodyHandle.dispose();

    const outputPath = path.join(RECEIPTS_DIR, `${filename}.png`);

    await page.screenshot({
      path: outputPath,
      clip: { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height) },
      type: 'png'
    });

    return outputPath;
  } finally {
    await page.close();
  }
}

/**
 * ลบไฟล์รูปภาพเก่า (cleanup)
 */
function cleanupOldReceipts(maxAgeMs = 3600000) { // 1 ชั่วโมง
  try {
    const files = fs.readdirSync(RECEIPTS_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(RECEIPTS_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[CLEANUP] ลบไฟล์เก่า: ${file}`);
      }
    }
  } catch (err) {
    console.error('[CLEANUP ERROR]', err.message);
  }
}

/**
 * ปิด Browser (เรียกตอน shutdown)
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  generateImage,
  cleanupOldReceipts,
  closeBrowser,
  RECEIPTS_DIR
};
