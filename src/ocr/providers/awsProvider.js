/**
 * AWS Textract OCR Provider
 * แม่นยำสูง รองรับเอกสารหลายรูปแบบ
 * ต้องตั้งค่า: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */

const { TextractClient, DetectDocumentTextCommand, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');

function getClient() {
  return new TextractClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

/**
 * รู้จำข้อความจากภาพด้วย AWS Textract
 * @param {Buffer|string} imageInput - Buffer ของภาพ
 * @returns {Object} ผลลัพธ์จาก Textract
 */
async function recognize(imageInput) {
  console.log('[AWS Textract] Processing image...');

  const client = getClient();

  // แปลงเป็น Buffer ถ้าเป็น string path
  let imageBytes;
  if (typeof imageInput === 'string') {
    const fs = require('fs');
    imageBytes = fs.readFileSync(imageInput);
  } else {
    imageBytes = imageInput;
  }

  // ใช้ AnalyzeDocument สำหรับใบเสร็จ (ดีกว่า DetectDocumentText)
  const command = new AnalyzeDocumentCommand({
    Document: { Bytes: imageBytes },
    FeatureTypes: ['FORMS', 'TABLES']
  });

  const response = await client.send(command);
  const blocks = response.Blocks || [];

  // รวบรวม LINE blocks เป็น text
  const lines = blocks
    .filter(b => b.BlockType === 'LINE')
    .map(b => b.Text || '')
    .filter(Boolean);

  const text = lines.join('\n');

  // ดึง key-value pairs จาก FORMS
  const keyValuePairs = {};
  const keyBlocks = blocks.filter(b => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes?.includes('KEY'));

  for (const keyBlock of keyBlocks) {
    const keyText = getTextFromBlock(keyBlock, blocks);
    const valueBlock = findValueBlock(keyBlock, blocks);
    if (valueBlock) {
      const valueText = getTextFromBlock(valueBlock, blocks);
      keyValuePairs[keyText] = valueText;
    }
  }

  console.log('[AWS Textract] Done. Lines found:', lines.length);

  return { text, keyValuePairs, raw: response };
}

function getTextFromBlock(block, blocks) {
  if (!block.Relationships) return '';
  const childIds = block.Relationships
    .filter(r => r.Type === 'CHILD')
    .flatMap(r => r.Ids || []);
  return childIds
    .map(id => blocks.find(b => b.Id === id))
    .filter(b => b && b.BlockType === 'WORD')
    .map(b => b.Text || '')
    .join(' ');
}

function findValueBlock(keyBlock, blocks) {
  const valueRelation = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
  if (!valueRelation) return null;
  return blocks.find(b => b.Id === valueRelation.Ids?.[0]);
}

module.exports = { recognize };
