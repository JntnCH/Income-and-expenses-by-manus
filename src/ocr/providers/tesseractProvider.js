/**
 * Tesseract OCR Provider
 * ฟรี ทำงานบน Server ไม่ต้องใช้ API Key
 * รองรับภาษาไทย + อังกฤษ
 */

const Tesseract = require('tesseract.js');

/**
 * รู้จำข้อความจากภาพด้วย Tesseract
 * @param {Buffer|string} imageInput - Buffer หรือ path ของไฟล์ภาพ
 * @returns {string} ข้อความที่รู้จำได้
 */
async function recognize(imageInput) {
  console.log('[Tesseract] Processing image...');

  const result = await Tesseract.recognize(imageInput, 'tha+eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[Tesseract] Progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  console.log('\n[Tesseract] Done. Confidence:', result.data.confidence);

  return {
    text: result.data.text,
    confidence: result.data.confidence,
    words: result.data.words?.map(w => ({ text: w.text, confidence: w.confidence })) || []
  };
}

module.exports = { recognize };
