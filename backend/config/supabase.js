const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://nxlatotemxoryjsuouak.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set!');
  console.error('This will cause RLS policy violations.');
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

// Decode JWT to check role
const payload = JSON.parse(Buffer.from(supabaseServiceKey.split('.')[1], 'base64').toString());
const keyType = payload.role === 'service_role' ? 'SERVICE ROLE ✅' : `${payload.role.toUpperCase()} ⚠️`;

console.log('✅ Supabase configured');
console.log('   URL:', supabaseUrl);
console.log('   Key type:', keyType);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
