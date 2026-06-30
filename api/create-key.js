export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const chars = 'qptoeugjwmxnalkjf¡¿\'-:;₫&@9275023#%*^+€¥$_|\\[]{}bcz';
  let r = '';
  for (let i = 0; i < 15; i++) r += chars[Math.floor(Math.random() * chars.length)];
  
  const pos = Math.floor(Math.random() * 3);
  let key;
  if (pos === 0) key = 'Free_apex' + r;
  else if (pos === 1) { const m = Math.floor(r.length/2); key = 'Free_' + r.slice(0,m) + 'apex' + r.slice(m); }
  else key = 'Free_' + r + 'apex';

  return res.status(200).json({
    success: true,
    key: key,
    expiresAt: Date.now() + 300000,
    expiresInMin: 5
  });
}
