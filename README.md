# MAJA

An internet-free messenger for same Wi-Fi, hotspot, or LAN groups, with owner-approved rooms and client-side encrypted messages and file contents.

## What it is

MAJA is built for private communication on a shared local network when the internet is unavailable, unwanted, or intentionally avoided.

Core idea:
- one device hosts the app on the local network
- other devices join through that local address or QR code
- the room owner approves every participant
- messages are encrypted in the browser before they are relayed

## What the app currently guarantees

- No internet is required. Traffic stays on the same Wi-Fi, hotspot, or LAN.
- The server enforces a local-network boundary for both HTTP and Socket.IO traffic.
- Authenticated rooms are bound to the signed-in user identity from the JWT, not a client-claimed username.
- Messages are encrypted client-side with AES-GCM after room key exchange.
- File contents and the user-visible attachment metadata needed for decryption are encrypted before upload.
- If the room owner closes a room, the room state, messages, members, and uploaded ciphertext files are removed.

## Important caveats

- `Offline` here means `no internet required`, not `no network required`.
- The app is designed for same-network use, but exact reachability still depends on host firewall rules, router or hotspot behavior, and browser security rules.
- Phone support is much better than before, but real mobile behavior still varies by browser, OS, hotspot policy, and whether the browser requires a secure context.
- The server still sees operational metadata such as usernames, room membership, timestamps, ciphertext sizes, and connection/IP information.
- There is no key backup or multi-device key recovery flow yet. If a device loses its local private key material, old encrypted room history tied to that key is not recoverable.

## Prerequisites

- Node.js `18+`
- npm `9+`
- Windows PowerShell if you want to use `setup.ps1`
- OpenSSL only if you want optional local HTTPS certificates for stricter mobile browsers

## Quick start

### Option A: Windows setup script

`setup.ps1` is the fastest path on Windows. It installs dependencies, builds the client, and can prepare local HTTPS files for phone testing.

### Option B: Manual setup

```bash
npm install
npm run install-all
npm run build
```

Optional local HTTPS:

```bash
mkdir ssl
openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=MAJA"
```

Run the app:

```bash
npm start
```

Legacy mode:

```bash
npm run start:legacy
```

Default local access:
- Host machine: `http://localhost:3000`
- Phone or second laptop: `http://YOUR_LOCAL_IP:3000`
- If the browser requires a secure context and you generated local certs: `https://YOUR_LOCAL_IP:3443`

## How it works

1. Start the server on one machine.
2. Connect the other devices to the same Wi-Fi, hotspot, or LAN.
3. Create a room on the host device.
4. Share the room code or QR code.
5. The owner approves each join request.
6. Clients derive or restore the room key locally and encrypt messages before sending them.
7. Recipients decrypt locally in the browser.

## Encryption model

- Key exchange: ECDH P-256
- Message/file encryption: AES-256-GCM
- Transport: HTTP or HTTPS plus Socket.IO, depending on how the local server is started
- Server role: relay, persistence, room state, and approval flow

The server should not be able to read plaintext message content or plaintext file contents.

## Testing

This repo includes automated Jest and Playwright coverage for:
- auth and token flow
- room creation, join approval, and persistence
- local-network enforcement helpers
- encrypted file upload and download flow
- browser-level messaging and room UX

Useful commands:

```bash
npm test -- --runInBand
npm run test:e2e
npm run build
```

## Troubleshooting mobile joins

If a phone cannot open the QR link:
- make sure both devices are on the same local network
- try the alternate local addresses shown in the room details panel
- try the host machine's hotspot instead of the phone's hotspot if AP isolation blocks device-to-device traffic
- use local HTTPS if the browser blocks Web Crypto or clipboard/network features without a secure context

## Repo docs

- [SECURITY.md](./SECURITY.md): current security notes, threat model, and known limitations
- [PERFORMANCE.md](./PERFORMANCE.md): performance notes and scaling concerns
- [ARCHITECTURE.md](./ARCHITECTURE.md): deeper architecture notes from the project build-out
- [CHALLENGES.md](./CHALLENGES.md): implementation lessons and problem-solving notes from development

README and `SECURITY.md` should be treated as the current source of truth for runtime behavior and product claims.

## License

MIT
