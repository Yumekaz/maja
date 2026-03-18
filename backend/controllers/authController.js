/**
 * Authentication Controller
 * Handles HTTP requests for authentication
 */

const authService = require('../services/authService');
const validators = require('../utils/validators');

class AuthController {
  /**
   * POST /api/auth/register
   * Register a new user
   */
  async register(req, res, next) {
    try {
      // Validate input
      const { email, username, password } = validators.validateRegistration(req.body);

      // Register user
      const result = await authService.register(email, username, password);

      res.status(201).json({
        message: 'Registration successful',
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Login user
   */
  async login(req, res, next) {
    try {
      // Validate input
      const { email, password } = validators.validateLogin(req.body);

      // Login user
      const result = await authService.login(email, password);

      res.json({
        message: 'Login successful',
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const result = await authService.refreshToken(refreshToken);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Logout user (revoke refresh token)
   */
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;

      await authService.logout(refreshToken);

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout-all
   * Logout from all devices
   */
  async logoutAll(req, res, next) {
    try {
      await authService.logoutAll(req.user.userId);

      res.json({ message: 'Logged out from all devices' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Get current user profile
   */
  async me(req, res, next) {
    try {
      const user = authService.getUserById(req.user.userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
