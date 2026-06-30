module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Tạo key
    const crypto = require('crypto');
    
    const randomChars = 'qptoeugjwmxnalkjf¡¿\'-:;₫&@9275023#%*^+€¥$_|\\[]{}bcz';
    let randomPart = '';
    for (let i = 0; i < 15; i++) {
        randomPart += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    
    const pos = Math.floor(Math.random() * 3);
    let key;
    if (pos === 0) {
        key = 'Free_apex' + randomPart;
    } else if (pos === 1) {
        const mid = Math.floor(randomPart.length / 2);
        key = 'Free_' + randomPart.slice(0, mid) + 'apex' + randomPart.slice(mid);
    } else {
        key = 'Free_' + randomPart + 'apex';
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 phút

    return res.status(200).json({
        success: true,
        token: token,
        key: key,
        expiresAt: expiresAt,
        expiresInMin: 5
    });
};
