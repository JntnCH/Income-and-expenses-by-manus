/**
 * APPMAN OCR Provider (ไทย)
 * ความแม่นยำสูงถึง 98% รองรับภาษาไทย-อังกฤษ
 * สมัครได้ที่: https://www.appman.co.th
 * ต้องตั้งค่า: APPMAN_API_KEY, APPMAN_API_URL
 */

const axios = require('axios');
const FormData = require('form-data');

/**
 * รู้จำเอกสารด้วย APPMAN OCR
 * @param {Buffer|string} imageInput - Buffer หรือ path ของไฟล์ภาพ
 * @returns {Object} ผลลัพธ์จาก APPMAN OCR API
 */
async function recognize(imageInput) {
  const apiKey = process.env.APPMAN_API_KEY;
  const apiUrl = process.env.APPMAN_API_URL || 'https://api.appman.co.th/ocr/v1';
  if (!apiKey) throw new Error('APPMAN_API_KEY is not set in environment variables');

  console.log('[APPMAN OCR] Processing image...');

  const form = new FormData();

  if (Buffer.isBuffer(imageInput)) {
    form.append('file', imageInput, { filename: 'image.jpg', contentType: 'image/jpeg' });
  } else {
    const fs = require('fs');
    form.append('file', fs.createReadStream(imageInput));
  }

  const response = await axios.post(`${apiUrl}/receipt`, form, {
    headers: {
      ...form.getHeaders(),
      'Authorization': `Bearer ${apiKey}`
    }
  });

  console.log('[APPMAN OCR] Done.');
  return response.data;
}

module.exports = { recognize };
