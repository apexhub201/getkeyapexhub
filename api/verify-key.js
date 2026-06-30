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

function verifySignature(key, timestamp, signature) {
  const crypto = require('crypto');
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
    return res.status(400).json({ valid: false, error: 'Missing token' });
  }
  
  try {
    const doc = await db.collection('keys').doc(token).get();
    
    if (!doc.exists) {
      return res.status(404).json({ valid: false, error: 'Key not found' });
    }
    
    const keyDoc = doc.data();
    const now = Date.now();
    
    if (now > keyDoc.expiresAt.toMillis()) {
      await doc.ref.update({ status: 'expired' });
      return res.status(401).json({ valid: false, error: 'Key expired' });
    }
    
    if (!verifySignature(keyDoc.key, keyDoc.createdAt.toMillis(), keyDoc.signature)) {
      return res.status(403).json({ valid: false, error: 'Invalid signature' });
    }
    
    return res.status(200).json({
      valid: true,
      key: keyDoc.key,
      expiresAt: keyDoc.expiresAt.toMillis(),
      status: keyDoc.status
    });
    
  } catch (error) {
    console.error('Error verifying key:', error);
    return res.status(500).json({ valid: false, error: 'Internal server error' });
  }
};
