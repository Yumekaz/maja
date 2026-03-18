/**
 * Input Validators
 * Provides validation functions for user input
 */

const { ValidationError } = require('./errors');

const validators = {
  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate password strength
   * Requirements: min 8 chars, at least one number, one letter
   */
  isValidPassword(password) {
    if (password.length < 8) return false;
    if (!/[A-Za-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
  },

  /**
   * Validate username
   * Requirements: 3-20 chars, alphanumeric and underscores only
   */
  isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
  },

  /**
   * Validate room code format
   */
  isValidRoomCode(code) {
    const roomCodeRegex = /^[A-Z0-9]{6}$/;
    return roomCodeRegex.test(code);
  },

  /**
   * Sanitize string input
   */
  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, 1000); // Limit length
  },

  /**
   * Validate and sanitize registration input
   */
  validateRegistration(data) {
    const errors = [];

    if (!data.email || !validators.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    if (!data.username || !validators.isValidUsername(data.username)) {
      errors.push('Username must be 3-20 characters (letters, numbers, underscores)');
    }

    if (!data.password || !validators.isValidPassword(data.password)) {
      errors.push('Password must be at least 8 characters with letters and numbers');
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    return {
      email: data.email.toLowerCase().trim(),
      username: validators.sanitizeString(data.username),
      password: data.password,
    };
  },

  /**
   * Validate login input
   */
  validateLogin(data) {
    const errors = [];

    if (!data.email || !validators.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    if (!data.password) {
      errors.push('Password is required');
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    return {
      email: data.email.toLowerCase().trim(),
      password: data.password,
    };
  },

  /**
   * Validate message input
   */
  validateMessage(data) {
    if (!data.encryptedData || !data.iv) {
      throw new ValidationError('Invalid message format');
    }

    if (!data.roomId) {
      throw new ValidationError('Room ID is required');
    }

    return {
      roomId: validators.sanitizeString(data.roomId),
      encryptedData: data.encryptedData,
      iv: data.iv,
    };
  },
};

module.exports = validators;
