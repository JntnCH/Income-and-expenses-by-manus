/**
 * SpaceOCR Provider (ไทย)
 * เชี่ยวชาญสลิปโอนเงินธนาคารไทย
 * สมัครได้ที่: https://spaceocr.com
 * ต้องตั้งค่า: SPACEOCR_API_KEY
 */

const axios = require('axios');
const FormData = require('form-data');

const SPACEOCR_URL = 'https://api.spaceocr.com/v1/recognize';

/**
 * รู้จำสลิปธนาคารด้วย SpaceOCR
 * @param {Buffer|string} imageInput - Buffer หรือ path ของไฟล์ภาพ
 * @returns {Object} ผลลัพธ์จาก SpaceOCR API
 */
async function recognize(imageInput) {
  const apiKey = process.env.SPACEOCR_API_KEY;
  if (!apiKey) throw new Error('SPACEOCR_API_KEY is not set in environment variables');

  console.log('[SpaceOCR] Processing image...');

  const form = new FormData();

  if (Buffer.isBuffer(imageInput)) {
    form.append('file', imageInput, { filename: 'slip.jpg', contentType: 'image/jpeg' });
  } else {
    const fs = require('fs');
    form.append('file', fs.createReadStream(imageInput));
  }

  form.append('apikey', apiKey);
  form.append('language', 'tha'); // ภาษาไทย

  const response = await axios.post(SPACEOCR_URL, form, {
    headers: { ...form.getHeaders() }
  });

  console.log('[SpaceOCR] Done. Status:', response.data?.status);
  return response.data;
}

module.exports = { recognize };
