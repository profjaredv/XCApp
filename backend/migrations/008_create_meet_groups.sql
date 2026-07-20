-- Migration: Create meet groups for manual race grouping
-- This allows coaches to manually group races across seasons for comparison

-- Create meet_groups table
CREATE TABLE IF NOT EXISTS meet_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_group_name_per_team UNIQUE(team_id, group_name)
);

-- Create meet_group_races junction table
CREATE TABLE IF NOT EXISTS meet_group_races (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meet_group_id UUID NOT NULL REFERENCES meet_groups(id) ON DELETE CASCADE,
  race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_race_per_group UNIQUE(meet_group_id, race_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meet_groups_team_id ON meet_groups(team_id);
CREATE INDEX IF NOT EXISTS idx_meet_group_races_group_id ON meet_group_races(meet_group_id);
CREATE INDEX IF NOT EXISTS idx_meet_group_races_race_id ON meet_group_races(race_id);

-- Add updated_at trigger for meet_groups
CREATE OR REPLACE FUNCTION update_meet_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meet_groups_updated_at
  BEFORE UPDATE ON meet_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_meet_groups_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE meet_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE meet_group_races ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meet_groups
-- Coaches can view their team's meet groups
CREATE POLICY meet_groups_select_policy ON meet_groups
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = auth.uid()
    )
  );

-- Coaches can insert meet groups for their team
CREATE POLICY meet_groups_insert_policy ON meet_groups
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = auth.uid()
    )
  );

-- Coaches can update their team's meet groups
CREATE POLICY meet_groups_update_policy ON meet_groups
  FOR UPDATE
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = auth.uid()
    )
  );

-- Coaches can delete their team's meet groups
CREATE POLICY meet_groups_delete_policy ON meet_groups
  FOR DELETE
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = auth.uid()
    )
  );

-- RLS Policies for meet_group_races
-- Anyone who can see the meet group can see its races
CREATE POLICY meet_group_races_select_policy ON meet_group_races
  FOR SELECT
  USING (
    meet_group_id IN (
      SELECT id FROM meet_groups WHERE team_id IN (
        SELECT id FROM teams WHERE coach_uid = auth.uid()
      )
    )
  );

-- Coaches can add races to their team's meet groups
CREATE POLICY meet_group_races_insert_policy ON meet_group_races
  FOR INSERT
  WITH CHECK (
    meet_group_id IN (
      SELECT id FROM meet_groups WHERE team_id IN (
        SELECT id FROM teams WHERE coach_uid = auth.uid()
      )
    )
  );

-- Coaches can remove races from their team's meet groups
CREATE POLICY meet_group_races_delete_policy ON meet_group_races
  FOR DELETE
  USING (
    meet_group_id IN (
      SELECT id FROM meet_groups WHERE team_id IN (
        SELECT id FROM teams WHERE coach_uid = auth.uid()
      )
    )
  );
