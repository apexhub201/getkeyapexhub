const { kv } = require('@vercel/kv');
const crypto = require('crypto');

// ===== CONFIG =====
const EXPIRY_MINUTES = 5; // Test 5 phút. OK đổi thành 1440
const SECRET_SIGNING_KEY = process.env.SECRET_SIGNING_KEY || 'apex-secret-2024';
// ==================

function createSignature(key, timestamp) {
  const data = key + timestamp + SECRET_SIGNING_KEY;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

function generateKey() {
  const randomChars = 'qptoeugjwmxnalkjf¡¿\'-:;₫&@9275023#%*^+€¥$_|\\[]{}bcz';
  let randomPart = '';
  for (let i = 0; i < 15; i++) {
    randomPart += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  
  const positions = ['start', 'middle', 'end'];
  const apexPosition = positions[Math.floor(Math.random() * positions.length)];
  
  let key;
  switch(apexPosition) {
    case 'start':
      key = `Free_apex${randomPart}`;
      break;
    case 'middle':
      const mid = Math.floor(randomPart.length / 2);
      key = `Free_${randomPart.slice(0, mid)}apex${randomPart.slice(mid)}`;
      break;
    case 'end':
      key = `Free_${randomPart}apex`;
      break;
  }
  
  return key;
}

// Rate limit bằng Vercel KV
async function checkRateLimit(ip) {
  const key = `ratelimit:${ip}`;
  const count = await kv.get(key) || 0;
  
  if (count >= 3) {
    return false;
  }
  
  await kv.set(key, count + 1, { ex: 86400 }); // Hết hạn sau 24h
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  
  // Rate limit
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({ error: 'Quá giới hạn! Tối đa 3 key/24h.' });
  }
  
  try {
    const key = generateKey();
    const timestamp = Date.now();
    const expiryTime = timestamp + (EXPIRY_MINUTES * 60 * 1000);
    const signature = createSignature(key, timestamp);
    const token = crypto.randomBytes(16).toString('hex');
    
    // Lưu vào Vercel KV
    await kv.set(`key:${token}`, {
      key: key,
      signature: signature,
      createdAt: timestamp,
      expiresAt: expiryTime,
      status: 'active'
    }, { ex: EXPIRY_MINUTES * 60 }); // Tự động xóa khi hết hạn
    
    return res.status(200).json({
      success: true,
      token: token,
      key: key,
      signature: signature,
      expiresAt: expiryTime,
      expiresIn: EXPIRY_MINUTES + ' phút'
    });
    
  } catch (error) {
    console.error('Lỗi:', error);
    return res.status(500).json({ error: 'Lỗi server' });
  }
};
