# Security Analysis

This document provides a comprehensive security analysis of the E2E Messenger application, including threat modeling, implemented measures, known limitations, and OWASP Top 10 coverage.

---

## Threat Model

### System Overview
```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client A  │◄───────►│   Server    │◄───────►│   Client B  │
│  (Browser)  │  WSS/   │  (Node.js)  │  WSS/   │  (Browser)  │
│             │  HTTPS  │  + SQLite   │  HTTPS  │             │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │                       │
       │    E2E Encrypted      │    E2E Encrypted      │
       │◄──────────────────────┼──────────────────────►│
       │   (Server can't read) │   (Server can't read) │
```

### Assets to Protect
| Asset | Sensitivity | Protection |
|-------|-------------|------------|
| Message content | HIGH | E2E encryption (AES-256-GCM) |
| File content | HIGH | E2E encryption (AES-256-GCM) ✅ |
| User passwords | HIGH | bcrypt hashing (never stored plaintext) |
| Private keys | HIGH | Never leave client device |
| JWT tokens | MEDIUM | Short expiry, rotation |
| User metadata | LOW | Username, email, timestamps |

### Attacker Profiles

#### 1. Network Eavesdropper (Passive)
**Capabilities:**
- Can intercept network traffic on LAN
- Cannot modify traffic

**What they CAN see:**
- ❌ Message content (E2E encrypted)
- ❌ Passwords (only hashes transmitted after HTTPS)
- ⚠️ Metadata: IP addresses, timing, message sizes
- ⚠️ Who is talking to whom (traffic analysis)

**What they CANNOT do:**
- Decrypt messages (no access to private keys)
- Impersonate users (no valid JWT)

#### 2. Malicious Server Operator
**Capabilities:**
- Full access to server and database

**What they CAN see:**
- ⚠️ Usernames, emails, timestamps
- ⚠️ Room membership
- ⚠️ Uploaded files (encrypted at rest recommended for production)
- ⚠️ Message ciphertext (but not plaintext)
- ❌ Message content (E2E encrypted)
- ❌ User passwords (only bcrypt hashes)

**What they CANNOT do:**
- Decrypt messages (private keys on clients only)
- Recover passwords from hashes (bcrypt is slow by design)

#### 3. Attacker with Stolen Credentials
**Capabilities:**
- Has valid JWT token or refresh token

**Impact if access token stolen:**
- Can impersonate user for 15 minutes
- Limited by short token expiry

**Impact if refresh token stolen:**
- Can generate new access tokens
- Mitigated by token rotation (old token invalidated)
- User can "logout all devices" to revoke

#### 4. Brute Force Attacker
**Capabilities:**
- Can attempt many login requests

**Mitigation:**
- Rate limiting: 5 attempts per 15 minutes
- bcrypt: ~100ms per hash attempt (slow)
- Account not locked (DoS prevention)

---

## Security Measures Implemented

### 1. Password Security

#### Hashing with bcrypt
```javascript
// 12 rounds = ~250ms per hash on modern hardware
const SALT_ROUNDS = 12;
const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
```

**Why bcrypt?**
- Designed for passwords (intentionally slow)
- Built-in salt (prevents rainbow tables)
- Configurable work factor (can increase over time)
- Resistant to GPU attacks

**Why 12 rounds?**
| Rounds | Time (approx) | Security |
|--------|---------------|----------|
| 10 | ~100ms | Minimum recommended |
| **12** | **~250ms** | **Good balance** |
| 14 | ~1s | High security, slow UX |

#### Password Requirements
```javascript
// backend/utils/validators.js
function validatePassword(password) {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, error: 'Password must contain letters' };
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain numbers' };
  }
  
  return { valid: true };
}
```

**Rationale:**
- 8+ characters: Prevents trivial passwords
- Letters + numbers: Increases entropy
- No special char requirement: Studies show it doesn't help much and frustrates users

### 2. JWT Token Security

#### Token Structure
```javascript
// Access Token (short-lived)
{
  userId: 123,
  username: 'alice',
  type: 'access',
  iat: 1699900000,
  exp: 1699900900  // 15 minutes
}

// Refresh Token (long-lived, stored in DB)
{
  userId: 123,
  type: 'refresh',
  iat: 1699900000,
  exp: 1700504900  // 7 days
}
```

#### Why Two Token Types?
| Token | Expiry | Storage | Purpose |
|-------|--------|---------|---------|
| Access | 15 min | Memory/localStorage | API authentication |
| Refresh | 7 days | Database + client | Get new access tokens |

**Security benefits:**
- Short access token limits damage if stolen
- Refresh token in DB allows revocation
- Rotation invalidates stolen refresh tokens

#### Token Verification
```javascript
// backend/middleware/auth.js
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Check token type
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 3. Rate Limiting

#### Authentication Endpoints
```javascript
// 5 attempts per 15 minutes per IP
const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

// Applied to sensitive routes
app.post('/api/auth/login', authRateLimiter, authController.login);
app.post('/api/auth/register', authRateLimiter, authController.register);
```

#### General API
```javascript
// 100 requests per 15 minutes per IP
const apiRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
});

app.use('/api', apiRateLimiter);
```

#### Response Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699901500
```

### 4. Input Validation & Sanitization

#### SQL Injection Prevention
```javascript
// ✅ SAFE: Parameterized queries
db.query('SELECT * FROM users WHERE email = ?', [email]);

// ❌ UNSAFE: String concatenation (NEVER do this)
db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

#### XSS Prevention
- React auto-escapes content in JSX
- Never use `dangerouslySetInnerHTML`
- Validate file types on upload

#### Input Validation
```javascript
// backend/utils/validators.js
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  if (email.length > 255) {
    return { valid: false, error: 'Email too long' };
  }
  return { valid: true };
}

function validateUsername(username) {
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username must be 3-20 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores' };
  }
  return { valid: true };
}
```

### 5. File Upload Security

#### File Type Validation
```javascript
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
];

function validateFileType(file) {
  // Check MIME type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new ValidationError('File type not allowed');
  }
  
  // Also check extension (defense in depth)
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt'];
  if (!allowedExts.includes(ext)) {
    throw new ValidationError('File extension not allowed');
  }
}
```

#### File Size Limits
```javascript
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});
```

#### Filename Sanitization
```javascript
// Generate safe filename - never use user-provided name directly
const safeFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
```

### 6. End-to-End Encryption

#### Key Exchange (ECDH)
```javascript
// Client generates key pair
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey']
);

// Public key is shared, private key never leaves device
```

#### Message Encryption (AES-256-GCM)
```javascript
async encrypt(plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    this.derivedKey,
    encoded
  );
  
  return {
    encryptedData: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  };
}
```

**Why AES-256-GCM?**
- AES-256: Military-grade encryption
- GCM: Provides both encryption AND authentication
- Detects tampering (authentication tag)

---

## Known Limitations

### 1. JWT in localStorage (XSS Risk)
**Issue:** Tokens stored in localStorage are accessible to JavaScript
**Risk:** XSS attack could steal tokens
**Mitigation:** 
- React escapes content (reduces XSS surface)
- Short token expiry (15 min)
- Token rotation

**Production Fix:**
```javascript
// Use HttpOnly cookies instead
res.cookie('accessToken', token, {
  httpOnly: true,    // Not accessible to JS
  secure: true,      // HTTPS only
  sameSite: 'strict' // CSRF protection
});
```

**Why not implemented:**
- Adds CSRF complexity
- Cookie handling with Socket.IO is tricky
- Acceptable for LAN learning project

### 2. No HTTPS by Default
**Issue:** HTTP traffic can be intercepted
**Risk:** Tokens visible on network
**Mitigation:** 
- E2E encryption protects message AND file content
- LAN environment is trusted

**Production Fix:**
```javascript
// Use HTTPS with valid certificate
const https = require('https');
const server = https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}, app);
```

### 3. Metadata Not Protected
**Issue:** Server sees who talks to whom, when
**Risk:** Traffic analysis possible
**Mitigation:** Acceptable for this use case

**Full Protection Would Require:**
- Onion routing (like Tor)
- Mix networks
- Constant-rate traffic padding

### 4. Static File Serving
**Issue:** `/uploads/*` accessible without auth
**Risk:** Even with encrypted files, storage can be accessed
**Mitigation:** 
- Random filenames (hard to guess)
- Files are E2E encrypted (attacker gets ciphertext only)
- Decryption requires room key (never on server)

**Production Fix:** (shown in CHALLENGES.md)

---

## OWASP Top 10 Coverage

### 1. Injection ✅
**Status:** Protected
**Implementation:** Parameterized queries everywhere
```javascript
// All database queries use parameters
db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

### 2. Broken Authentication ✅
**Status:** Protected
**Implementation:**
- bcrypt password hashing
- JWT with short expiry
- Refresh token rotation
- Rate limiting on auth endpoints

### 3. Sensitive Data Exposure ⚠️
**Status:** Partially protected
**Protected:**
- Messages (E2E encrypted)
- Passwords (hashed)
**Not Protected:**
- Files at rest
- Metadata

### 4. XML External Entities (XXE) ✅
**Status:** Protected
**Implementation:** No XML parsing in application

### 5. Broken Access Control ⚠️
**Status:** Partially protected
**Protected:**
- API endpoints check room membership
- JWT required for protected routes
**Gap:**
- Static file serving

### 6. Security Misconfiguration ✅
**Status:** Protected
**Implementation:**
- Environment variables for secrets
- No default credentials
- Error messages don't leak info

### 7. Cross-Site Scripting (XSS) ⚠️
**Status:** Mostly protected
**Protected:**
- React auto-escapes
- Input validation
**Gap:**
- JWT in localStorage

### 8. Insecure Deserialization ✅
**Status:** Protected
**Implementation:** Only JSON parsing, no object deserialization

### 9. Using Components with Known Vulnerabilities ⚠️
**Status:** Needs monitoring
**Recommendation:** Run `npm audit` regularly

### 10. Insufficient Logging & Monitoring ⚠️
**Status:** Basic logging
**Implementation:**
- Request logging
- Error logging
**Gap:**
- No security event logging
- No alerting

---

## Security Checklist

### Before Production Deployment

- [ ] Change JWT secret (use strong random value)
- [ ] Enable HTTPS
- [ ] Move JWT to HttpOnly cookies
- [ ] Implement file encryption at rest
- [ ] Add security headers (Helmet.js)
- [ ] Run `npm audit fix`
- [ ] Add security event logging
- [ ] Implement proper session management
- [ ] Add CSRF protection
- [ ] Set up rate limiting persistence (Redis)
- [ ] Review and restrict CORS policy
- [ ] Implement Content Security Policy

### Regular Maintenance

- [ ] Rotate JWT secrets periodically
- [ ] Monitor for suspicious login patterns
- [ ] Review access logs
- [ ] Update dependencies monthly
- [ ] Run security scans (OWASP ZAP)

---

## Security Design Decisions

### Why Stateless JWT vs Sessions?
| Factor | JWT | Sessions |
|--------|-----|----------|
| Scalability | ✅ Stateless | ❌ Needs shared storage |
| Socket.IO | ✅ Easy to pass in auth | ⚠️ Cookie complications |
| Revocation | ❌ Can't revoke (mitigated by short expiry) | ✅ Instant revocation |
| **Decision** | **JWT chosen** for Socket.IO simplicity |

### Why 15-Minute Access Token?
- Long enough: Users don't refresh constantly
- Short enough: Limits damage from theft
- Balance between security and UX

### Why No Account Lockout?
- Prevents DoS (attacker could lock out legitimate users)
- Rate limiting achieves same goal without lockout risk
- Trade-off: Determined attacker has more time, but rate limit makes it impractical

### Why bcrypt over Argon2?
- bcrypt: Battle-tested, widely supported
- Argon2: Newer, better, but more complex dependency
- Trade-off: Chose proven over cutting-edge for reliability

---

## Incident Response

### If JWT Secret is Compromised
1. Immediately generate new secret
2. Restart server (invalidates all access tokens)
3. All refresh tokens still valid (DB-stored)
4. Users will auto-refresh with new secret
5. Consider "logout all" for sensitive accounts

### If Database is Compromised
1. Passwords safe (bcrypt hashed)
2. Rotate JWT secret
3. Message content safe (E2E encrypted, keys not in DB)
4. Review file access (files may be exposed)
5. Notify affected users

### If User Reports Account Compromise
1. User triggers "logout all devices"
2. All refresh tokens revoked
3. User sets new password
4. Review account activity logs
