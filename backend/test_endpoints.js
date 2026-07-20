const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nxlatotemxoryjsuouak.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI2NzkwMCwiZXhwIjoyMDc0ODQzOTAwfQ.GlvdssDuUQbnTIswHpz17Yr8CSqrsAPGrZHt3ZHrsFU'
);

async function testEndpoints() {
  console.log('🧪 Testing Supabase Endpoints\n');

  // Test 1: Get races for season 2025
  console.log('1️⃣ Testing races query with season as NUMBER...');
  const { data: races, error: racesError } = await supabase
    .from('races')
    .select('id, name, season, distance_meters')
    .eq('season', 2025)
    .limit(3);

  if (racesError) {
    console.error('❌ Error:', racesError);
  } else {
    console.log(`✅ Found ${races.length} races`);
    races.forEach(r => console.log(`   - ${r.name}: ${r.distance_meters}m`));
  }

  // Test 2: Get athlete with results
  console.log('\n2️⃣ Testing athlete detail query...');
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, name')
    .eq('name', 'Calder Finn')
    .single();

  const { data: seasonRaces2 } = await supabase
    .from('races')
    .select('id')
    .eq('season', 2025);

  const raceIds = seasonRaces2.map(r => r.id);

  const { data: results, error: resultsError } = await supabase
    .from('results')
    .select(`
      *,
      race:races(*)
    `)
    .eq('athlete_id', athlete.id)
    .in('race_id', raceIds);

  if (resultsError) {
    console.error('❌ Error:', resultsError);
  } else {
    console.log(`✅ Found ${results.length} results for ${athlete.name}`);
    const sorted = results.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));
    sorted.slice(0, 3).forEach(r => {
      const pace = (r.time / r.race.distance_meters) * 1609.34;
      console.log(`   - ${r.race.name}: ${r.time}s (${Math.floor(pace/60)}:${String(Math.floor(pace%60)).padStart(2, '0')}/mi)`);
    });
  }

  // Test 3: Get meet with results and athlete data
  console.log('\n3️⃣ Testing meet detail query...');
  const { data: meet } = await supabase
    .from('races')
    .select('id, name')
    .eq('name', 'Fort Steilacoom Invitational')
    .single();

  const { data: meetResults, error: meetError } = await supabase
    .from('results')
    .select(`
      *,
      athlete:athletes(id, name, gender, grade)
    `)
    .eq('race_id', meet.id)
    .order('time', { ascending: true })
    .limit(5);

  if (meetError) {
    console.error('❌ Error:', meetError);
  } else {
    console.log(`✅ Found ${meetResults.length} results for ${meet.name}`);
    meetResults.forEach((r, i) => {
      console.log(`   ${i+1}. ${r.athlete.name} (${r.athlete.gender}, Grade ${r.athlete.grade}): ${r.time}s`);
    });
  }

  // Test 4: Check distance_meters values
  console.log('\n4️⃣ Verifying distance_meters conversion...');
  const { data: allRaces } = await supabase
    .from('races')
    .select('name, distance, distance_meters')
    .eq('season', 2025)
    .order('date');

  console.log('✅ All races:');
  allRaces.forEach(r => {
    const miles = (r.distance_meters / 1609.34).toFixed(2);
    console.log(`   - ${r.name}: ${r.distance} → ${r.distance_meters}m (${miles} mi)`);
  });

  console.log('\n✅ All tests complete!');
}

testEndpoints().catch(console.error);
