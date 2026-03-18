/**
 * Room Routes
 * /api/rooms/*
 */

const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { authenticateToken } = require('../middleware/auth');

// All room routes require authentication
router.use(authenticateToken);

// Room operations
router.post('/', roomController.create.bind(roomController));
router.get('/my-rooms', roomController.getMyRooms.bind(roomController));
router.get('/code/:roomCode', roomController.getByCode.bind(roomController));
router.get('/:roomId/members', roomController.getMembers.bind(roomController));
router.get('/:roomId/messages', roomController.getMessages.bind(roomController));
router.delete('/:roomId', roomController.delete.bind(roomController));

module.exports = router;
