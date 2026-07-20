# Test the Complete Authentication Flow

## Backend is Running ✓
Backend is running on port 3001 and responding correctly.

## Test Steps

### 1. Start the Frontend
In a new terminal:
```bash
cd web
npm run dev
```

This will start the frontend on http://localhost:5173

### 2. Test Registration Flow
1. Navigate to http://localhost:5173/register
2. Enter:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
3. Click "Create an account"
4. Should redirect to http://localhost:5173/onboarding

### 3. Test Team Creation
1. On the onboarding page, click "Create New Team"
2. Enter:
   - Team Name: Test Team
   - Athletic.net Team ID: 123
3. Click "Create Team"
4. Should:
   - Create team in database
   - Upgrade user to coach role
   - Redirect to http://localhost:5173/analytics

### 4. Verify Coach Access
1. On analytics page, check:
   - Navbar shows "Coach" role
   - Can access "Import Data" from sidebar
2. Navigate to http://localhost:5173/data-management
3. Should see data management interface (coach only)

### 5. Test Login Flow
1. Log out (if there's a logout button)
2. Navigate to http://localhost:5173/login
3. Log in with test@example.com / password123
4. Should redirect directly to /analytics (since user has team)

## Expected Backend Responses

### After Registration (GET /api/users/me)
```json
{
  "id": "uuid-string",
  "email": "test@example.com",
  "name": "Test User",
  "role": "athlete",
  "team_id": null,
  "team": null
}
```

### After Team Creation (POST /api/teams)
```json
{
  "success": true,
  "message": "Team created successfully. You have been upgraded to coach role.",
  "user": {
    "id": "uuid-string",
    "email": "test@example.com",
    "name": "Test User",
    "role": "coach",
    "team_id": "team-uuid",
    "team": {
      "id": "team-uuid",
      "name": "Test Team",
      "athletic_team_id": "123",
      "join_code": "ABC123"
    }
  }
}
```

## Troubleshooting

### Frontend shows blank screen
- Open browser console (F12)
- Check for errors
- Most likely: Token issues or API not responding

### 403 Forbidden errors
- Check backend logs
- Verify Supabase URL in .env is correct
- Check that auth middleware is working

### User not upgraded to coach
- Check backend logs for team creation
- Verify POST /api/teams response includes role: "coach"
- Check Supabase users table directly

### Cannot access coach features
- In browser console, run: `localStorage.getItem('sb-nxlatotemxoryjsuouak-auth-token')`
- Verify JWT contains correct user data
- Check that currentUser.role === 'coach' in React DevTools

## Database Verification

You can check the database directly in Supabase:

1. Go to https://supabase.com/dashboard/project/nxlatotemxoryjsuouak
2. Click "Table Editor"
3. Check these tables:
   - `users` - Should have your test user with role="coach"
   - `teams` - Should have your test team
   - `team_members` - Should have entry linking user to team

## Success Criteria

✓ User can register
✓ User is redirected to onboarding
✓ User can create team
✓ User role is upgraded to "coach"
✓ User can access analytics page
✓ User can access data management page
✓ User can log out and log back in
✓ Logged in user is redirected to analytics (not onboarding)
