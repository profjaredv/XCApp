# Database Migrations

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of the migration file (e.g., `008_create_meet_groups.sql`)
4. Paste into the SQL editor
5. Click **Run**

### Option 2: Supabase CLI
```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Run the migration
supabase db push
```

## Migration 008: Meet Groups

**File:** `008_create_meet_groups.sql`

**Purpose:** Creates tables for manual meet grouping, allowing coaches to link races across seasons for comparison.

**Tables Created:**
- `meet_groups` - Stores meet group definitions
- `meet_group_races` - Junction table linking races to meet groups

**Features:**
- Row Level Security (RLS) enabled
- Coaches can only manage their own team's meet groups
- Automatic `updated_at` timestamp
- Cascade delete (deleting a group removes all race associations)

**To Run:** Copy the SQL from `008_create_meet_groups.sql` and run it in the Supabase SQL Editor.
