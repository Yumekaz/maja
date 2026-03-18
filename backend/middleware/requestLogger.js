/**
 * Request Logger Middleware
 * Logs HTTP requests with timing information
 */

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.http(req, res, duration);
  });

  next();
}

module.exports = requestLogger;
