-- Race Splits Table
-- Stores mile-by-mile split times for race results

CREATE TABLE IF NOT EXISTS race_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- Split times in seconds
  mile_1 FLOAT,
  mile_2 FLOAT,
  mile_3 FLOAT,
  
  -- Calculated cumulative times (for convenience)
  two_mile_time FLOAT GENERATED ALWAYS AS (mile_1 + mile_2) STORED,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(result_id),
  CHECK (mile_1 > 0),
  CHECK (mile_2 > 0),
  CHECK (mile_3 > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_race_splits_result ON race_splits(result_id);
CREATE INDEX IF NOT EXISTS idx_race_splits_athlete ON race_splits(athlete_id);
CREATE INDEX IF NOT EXISTS idx_race_splits_race ON race_splits(race_id);
CREATE INDEX IF NOT EXISTS idx_race_splits_team ON race_splits(team_id);

-- Enable Row Level Security
ALTER TABLE race_splits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view splits for their team"
  ON race_splits FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert splits for their team"
  ON race_splits FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "Coaches can update splits for their team"
  ON race_splits FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "Coaches can delete splits for their team"
  ON race_splits FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_race_splits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER race_splits_updated_at
  BEFORE UPDATE ON race_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_race_splits_updated_at();

-- Comments
COMMENT ON TABLE race_splits IS 'Mile-by-mile split times for race results';
COMMENT ON COLUMN race_splits.mile_1 IS 'First mile split time in seconds';
COMMENT ON COLUMN race_splits.mile_2 IS 'Second mile split time in seconds';
COMMENT ON COLUMN race_splits.mile_3 IS 'Third mile split time in seconds (finish - 2 mile)';
COMMENT ON COLUMN race_splits.two_mile_time IS 'Cumulative 2-mile time (mile_1 + mile_2)';
