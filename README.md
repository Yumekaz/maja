# 🔐 SecureChat - End-to-End Encrypted Messenger

A production-ready, real-time messaging application with **true end-to-end encryption**, **JWT authentication**, and **offline-first architecture**.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-00d4aa)
![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-green)
![Tests](https://img.shields.io/badge/Tests-95%20Passing-brightgreen)
![Storage](https://img.shields.io/badge/Storage-SQLite-blue)

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component interactions |
| [CHALLENGES.md](./CHALLENGES.md) | Real problems I solved and what I learned |
| [SECURITY.md](./SECURITY.md) | Threat model, security measures, OWASP coverage |
| [PERFORMANCE.md](./PERFORMANCE.md) | Benchmarks, bottlenecks, scalability analysis |

---

## ✨ Features

### 🔒 Advanced Security
- **End-to-End Encryption** - AES-256-GCM + ECDH P-256 key exchange
- **Secure File Sharing** - E2E encrypted file uploads (Images, PDFs)
- **Zero-Knowledge** - Server stores only encrypted blobs
- **JWT Authentication** - Access tokens (15min) + refresh tokens (7 days) with rotation
- **Ephemeral Mode** - All data deleted when room owner leaves

### 📱 Mobile & Offline Ready
- **Offline-First** - Works on local network without internet
- **QR Code Joining** - Scan to join rooms instantly
- **Self-Signed HTTPS** - Built-in HTTPS server for secure mobile access
- **Mixed Mode** - Supports both Auth-based and Legacy (username-only) users

### 🛠️ Developer Experience
- **TypeScript** - Full type safety on frontend
- **Comprehensive Testing** - 95+ Unit (Jest) and E2E (Playwright) tests
- **Dual Server Modes** - Enhanced (Auth) and Legacy (Simple) servers

---

## 🚀 Quick Start

### Option A: One-Click Setup (Recommended) ⚡
**Right-click `setup.ps1` → "Run with PowerShell" (as Administrator)**
This automatically installs dependencies, builds the client, generates SSL certs, and starts the server.

### Option B: Manual Setup

#### 1. Install & Build
```bash
npm install         # Install server deps
npm run install-all # Install client deps
npm run build       # Build React frontend
```

#### 2. Generate SSL Certificates (Required for Mobile)
```bash
mkdir ssl
openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=SecureChat"
```

#### 3. Start Server
```bash
npm start           # Starts enhanced server (Auth + E2E)
# OR
npm run start:legacy # Starts legacy server (No Auth, just E2E)
```

### Access URLs
| Device | URL |
|--------|-----|
| 💻 PC | `http://localhost:3000` |
| 📱 Phone | `https://YOUR_PC_IP:3443` |

---

## ⚠️ Troubleshooting Mobile Connection

**"Site can't be reached" / "Connection timed out"?**

This is usually caused by **AP Isolation** on your phone's hotspot (blocks laptop from talking to phone).

**✅ The Fix: Use Windows Mobile Hotspot**
1. **On PC:** Settings → Network & Internet → Mobile hotspot → **Turn ON**
2. **On Phone:** Connect to the PC's hotspot WiFi
3. **Scan QR Code:** It will automatically detect the hotspot IP (e.g., `192.168.137.1`)
4. **Access:** `https://192.168.137.1:3443`

---

## 🧪 Testing

We use **Jest** for unit testing and **Playwright** for E2E testing.

```bash
# Run Unit Tests (Auth, Crypto, Logic)
npm test

# Run End-to-End Tests (Browser automation)
npm run test:e2e

# Run All Tests
npm run test:all
```

**Coverage:**
- ✅ **Auth:** Registration, Login, Token Refresh, Rate Limiting
- ✅ **Rooms:** Creation, Joining, Locking, Persistence
- ✅ **Security:** Injection, XSS prevention, Error handling
- ✅ **E2E:** Full user flows (Login → Create Room → Chat → Leave)

---

## 📁 Project Structure

```
e2e-messenger/
├── server-enhanced.js  # MAIN Server (Express + Socket.IO + Auth)
├── server-sqlite.js    # Legacy Server (No Auth modules)
├── backend/
│   ├── config/         # Environment & Constants
│   ├── controllers/    # API Logic (Auth, Rooms, Files)
│   ├── database/       # SQLite Wrapper (db.js)
│   ├── middleware/     # JWT Auth & Rate Limiting
│   └── routes/         # Express Routes
├── client/
│   ├── src/
│       ├── crypto/     # encryption.ts (E2E Logic)
│       ├── pages/      # React Components
│       └── types/      # TypeScript Definitions
├── tests/              # Jest Unit Tests
├── e2e/                # Playwright E2E Tests
└── ssl/                # Certificates
```

---

## 🔮 Future Roadmap
1. **Message Pagination** - Load older messages on scroll
2. **Read Receipts** - Show who has read messages
3. **Push Notifications** - Web Push API for mobile
4. **Desktop App** - Electron wrapper

---

## 📄 License
MIT License - free to use, modify, and distribute.

---
Built with 🔐 for private, offline communication.
