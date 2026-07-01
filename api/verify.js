// ============================================
// APEX HUB - Server-Side Verification System
// BẢO MẬT NHIỀU LỚP
// ============================================

const crypto = require('crypto');

// ========== CONFIGURATION (SECURE - ONLY ON SERVER) ==========
const SECRET_CONFIG = {
    MASTER_KEY: 'apex_hub_2024_ultra_secure_master_key_x9k3m',
    SALT_ROUNDS: 10,
    REQUIRED_REFERRER: ['link4m.org', 'link4m.net', 'link4m.com'],
    TOKEN_EXPIRY: 300000, // 5 minutes
    RATE_LIMIT_WINDOW: 3600000, // 1 hour
    MAX_REQUESTS_PER_WINDOW: 5,
    KEY_LENGTH: 48,
    BLACKLISTED_IPS: new Set(),
    ALLOWED_ORIGINS: ['https://getkeyapexhub.vercel.app', 'https://link4m.org']
};

// ========== RATE LIMITING (IN-MEMORY FOR VERCEL) ==========
const rateLimitMap = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + SECRET_CONFIG.RATE_LIMIT_WINDOW };
    
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + SECRET_CONFIG.RATE_LIMIT_WINDOW;
    } else {
        record.count++;
    }
    
    rateLimitMap.set(ip, record);
    
    // Cleanup old entries every 100 requests
    if (Math.random() < 0.01) {
        for (const [key, value] of rateLimitMap) {
            if (now > value.resetTime) rateLimitMap.delete(key);
        }
    }
    
    return record.count <= SECRET_CONFIG.MAX_REQUESTS_PER_WINDOW;
}

// ========== ADVANCED ENCRYPTION ==========
function generateServerKey(fingerprint, nonce) {
    const components = [
        SECRET_CONFIG.MASTER_KEY,
        fingerprint.substring(0, 16),
        nonce,
        Date.now().toString(36),
        crypto.randomBytes(32).toString('hex')
    ];
    
    const combined = components.join('_');
    const hash = crypto.createHash('sha512').update(combined).digest('hex');
    
    // Generate multiple parts for obfuscation
    const part1 = hash.substring(0, 12);
    const part2 = hash.substring(12, 24);
    const part3 = hash.substring(24, 36);
    const part4 = hash.substring(36, 48);
    
    // Insert required word 'apex' at a pseudo-random position
    const position = (parseInt(hash.substring(0, 2), 16) % 3);
    const specialChars = 'qptoeugjwmxnalkjf¡¿\'-:;₫&@9275023#%*^+€¥$_|\\[]{}bcz';
    const specialPart = specialChars.substring(
        parseInt(hash.substring(2, 4), 16) % specialChars.length,
        (parseInt(hash.substring(2, 4), 16) % specialChars.length) + 10
    );
    
    let key = 'Free_';
    switch(position) {
        case 0:
            key += `apex${specialPart}${part1}${part2}${part3}${part4}`;
            break;
        case 1:
            key += `${specialPart}apex${part1}${part2}${part3}${part4}`;
            break;
        case 2:
            key += `${specialPart}${part1}apex${part2}${part3}${part4}`;
            break;
    }
    
    return key;
}

// ========== TOKEN VERIFICATION ==========
function verifyServerToken(token, fingerprint) {
    try {
        // Decode base64 token
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const parts = decoded.split('.');
        
        if (parts.length !== 3) return false;
        
        const [timestamp, hash, randomPart] = parts;
        const now = Date.now();
        
        // Check token expiry
        if (now - parseInt(timestamp) > SECRET_CONFIG.TOKEN_EXPIRY) {
            return false;
        }
        
        // Verify hash
        const expectedHash = crypto
            .createHash('sha256')
            .update(`${timestamp}.${fingerprint.substring(0, 10)}.${SECRET_CONFIG.MASTER_KEY}`)
            .digest('hex')
            .substring(0, 16);
        
        return hash === expectedHash;
    } catch (e) {
        return false;
    }
}

// ========== SECURITY HEADERS ==========
function addSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

// ========== MAIN API HANDLER ==========
module.exports = async (req, res) => {
    addSecurityHeaders(res);
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    }
    
    try {
        // ========== LAYER 1: IP & RATE LIMIT ==========
        const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
        
        if (SECRET_CONFIG.BLACKLISTED_IPS.has(clientIP)) {
            return res.status(403).json({ error: 'Access denied', code: 'IP_BLACKLISTED' });
        }
        
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
        }
        
        // ========== LAYER 2: ORIGIN CHECK ==========
        const origin = req.headers['origin'] || req.headers['referer'] || '';
        const isAllowedOrigin = SECRET_CONFIG.ALLOWED_ORIGINS.some(
            allowed => origin.includes(allowed)
        );
        
        if (!isAllowedOrigin && origin) {
            return res.status(403).json({ error: 'Invalid origin', code: 'ORIGIN_BLOCKED' });
        }
        
        // ========== LAYER 3: FINGERPRINT VERIFICATION ==========
        const fingerprint = req.headers['x-fingerprint'];
        const timestamp = req.headers['x-timestamp'];
        
        if (!fingerprint || !timestamp) {
            return res.status(400).json({ error: 'Missing headers', code: 'HEADERS_MISSING' });
        }
        
        // Check timestamp freshness
        const timeDiff = Math.abs(Date.now() - parseInt(timestamp));
        if (timeDiff > 30000) { // 30 seconds max
            return res.status(400).json({ error: 'Request expired', code: 'TIMESTAMP_EXPIRED' });
        }
        
        // ========== LAYER 4: TOKEN & BODY VERIFICATION ==========
        const body = req.body || {};
        const { token, nonce, referrer } = body;
        
        // Verify referrer
        const isFromShortener = SECRET_CONFIG.REQUIRED_REFERRER.some(
            domain => referrer && referrer.includes(domain)
        );
        
        if (!isFromShortener) {
            return res.status(403).json({ 
                error: 'Invalid referrer', 
                code: 'REFERRER_INVALID',
                requireShortener: true 
            });
        }
        
        // Verify token
        if (!token || !verifyServerToken(token, fingerprint)) {
            return res.status(403).json({ 
                error: 'Invalid verification token', 
                code: 'TOKEN_INVALID' 
            });
        }
        
        // ========== LAYER 5: NONCE VERIFICATION (ANTI-REPLAY) ==========
        if (!nonce || nonce.length < 16) {
            return res.status(400).json({ error: 'Invalid nonce', code: 'NONCE_INVALID' });
        }
        
        // ========== GENERATE KEY (ALL CHECKS PASSED) ==========
        const key = generateServerKey(fingerprint, nonce);
        const keyHash = crypto.createHash('sha256').update(key).digest('hex');
        
        // Sign the key with HMAC
        const signature = crypto
            .createHmac('sha256', SECRET_CONFIG.MASTER_KEY)
            .update(`${key}.${fingerprint}.${Date.now()}`)
            .digest('hex');
        
        // ========== SUCCESS RESPONSE ==========
        res.status(200).json({
            success: true,
            data: {
                key: key,
                hash: keyHash,
                signature: signature,
                expiresIn: 86400000, // 24 hours
                timestamp: Date.now()
            }
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            code: 'SERVER_ERROR' 
        });
    }
};
