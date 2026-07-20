const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register
// Note: Supabase handles auth on the client side using supabase.auth.signUp()
// This endpoint is kept for compatibility but clients should use Supabase client directly
router.post('/register', async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).send({ message: 'Email, password, and name are required.' });
    }

    try {
        // Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                name: name
            }
        });

        if (authError) {
            console.error('Error creating user:', authError);
            if (authError.message?.includes('already registered')) {
                return res.status(409).send({ message: 'Conflict: Email already in use.' });
            }
            return res.status(500).send({ message: authError.message });
        }

        // User record in users table will be created by auth middleware on first request

        res.status(201).send({
            message: 'User created successfully.',
            user: {
                uid: authData.user.id,
                email: authData.user.email,
                name: name,
                role: 'athlete'
            }
        });

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// POST /api/auth/google
// Handles user creation/retrieval after Google Sign-In on the client.
// The authMiddleware handles the logic of finding or creating the user.
router.post('/google', authenticate, (req, res) => {
    // The user object is attached by the authMiddleware.
    const userPayload = JSON.parse(JSON.stringify(req.user));
    res.status(200).json(userPayload);
});

module.exports = router;
