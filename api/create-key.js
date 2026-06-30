const admin = require('firebase-admin');

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
const SECRET_SIGNING_KEY = process.env.SECRET_SIGNING_KEY || 'apex-hub-secret-2024';

// ===== CONFIG: Đổi thời gian ở đây =====
const EXPIRY_MINUTES = 5; // Test: 5 phút. OK đổi thành: 1440 (24h)
// =====================================

function createSignature(key, timestamp) {
  const crypto = require('crypto');
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

// Rate limiting
const ipRequests = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const maxRequests = 3;
  
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Max 3 keys per 24 hours.',
      retryAfter: '24 hours'
    });
  }
  
  try {
    const key = generateKey();
    const timestamp = Date.now();
    const expiryTime = timestamp + (EXPIRY_MINUTES * 60 * 1000);
    const signature = createSignature(key, timestamp);
    
    const token = require('crypto').randomBytes(16).toString('hex');
    
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
    
    addRequest(ip);
    
    return res.status(200).json({
      success: true,
      token: token,
      key: key,
      signature: signature,
      expiresAt: expiryTime,
      expiresIn: EXPIRY_MINUTES + ' minutes'
    });
    
  } catch (error) {
    console.error('Error creating key:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
