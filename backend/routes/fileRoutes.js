/**
 * File Routes
 * /api/files/*
 */

const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticateToken } = require('../middleware/auth');

// All file routes require authentication
router.use(authenticateToken);

// File operations
router.post('/upload', fileController.upload.bind(fileController));
router.get('/:id', fileController.getFile.bind(fileController));
router.get('/room/:roomId', fileController.getRoomFiles.bind(fileController));

module.exports = router;
