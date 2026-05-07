/**
 * iApp Technology OCR Provider (ไทย)
 * เชี่ยวชาญใบเสร็จไทย ความแม่นยำสูง
 * สมัครได้ที่: https://iapp.co.th
 * ต้องตั้งค่า: IAPP_API_KEY
 */

const axios = require('axios');
const FormData = require('form-data');

const IAPP_RECEIPT_URL = 'https://api.iapp.co.th/ocr/v3/receipt';
const IAPP_RECEIPT_BASE64_URL = 'https://api.iapp.co.th/ocr/v3/receipt/base64';

/**
 * รู้จำใบเสร็จด้วย iApp Technology OCR
 * @param {Buffer|string} imageInput - Buffer หรือ path ของไฟล์ภาพ
 * @returns {Object} ผลลัพธ์จาก iApp OCR API
 */
async function recognize(imageInput) {
  const apiKey = process.env.IAPP_API_KEY;
  if (!apiKey) throw new Error('IAPP_API_KEY is not set in environment variables');

  console.log('[iApp OCR] Processing image...');

  let response;

  if (Buffer.isBuffer(imageInput)) {
    // ส่งเป็น Base64
    const base64String = imageInput.toString('base64');
    response = await axios.post(
      IAPP_RECEIPT_BASE64_URL,
      { base64_string: base64String, return_ocr: true },
      { headers: { apikey: apiKey, 'Content-Type': 'application/json' } }
    );
  } else {
    // ส่งเป็น multipart/form-data (file path)
    const fs = require('fs');
    const form = new FormData();
    form.append('file', fs.createReadStream(imageInput));
    form.append('return_ocr', 'true');

    response = await axios.post(IAPP_RECEIPT_URL, form, {
      headers: { ...form.getHeaders(), apikey: apiKey }
    });
  }

  console.log('[iApp OCR] Done. Status:', response.data?.message);
  return response.data;
}

module.exports = { recognize };
