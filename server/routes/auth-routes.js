const express = require('express');
const { register, login, logout } = require('../controllers/auth-controller');
const { rateLimiters } = require('../middleware/rateLimiter');

const router = express.Router();

// Public routes (listed in config/accessPolicy.js), each with its own guessing limit
router.post('/register', rateLimiters.register, register);
router.post('/login', rateLimiters.login, login);

// Signed-in only (config/accessPolicy.js): ends all sessions of the caller
router.post('/logout', logout);

module.exports = router;
