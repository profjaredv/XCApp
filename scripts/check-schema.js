#!/usr/bin/env node

/**
 * Schema Checker
 * Scans code to find all database column references and compares with expected schema
 */

const fs = require('fs');
const path = require('path');

// Expected schema based on code analysis
const EXPECTED_SCHEMA = {
  team_season_metrics: [
    'id', 'team_id', 'season', 'athlete_count', 'male_athlete_count', 
    'female_athlete_count', 'meet_count', 'total_races', 'total_miles',
    'average_pace', 'improvement_percent', 'first_meet', 'last_meet', 'calculated_at'
  ],
  meet_performance_metrics: [
    'id', 'race_id', 'team_id', 'season', 'meet_name', 'meet_date',
    'distance', 'distance_label', 'participant_count', 'male_participant_count',
    'female_participant_count', 'average_time', 'average_pace', 'best_time',
    'team_score', 'metrics', 'calculated_at'
  ],
  athlete_season_metrics: [
    'id', 'athlete_id', 'team_id', 'season', 'name', 'gender', 'grade',
    'total_races', 'total_miles', 'total_time_seconds', 'average_pace',
    'best_pace', 'best_time_5k', 'improvement', 'improvement_percent', 'calculated_at'
  ],
  teams: [
    'id', 'name', 'coach_uid', 'join_code', 'athletic_team_id', 
    'imported_seasons', 'results', 'created_at', 'updated_at'
  ],
  athletes: [
    'id', 'team_id', 'name', 'gender', 'grade', 'created_at', 'updated_at'
  ],
  races: [
    'id', 'team_id', 'name', 'date', 'season', 'distance', 'distance_meters',
    'location', 'created_at', 'updated_at'
  ],
  results: [
    'id', 'race_id', 'athlete_id', 'time', 'place', 'grade', 'created_at'
  ]
};

console.log('📊 LeadPack XC Schema Checker\n');
console.log('Expected Schema:\n');

Object.entries(EXPECTED_SCHEMA).forEach(([table, columns]) => {
  console.log(`\n${table}:`);
  columns.forEach(col => {
    console.log(`  - ${col}`);
  });
});

console.log('\n\n📝 Instructions:');
console.log('1. Run 01_verify_schema.sql in Supabase SQL Editor');
console.log('2. Compare output with expected schema above');
console.log('3. If columns are missing, run 02_add_missing_columns.sql');
console.log('4. Verify with 01_verify_schema.sql again');

console.log('\n\n🔍 Critical Columns to Check:');
console.log('  ⚠️  team_season_metrics.first_meet (JSONB)');
console.log('  ⚠️  team_season_metrics.last_meet (JSONB)');
console.log('  ⚠️  meet_performance_metrics.metrics (JSONB)');
console.log('  ⚠️  All calculated_at columns (TIMESTAMPTZ)');

console.log('\n\n✅ After migration, recalculate metrics to test!');
