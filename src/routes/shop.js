const express = require('express');
const {
  getAvatars,
  purchaseAvatar,
  equipAvatar,
  getUserAvatars,
  getShopItems
} = require('../controllers/shop');
const { authenticateUser, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/avatars', optionalAuth, getAvatars);
router.get('/my-avatars', authenticateUser, getUserAvatars);
router.get('/items', authenticateUser, getShopItems);
router.post('/avatars/purchase', authenticateUser, purchaseAvatar);
router.post('/avatars/equip', authenticateUser, equipAvatar);

module.exports = router;