const { kv } = require('@vercel/kv');
const crypto = require('crypto');

const SECRET_SIGNING_KEY = process.env.SECRET_SIGNING_KEY || 'apex-secret-2024';

function verifySignature(key, timestamp, signature) {
  const data = key + timestamp + SECRET_SIGNING_KEY;
  const expected = crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  return expected === signature;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ valid: false, error: 'Thiếu token' });
  }
  
  try {
    const keyData = await kv.get(`key:${token}`);
    
    if (!keyData) {
      return res.status(404).json({ valid: false, error: 'Key không tồn tại hoặc đã hết hạn' });
    }
    
    const now = Date.now();
    
    if (now > keyData.expiresAt) {
      await kv.del(`key:${token}`);
      return res.status(401).json({ valid: false, error: 'Key đã hết hạn' });
    }
    
    if (!verifySignature(keyData.key, keyData.createdAt, keyData.signature)) {
      return res.status(403).json({ valid: false, error: 'Chữ ký không hợp lệ' });
    }
    
    return res.status(200).json({
      valid: true,
      key: keyData.key,
      expiresAt: keyData.expiresAt,
      status: keyData.status
    });
    
  } catch (error) {
    console.error('Lỗi:', error);
    return res.status(500).json({ valid: false, error: 'Lỗi server' });
  }
};
