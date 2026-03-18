/**
 * Routes Index
 * Centralizes all route exports
 */

const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const fileRoutes = require('./fileRoutes');

module.exports = {
  authRoutes,
  roomRoutes,
  fileRoutes,
};
