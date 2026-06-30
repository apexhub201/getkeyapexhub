const crypto = require('crypto');

const SECRET_KEY = process.env.SECRET_SIGNING_KEY || 'apex-hub-ultra-secret-2024';

// Import từ create-key.js (trong Vercel, mỗi function chạy riêng)
// Nên dùng @vercel/kv hoặc Redis để share data
// Tạm thời dùng memory (sẽ mất khi deploy)

const keyStore = new Map(); // Sẽ trống khi gọi từ function khác!

function verifySignature(key, token, timestamp, signature) {
  const data = `${key}:${token}:${timestamp}:${SECRET_KEY}`;
  const expected = crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  return expected === signature;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, error: 'Method not allowed' });
  }
  
  const { token, key, signature } = req.body;
  
  if (!token || !key || !signature) {
    return res.status(400).json({ valid: false, error: 'Thiếu thông tin' });
  }
  
  // Verify chữ ký
  const now = Date.now();
  
  // Tìm key data (từ memory - SẼ KHÔNG HOẠT ĐỘNG nếu function khác instance)
  // Cần dùng @vercel/kv để share state
  return res.status(200).json({
    valid: true,
    message: 'Cần @vercel/kv để verify cross-function',
    key: key,
    verified: verifySignature(key, token, now - 60000, signature)
  });
};
