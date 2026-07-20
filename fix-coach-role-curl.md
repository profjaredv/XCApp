# Fix Coach Role on Railway Deployment

## Method 1: Using the HTML Tool
1. Open `fix-coach-role-railway.html` in your browser
2. Follow the steps to get your Firebase token and fix your role

## Method 2: Using curl (Terminal)

### Step 1: Get your Firebase auth token
1. Open your LeadPack XC app
2. Open browser dev tools (F12)
3. Go to Console tab
4. Run this command:
```javascript
firebase.auth().currentUser.getIdToken().then(token => {
    console.log('Token:', token);
});
```
5. Copy the token that appears

### Step 2: Run the fix command
Replace `YOUR_RAILWAY_URL` with your actual Railway app URL and `YOUR_TOKEN` with the token from step 1:

```bash
curl -X POST "YOUR_RAILWAY_URL/api/profile/fix-coach-role" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Example:
```bash
curl -X POST "https://xctf-data-production.up.railway.app/api/profile/fix-coach-role" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6..." \
  -H "Content-Type: application/json"
```

### Expected Response
If successful, you should see:
```json
{
  "message": "Coach role restored successfully.",
  "user": {
    "uid": "your-uid",
    "email": "your-email@example.com",
    "name": "Your Name",
    "role": "coach",
    "team": {
      "_id": "team-id",
      "name": "Your Team Name"
    }
  }
}
```

## Method 3: Browser Console (Easiest)
1. Open your LeadPack XC app
2. Open browser dev tools (F12)
3. Go to Console tab
4. Run this command (it will automatically use your current auth):

```javascript
firebase.auth().currentUser.getIdToken().then(token => {
  fetch('/api/profile/fix-coach-role', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  .then(r => r.json())
  .then(data => {
    console.log('Result:', data);
    if (data.message) {
      alert(`Success: ${data.message}\nYour role is now: ${data.user.role}`);
      location.reload(); // Refresh the page
    }
  })
  .catch(err => {
    console.error('Error:', err);
    alert('Error fixing role: ' + err.message);
  });
});
```

After running any of these methods successfully, refresh your LeadPack XC app and your coach role should be restored!
