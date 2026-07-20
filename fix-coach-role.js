// Quick script to fix coach role
const axios = require('axios');

async function fixCoachRole() {
  try {
    // You'll need to get your Firebase auth token
    console.log('To fix your coach role:');
    console.log('1. Open browser dev tools (F12)');
    console.log('2. Go to Application/Storage tab');
    console.log('3. Find Firebase auth token');
    console.log('4. Or run this in browser console:');
    console.log('');
    console.log('firebase.auth().currentUser.getIdToken().then(token => {');
    console.log('  fetch("/api/profile/fix-coach-role", {');
    console.log('    method: "POST",');
    console.log('    headers: {');
    console.log('      "Authorization": `Bearer ${token}`,');
    console.log('      "Content-Type": "application/json"');
    console.log('    }');
    console.log('  }).then(r => r.json()).then(console.log);');
    console.log('});');
    console.log('');
    console.log('Or paste your token here and run: node fix-coach-role.js YOUR_TOKEN');
    
    const token = process.argv[2];
    if (!token) {
      console.log('No token provided. Use the browser method above.');
      return;
    }
    
    const response = await axios.post('http://localhost:3000/api/profile/fix-coach-role', {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

fixCoachRole();
