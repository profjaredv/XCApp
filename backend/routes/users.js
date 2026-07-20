const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');

// GET /api/users/me
router.get('/me', authenticate, async (req, res) => {
  res.status(200).json(req.user);
});

// PUT /api/users/me
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      include: { team: true },
    });

    res.status(200).json({ message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error('Failed to update profile:', err.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
