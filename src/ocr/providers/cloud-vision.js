const vision = require('@google-cloud/vision');
const { parsePrivateKey } = require('../../utils/credentialsParser');

let client;

try {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKeyRaw) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }

  const privateKey = parsePrivateKey(privateKeyRaw);

  client = new vision.ImageAnnotatorClient({
    credentials: {
      client_email: email,
      private_key: privateKey
    }
  });
} catch (error) {
  console.error('[Vision] Failed to initialize client:', error.message);
}

/**
 * Recognize text from image using Google Cloud Vision
 * Supports both Buffer and File Path inputs
 */
async function recognize(imageInput) {
  try {
    if (!client) {
      throw new Error('[Vision] Client not initialized - check credentials');
    }

    // Support both Buffer and File Path
    const imagePayload = typeof imageInput === 'string'
      ? { source: { filename: imageInput } }
      : { content: imageInput };

    const [result] = await client.textDetection({ image: imagePayload });
    const detections = result.textAnnotations;

    if (detections && detections.length > 0) {
      return detections[0].description;
    }
    return '';
  } catch (error) {
    console.error('[Vision] OCR Error:', error.message);
    throw error;
  }
}

module.exports = { recognize };
