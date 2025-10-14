const express = require('express');
const users = require('./users');
const missions = require('./missions');
const shop = require('./shop');
const clubs = require('./clubs');

const router = express.Router();

router.use('/users', users);
router.use('/missions', missions);
router.use('/shop', shop);
router.use('/clubs', clubs);

module.exports = router;