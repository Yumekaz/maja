function buildBanner({ env, httpPort, httpsPort, httpsEnabled, localIP }) {
  const httpsInfo = httpsEnabled
    ? `\n║   📱 HTTPS (Mobile): https://${localIP}:${httpsPort}`.padEnd(72) + '║'
    : '';

  return `
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🔐 E2E ENCRYPTED MESSENGER SERVER v3.0                             ║
║                                                                      ║
║   Environment: ${env.padEnd(51)}║
║   🖥️  HTTP:  http://${localIP}:${httpPort}`.padEnd(72) + `║${httpsInfo}
║                                                                      ║
║   ⚠️  For mobile access, use HTTPS URL and accept the certificate    ║
║      (Tap "Advanced" → "Proceed anyway")                             ║
║                                                                      ║
║   Features:                                                          ║
║   • End-to-end encryption (AES-256-GCM + ECDH P-256)                 ║
║   • JWT authentication with refresh tokens                           ║
║   • File upload support (images, documents)                          ║
║   • SQLite persistence                                               ║
║   • Rate limiting                                                    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
  `;
}

module.exports = buildBanner;
