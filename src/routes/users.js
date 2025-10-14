const express = require('express');
const {
  getUserProfile,
  updateUserProfile,
  getUserStats,
  updatePlayerPosition,
  getOnlinePlayers
} = require('../controllers/users');
const { authenticateUser, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/profile', authenticateUser, getUserProfile);
router.put('/profile', authenticateUser, updateUserProfile);
router.get('/stats', authenticateUser, getUserStats);
router.post('/position', authenticateUser, updatePlayerPosition);
router.get('/online', optionalAuth, getOnlinePlayers);

module.exports = router;