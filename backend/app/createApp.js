const express = require('express');
const path = require('path');
const cors = require('cors');

const requestLogger = require('../middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { authRoutes, roomRoutes, fileRoutes } = require('../routes');
const { buildNetworkInfo } = require('../utils/networkInfo');

const PUBLIC_BUILD_DIR = path.resolve(__dirname, '..', '..', 'public_build');

function createApiRateLimiter() {
  return (req, res, next) => {
    if (req.path.startsWith('/files/') && req.method === 'GET') {
      return next();
    }

    return apiRateLimiter(req, res, next);
  };
}

function createApp({ config, db, httpsPort, isHttpsEnabled }) {
  const app = express();

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  app.use(requestLogger);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: db.getStats(),
    });
  });

  app.get('/api/network-info', (req, res) => {
    res.json(buildNetworkInfo(config.port, httpsPort, isHttpsEnabled()));
  });

  app.use('/api', createApiRateLimiter());

  app.use(express.static(PUBLIC_BUILD_DIR));

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/files', fileRoutes);

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_BUILD_DIR, 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
