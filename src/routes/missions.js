const express = require('express');
const {
  getAvailableMissions,
  updateMissionProgress,
  getDailyMissions,
  getCompletedMissions
} = require('../controllers/missions');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateUser, getAvailableMissions);
router.get('/daily', authenticateUser, getDailyMissions);
router.get('/completed', authenticateUser, getCompletedMissions);
router.post('/progress', authenticateUser, updateMissionProgress);

module.exports = router;