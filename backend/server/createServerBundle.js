const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { Server } = require('socket.io');

const SSL_KEY_PATH = path.resolve(__dirname, '..', '..', 'ssl', 'key.pem');
const SSL_CERT_PATH = path.resolve(__dirname, '..', '..', 'ssl', 'cert.pem');
const DEFAULT_HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 3443;

function createSocketServer() {
  return new Server({
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });
}

function createHttpsServer(app, logger, disableHttps) {
  if (disableHttps || !fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
    return null;
  }

  try {
    return https.createServer(
      {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
      },
      app
    );
  } catch (error) {
    logger.error('Failed to load SSL certificates', { error: error.message });
    return null;
  }
}

function createServerBundle(app, logger, options = {}) {
  const httpsPort = options.httpsPort || DEFAULT_HTTPS_PORT;
  const disableHttps = options.disableHttps ?? process.env.DISABLE_HTTPS === 'true';

  const server = http.createServer(app);
  const httpsServer = createHttpsServer(app, logger, disableHttps);
  const io = createSocketServer();

  io.attach(server);
  if (httpsServer) {
    io.attach(httpsServer);
  }

  return {
    server,
    httpsServer,
    io,
    httpsPort,
    httpsEnabled: Boolean(httpsServer),
  };
}

module.exports = {
  DEFAULT_HTTPS_PORT,
  createServerBundle,
};
