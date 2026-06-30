const admin = require('firebase-admin');

// Khởi tạo Firebase (chỉ làm 1 lần)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

// Secret key để tạo chữ ký (chỉ server biết)
const SECRET_SIGNING_KEY = process.env.SECRET_SIGNING_KEY || 'apex-hub-secret-2024';

// Hàm tạo chữ ký SHA256
function createSignature(key, timestamp) {
  const crypto = require('crypto');
  const data = key + timestamp + SECRET_SIGNING_KEY;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// Hàm sinh key (CHỈ SERVER BIẾT)
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

// Rate limiting đơn giản
const ipRequests = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 giờ
  const maxRequests = 3; // Tối đa 3 key/24h
  
  if (!ipRequests.has(ip)) {
    ipRequests.set(ip, []);
  }
  
  const requests = ipRequests.get(ip).filter(time => now - time < windowMs);
  ipRequests.set(ip, requests);
  
  return requests.length < maxRequests;
}

function addRequest(ip) {
  const requests = ipRequests.get(ip) || [];
  requests.push(Date.now());
  ipRequests.set(ip, requests);
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Lấy IP và User-Agent
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Rate limiting
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Max 3 keys per 24 hours.',
      retryAfter: '24 hours'
    });
  }
  
  try {
    // Sinh key
    const key = generateKey();
    const timestamp = Date.now();
    const expiryTime = timestamp + (24 * 60 * 60 * 1000); // 24 giờ
    const signature = createSignature(key, timestamp);
    
    // Tạo token
    const token = require('crypto').randomBytes(16).toString('hex');
    
    // Lưu vào Firestore
    const keyDoc = {
      key: key,
      token: token,
      signature: signature,
      createdAt: admin.firestore.Timestamp.fromMillis(timestamp),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiryTime),
      used: false,
      ip: ip,
      userAgent: userAgent.substring(0, 200),
      status: 'active'
    };
    
    await db.collection('keys').doc(token).set(keyDoc);
    
    // Ghi nhận request
    addRequest(ip);
    
    // Trả về cho client
    return res.status(200).json({
      success: true,
      token: token,
      key: key,
      signature: signature,
      expiresAt: expiryTime,
      expiresIn: '24 hours'
    });
    
  } catch (error) {
    console.error('Error creating key:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
