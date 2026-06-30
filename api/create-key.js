const crypto = require('crypto');

// ===== CONFIG =====
const EXPIRY_MINUTES = 5; // Test 5 phút. OK đổi: 1440
const SECRET_KEY = process.env.SECRET_SIGNING_KEY || 'apex-hub-ultra-secret-2024';
const MAX_KEYS_PER_IP = 1; // Mỗi IP chỉ 1 key
// ==================

// Lưu trong memory của Vercel (mất khi deploy lại)
const keyStore = new Map();
const ipStore = new Map();

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
    case 'start': key = `Free_apex${randomPart}`; break;
    case 'middle':
      const mid = Math.floor(randomPart.length / 2);
      key = `Free_${randomPart.slice(0, mid)}apex${randomPart.slice(mid)}`;
      break;
    case 'end': key = `Free_${randomPart}apex`; break;
  }
  return key;
}

function createSignature(key, token, timestamp) {
  const data = `${key}:${token}:${timestamp}:${SECRET_KEY}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// Dọn dẹp key hết hạn mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of keyStore) {
    if (now > data.expiresAt) {
      keyStore.delete(token);
    }
  }
  for (const [ip, data] of ipStore) {
    if (now > data.resetAt) {
      ipStore.delete(ip);
    }
  }
}, 300000);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  
  // Lấy IP thật
  const ip = req.headers['x-real-ip'] || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.socket.remoteAddress || 
             'unknown';
  
  const userAgent = req.headers['user-agent'] || 'unknown';
  const timestamp = Date.now();
  
  // ===== BẢO VỆ 1: Kiểm tra IP =====
  const ipData = ipStore.get(ip);
  const now = Date.now();
  
  if (ipData) {
    if (now < ipData.resetAt) {
      return res.status(429).json({
        success: false,
        error: 'Bạn đã tạo key rồi! Vui lòng đợi key cũ hết hạn.',
        retryAfter: Math.ceil((ipData.resetAt - now) / 60000) + ' phút'
      });
    } else {
      ipStore.delete(ip);
    }
  }
  
  // ===== BẢO VỆ 2: Tạo token + key + chữ ký =====
  const key = generateKey();
  const token = crypto.randomBytes(24).toString('hex');
  const signature = createSignature(key, token, timestamp);
  const expiresAt = timestamp + (EXPIRY_MINUTES * 60 * 1000);
  
  // Lưu vào store
  const keyData = {
    key: key,
    token: token,
    signature: signature,
    ip: ip,
    userAgent: userAgent.substring(0, 100),
    createdAt: timestamp,
    expiresAt: expiresAt,
    status: 'active'
  };
  
  keyStore.set(token, keyData);
  
  // Lưu IP
  ipStore.set(ip, {
    token: token,
    resetAt: expiresAt
  });
  
  console.log(`✅ Key created | IP: ${ip} | Token: ${token.substring(0, 8)}... | Expires: ${new Date(expiresAt)}`);
  
  // ===== TRẢ VỀ CLIENT =====
  return res.status(200).json({
    success: true,
    token: token,
    key: key,
    signature: signature,
    expiresAt: expiresAt,
    expiresInMin: EXPIRY_MINUTES
  });
};
