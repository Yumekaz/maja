/**
 * Authentication Middleware
 * Verifies JWT tokens for protected routes
 */

const authService = require('../services/authService');
const { AuthenticationError } = require('../utils/errors');

const MULTIPART_DRAIN_LIMIT_BYTES = 64 * 1024;

function forwardAuthError(req, next, error) {
  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');

  if (!isMultipart || req.readableEnded || req.complete) {
    next(error);
    return;
  }

  let drainedBytes = 0;
  let settled = false;

  const cleanup = () => {
    req.off('data', handleData);
    req.off('end', finalize);
    req.off('close', finalize);
    req.off('error', finalize);
  };

  const finalize = () => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    next(error);
  };

  const handleData = (chunk) => {
    drainedBytes += chunk.length;
    if (drainedBytes > MULTIPART_DRAIN_LIMIT_BYTES && !req.destroyed) {
      settled = true;
      cleanup();
      req.destroy();
    }
  };

  req.on('data', handleData);
  req.on('end', finalize);
  req.on('close', finalize);
  req.on('error', finalize);
  req.resume();
}

/**
 * Authenticate access token from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    forwardAuthError(req, next, new AuthenticationError('Access token required'));
    return;
  }

  try {
    const decoded = authService.verifyAccessToken(token);

    // Handle legacy upload tokens
    if (decoded.type === 'legacy_upload') {
      req.user = {
        userId: null,
        username: decoded.username,
        type: 'legacy'
      };
    } else {
      req.user = decoded; // { userId, username, type }
    }

    next();
  } catch (error) {
    forwardAuthError(req, next, new AuthenticationError('Invalid or expired token'));
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = authService.verifyAccessToken(token);
      req.user = decoded;
    } catch (error) {
      // Token invalid, but that's okay for optional auth
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

/**
 * Authenticate Socket.IO connection
 */
function authenticateSocket(socket, next) {
  refreshSocketAuth(socket);
  next();
}

function refreshSocketAuth(socket) {
  const token = socket.handshake.auth?.token;
  socket.authInvalid = false;

  if (!token) {
    socket.user = null;
    return {
      valid: true,
      authenticated: false,
      user: null,
    };
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    socket.user = decoded;
    return {
      valid: true,
      authenticated: true,
      user: decoded,
    };
  } catch (error) {
    socket.user = null;
    socket.authInvalid = true;
    return {
      valid: false,
      authenticated: true,
      user: null,
    };
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  authenticateSocket,
  refreshSocketAuth,
};
