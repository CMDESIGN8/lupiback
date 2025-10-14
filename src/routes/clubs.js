const express = require('express');
const {
  getClubs,
  createClub,
  getClubDetails,
  joinClub,
  leaveClub,
  getClubMembers,
  createClubPost
} = require('../controllers/clubs');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', getClubs);
router.get('/:clubId', getClubDetails);
router.get('/:clubId/members', getClubMembers);
router.post('/', authenticateUser, createClub);
router.post('/:clubId/join', authenticateUser, joinClub);
router.post('/leave', authenticateUser, leaveClub);
router.post('/:clubId/posts', authenticateUser, createClubPost);

module.exports = router;