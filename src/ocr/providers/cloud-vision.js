const vision = require('@google-cloud/vision');

const client = new vision.ImageAnnotatorClient({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
  }
});

// เปลี่ยนชื่อฟังก์ชันเป็น recognize เพื่อให้รับกับคำสั่ง PROVIDERS[provider].recognize()
async function recognize(imageInput) {
  try {
    // รองรับทั้งแบบ Buffer และ File Path
    const imagePayload = typeof imageInput === 'string' ? { source: { filename: imageInput } } : { content: imageInput };
    
    const [result] = await client.textDetection({ image: imagePayload });
    const detections = result.textAnnotations;
    
    if (detections && detections.length > 0) {
      return detections[0].description; // ส่งข้อความดิบกลับไปให้ตัวเลือกแยกข้อความทำงานต่อ
    }
    return '';
  } catch (error) {
    console.error('Google Cloud Vision OCR Error:', error);
    throw error;
  }
}

module.exports = { recognize };
