/**
 * Authentication Routes
 * /api/auth/*
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');

// Public routes (rate limiting removed for development)
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authController.logout.bind(authController));

// Protected routes
router.post('/logout-all', authenticateToken, authController.logoutAll.bind(authController));
router.get('/me', authenticateToken, authController.me.bind(authController));

module.exports = router;
