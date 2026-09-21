import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { axiosInstance as api } from '@/api/axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ArrowUpDown, Download, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { gradeLabel, gradeLabelShort } from '@/lib/seasonUtils';
import { normalizeGender, genderLabel } from '@/lib/gender';
import { groupColumnsByMeet, distanceLabel } from '@/lib/resultsGridColumns';
import { toCsv, downloadCsv, dedupeColumnLabels } from '@/lib/csvParse';

interface GridData {
  // Objects, not names: a meet that ran two distances yields two columns
  // sharing a name (the scraper names every race after its meet), so the
  // distance is what tells them apart — and meetKey is what puts them back
  // under one heading. See lib/resultsGridColumns.ts.
  races: Array<{ name: string; meetKey: string; distanceMeters: number | null }>;
  athletes: {
    athleteId: string;
    name: string;
    grade: number;
    gender: string;
    results: (number | null)[];
  }[];
}

type SortField = 'name' | 'time' | null;
type SortDirection = 'asc' | 'desc';
type RaceIndex = number | null;

const formatTime = (timeInSeconds: number | null): string => {
  if (timeInSeconds === null || isNaN(timeInSeconds)) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};

interface ResultsGridPageProps {
  /** Rendered inside Season > Results Grid, which already supplies a
   *  heading and a Data actions row. Suppresses this page's own header and
   *  hands its export up instead of drawing a second button. */
  embedded?: boolean;
  /**
   * Bumped by the embedding page's Export CSV button. A signal DOWN, not
   * a handler UP: the first version handed `handleExportCsv` upward into
   * the parent's state, which meant a new function identity stored on
   * every render — setState on every render — an infinite loop (React
   * #185) that took the live site down. A number only changes when
   * someone clicks, so this cannot feed back.
   */
  exportSignal?: number;
}

const ResultsGridPage: React.FC<ResultsGridPageProps> = ({ embedded = false, exportSignal = 0 }) => {
  const { currentUser } = useAuth();
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { seasons: seasonList, activeYear, setSelectedYear } = useSeasonSelection();
  const seasons = useMemo(() => seasonList.map((s) => s.year), [seasonList]);
  const selectedSeason = activeYear;
  const setSelectedSeason = setSelectedYear;
  const [selectedGrades, setSelectedGrades] = useState<Set<number>>(new Set());
  const [selectedGenders, setSelectedGenders] = useState<Set<string>>(new Set(['M', 'F']));
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sortRaceIndex, setSortRaceIndex] = useState<RaceIndex>(null);
  // Which race the phone layout is showing. A grid of ten meets cannot be
  // read sideways on a 390px screen; below md this page shows one race at
  // a time (see SegmentedPills, built for exactly this) and the full table
  // from md up.
  const [mobileRaceIndex, setMobileRaceIndex] = useState(0);
  // Which meet the phone layout is on. Heats live UNDER a meet, so the
  // meet is what's picked first and a distance toggle only appears when
  // that meet actually ran more than one.
  const [mobileMeetIndex, setMobileMeetIndex] = useState(0);

  // Extract unique grades from the grid data
  const availableGrades = useMemo(() => {
    if (!gridData) return [];
    const grades = new Set<number>();
    gridData.athletes.forEach(athlete => {
      if (athlete.grade) grades.add(athlete.grade);
    });
    return Array.from(grades).sort((a, b) => b - a); // Sort descending (12, 11, 10, 9)
  }, [gridData]);

  // Extract unique genders from the grid data
  // Normalized, so a team storing both 'M' and 'Men' gets ONE Male chip
  // rather than one per spelling — see lib/gender.ts.
  const availableGenders = useMemo(() => {
    if (!gridData) return ['M', 'F'];
    const genders = new Set<string>();
    gridData.athletes.forEach((athlete) => {
      const key = normalizeGender(athlete.gender);
      if (key) genders.add(key);
    });
    if (genders.size === 0) return ['M', 'F'];
    return ['M', 'F'].filter((g) => genders.has(g));
  }, [gridData]);

  // Initialize selected grades when grades are loaded
  useEffect(() => {
    if (availableGrades.length > 0 && selectedGrades.size === 0) {
      setSelectedGrades(new Set(availableGrades));
    }
  }, [availableGrades, selectedGrades.size]);

  // Initialize selected genders when genders are loaded
  useEffect(() => {
    if (availableGenders.length > 0 && selectedGenders.size === 0) {
      setSelectedGenders(new Set(availableGenders));
    }
  }, [availableGenders, selectedGenders.size]);

  // Columns regrouped under their meet: heats of one distance were already
  // merged server-side, so more than one column here means more than one
  // distance, which is the only case that needs a toggle.
  const meetGroups = useMemo(
    () => (gridData ? groupColumnsByMeet(gridData.races) : []),
    [gridData]
  );

  // Filter and sort athletes based on selected criteria
  const processedAthletes = useMemo(() => {
    if (!gridData) return [];
    
    // Step 1: Filter by grade and gender
    let result = gridData.athletes.filter(athlete => {
      // Check if grade exists and is in selected grades
      const gradeMatch = athlete.grade && selectedGrades.has(athlete.grade);
      
      // Handle gender filtering - include athlete if they have no gender or their gender is selected
      let genderMatch = true;
      const genderKey = normalizeGender(athlete.gender);
      if (genderKey) {
        genderMatch = selectedGenders.has(genderKey);
      } else if (selectedGenders.size < availableGenders.length) {
        // If athlete has no gender and not all genders are selected, check if we should include them
        genderMatch = false; // Default to false if not all genders are selected and athlete has no gender
      }
      
      return gradeMatch && genderMatch;
    });
    
    // Step 2: Sort the filtered results
    if (sortField === 'name') {
      // Sort by athlete name
      result = [...result].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    } else if (sortField === 'time' && sortRaceIndex !== null) {
      // Sort by time for a specific race
      result = [...result].sort((a, b) => {
        const timeA = a.results[sortRaceIndex] || Infinity;
        const timeB = b.results[sortRaceIndex] || Infinity;
        const comparison = timeA - timeB;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    return result;
  }, [gridData, selectedGrades, selectedGenders, sortField, sortDirection, sortRaceIndex, availableGenders.length]);
  
  // Exports exactly what's on screen — the current grade/gender filters
  // and sort — not the whole season unfiltered, so a coach who narrowed
  // this down to "9th grade boys" gets a CSV of just that, not everyone.
  const handleExportCsv = () => {
    if (!gridData) return;
    // A meet that ran two distances produces two columns with the same
    // name, so the label has to carry the distance or the CSV has two
    // indistinguishable headers.
    const raceColumns = dedupeColumnLabels(
      gridData.races.map((race, index) =>
        meetGroups.find((g) => g.columns.some((c) => c.index === index))?.hasHeats
          ? `${race.name} (${distanceLabel(race.distanceMeters)})`
          : race.name
      )
    );
    const csv = toCsv(
      ['Athlete', 'Grade', 'Gender', ...raceColumns],
      processedAthletes.map((athlete) => {
        const row: Record<string, string> = {
          Athlete: athlete.name,
          Grade: athlete.grade ? gradeLabelShort(athlete.grade) : '',
          Gender: athlete.gender ?? '',
        };
        raceColumns.forEach((column, index) => {
          const time = athlete.results[index];
          row[column] = time ? formatTime(time) : '';
        });
        return row;
      })
    );
    downloadCsv(`results-grid-${selectedSeason ?? 'season'}.csv`, csv);
  };

  // Function to toggle sort direction or set a new sort field
  const handleSort = (field: SortField, raceIndex: RaceIndex = null) => {
    if (sortField === field && raceIndex === sortRaceIndex) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort field and reset to ascending
      setSortField(field);
      setSortRaceIndex(raceIndex);
      setSortDirection('asc');
    }
  };
  
  // Helper function to render sort indicators
  const renderSortIndicator = (field: SortField, raceIndex: RaceIndex = null) => {
    if (sortField !== field || (field === 'time' && sortRaceIndex !== raceIndex)) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="ml-1 h-4 w-4" /> : 
      <ChevronDown className="ml-1 h-4 w-4" />;
  };

  // Fetch grid data when selected season changes
  useEffect(() => {
    // @ts-expect-error - team.id exists in runtime but not in type definition
    const teamId = currentUser?.team?.id || currentUser?.team_id;
    if (selectedSeason && teamId) {
      const fetchGridData = async () => {
        try {
          setLoading(true);
          const response = await api.get(`/teams/results-grid?seasons=${selectedSeason}`);
          setGridData(response.data);
          setError(null);
        } catch (error: unknown) {
          console.error('Failed to fetch results grid', error);
          const errorMessage = error instanceof Error ? error.message : 
            typeof error === 'object' && error !== null && 'response' in error && 
            typeof error.response === 'object' && error.response !== null && 
            'data' in error.response && typeof error.response.data === 'object' && 
            error.response.data !== null && 'message' in error.response.data ? 
            String(error.response.data.message) : 'Failed to load results.';
          
          setError(`Failed to load results: ${errorMessage}`);
          toast.error(`Failed to load results: ${errorMessage}`);
        } finally {
          setLoading(false);
        }
      };
      fetchGridData();
    } else if (currentUser) {
      // If there's a user but no team or no season selected
      setLoading(false);
      if (seasons.length === 0) {
        setError('No data available for the selected season.');
      } else {
        setError('Please select a season.');
      }
    }
  }, [currentUser, selectedSeason, seasons]);

  // Runs when the embedding page's Export CSV button is pressed. Depends
  // ONLY on the signal: handleExportCsv is recreated every render, and
  // depending on it here would fire the download on every render instead.
  const exportRef = useRef(handleExportCsv);
  exportRef.current = handleExportCsv;
  useEffect(() => {
    if (exportSignal > 0) exportRef.current();
  }, [exportSignal]);

  // Every state gets the page header. Loading and empty used to render a
  // bare <div>, so the screen appeared to have no identity of its own —
  // part of why this page read as something embedded in another view.
  const header = embedded ? null : (
    <PageHeader
      section="season"
      icon={LayoutGrid}
      title="Results Grid"
      description="Every athlete's time at every meet this season, side by side."
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">Loading results…</CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      </div>
    );
  }

  if (!gridData || gridData.athletes.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-10 text-center">
            <p className="text-sm text-muted-foreground">No results for this season yet.</p>
            {/* The one place a season control still earns its keep: there
                is nothing to show, so offering the seasons that do have
                data is the way out rather than a duplicate of the header
                picker. */}
            {seasons.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2">
                {seasons.map((season) => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => setSelectedSeason(season)}
                    className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 ${
                      selectedSeason === season
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {season}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const safeRaceIndex = Math.min(mobileRaceIndex, Math.max(0, gridData.races.length - 1));
  const safeMeetIndex = Math.min(mobileMeetIndex, Math.max(0, meetGroups.length - 1));
  const activeMeet = meetGroups[safeMeetIndex] ?? null;
  // Selecting a meet selects its first heat; switching heats moves within
  // it. Keeping the column index as the source of truth means everything
  // downstream still reads one column, heats or not.
  const activeColumnIndex = activeMeet
    ? (activeMeet.columns.find((c) => c.index === safeRaceIndex)?.index ?? activeMeet.columns[0].index)
    : safeRaceIndex;

  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // One chip style for every filter on this page. Small on purpose: these
  // annotate the grid, they are not the grid.
  // 44px tall and 14px type: these were 10px pills in a 24px box, which is
  // under every mobile platform's minimum target and hard to read on a
  // field in daylight.
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-background text-foreground hover:bg-accent'
    }`;

  return (
    <div className="space-y-4">
      {/* A page, not a card floating inside one. This screen opened with a
          bare <Card> carrying a CardTitle while every other screen opens
          with PageHeader, which is why it read as something nested inside
          another view. */}
      {!embedded && (
        <PageHeader
          section="season"
          icon={LayoutGrid}
          title="Results Grid"
          description="Every athlete's time at every meet this season, side by side."
          actions={
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={processedAthletes.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          }
        />
      )}

      {/* The season picker that used to sit here was a third copy of the
          one in the app header, writing the same SeasonContext — same
          state, three controls. Filters are what belongs on the page.
          Short grade labels (Fr/So/Jr/Sr) and no "Filter by …:" prose, so
          the whole set fits one or two rows on a phone instead of three
          labelled rows. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {availableGrades.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={chip(selectedGrades.size === availableGrades.length)}
              onClick={() => setSelectedGrades(new Set(availableGrades))}
            >
              All
            </button>
            {availableGrades.map((grade) => (
              <button
                key={grade}
                type="button"
                className={chip(selectedGrades.has(grade))}
                onClick={() => setSelectedGrades(toggleIn(selectedGrades, grade))}
                title={gradeLabel(grade)}
              >
                {gradeLabelShort(grade)}
              </button>
            ))}
          </div>
        )}

        {availableGenders.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {availableGenders.map((gender) => (
              <button
                key={gender}
                type="button"
                className={chip(selectedGenders.has(gender))}
                onClick={() => setSelectedGenders(toggleIn(selectedGenders, gender))}
              >
                {genderLabel(gender)}
              </button>
            ))}
          </div>
        )}

        <span className="text-sm text-muted-foreground">
          {processedAthletes.length} athlete{processedAthletes.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* --- Phone: one race at a time ------------------------------- */}
      <div className="space-y-3 md:hidden">
        {/* A pill per meet was fine for three and unusable by ten — a
            full-season grid is a dozen meets, which is four rows of pills
            before a single time is on screen. A dropdown is one row at any
            count, and the arrows keep meet-to-meet stepping a single tap
            rather than open-scan-pick. */}
        {/* Meet first. Heats live under a meet, so a meet that ran one
            distance shows no toggle at all — which is most of them. */}
        {meetGroups.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Previous meet"
              disabled={safeMeetIndex === 0}
              onClick={() => {
                setMobileMeetIndex(safeMeetIndex - 1);
                setMobileRaceIndex(meetGroups[safeMeetIndex - 1].columns[0].index);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={String(safeMeetIndex)}
              onValueChange={(v) => {
                const next = Number(v);
                setMobileMeetIndex(next);
                setMobileRaceIndex(meetGroups[next].columns[0].index);
              }}
            >
              <SelectTrigger className="h-11 min-w-0 flex-1" aria-label="Meet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meetGroups.map((group, index) => (
                  <SelectItem key={group.meetKey} value={String(index)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Next meet"
              disabled={safeMeetIndex >= meetGroups.length - 1}
              onClick={() => {
                setMobileMeetIndex(safeMeetIndex + 1);
                setMobileRaceIndex(meetGroups[safeMeetIndex + 1].columns[0].index);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {activeMeet?.hasHeats && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">Heats</span>
            {activeMeet.columns.map(({ index, column }) => (
              <button
                key={index}
                type="button"
                className={chip(index === activeColumnIndex)}
                onClick={() => setMobileRaceIndex(index)}
              >
                {distanceLabel(column.distanceMeters)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Sort</span>
          <button type="button" className={chip(sortField === 'name')} onClick={() => handleSort('name')}>
            Name {renderSortIndicator('name')}
          </button>
          <button
            type="button"
            className={chip(sortField === 'time' && sortRaceIndex === activeColumnIndex)}
            onClick={() => handleSort('time', activeColumnIndex)}
          >
            Time {renderSortIndicator('time', activeColumnIndex)}
          </button>
        </div>

        <Card>
          <CardContent className="divide-y p-0">
            {processedAthletes.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No athletes match the selected filters
              </p>
            ) : (
              processedAthletes.map((athlete) => (
                <div key={athlete.athleteId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold leading-tight">{athlete.name}</p>
                    <p className="text-sm text-muted-foreground">{gradeLabelShort(athlete.grade)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-lg font-medium tabular-nums">
                    {athlete.results[activeColumnIndex] ? formatTime(athlete.results[activeColumnIndex]) : '—'}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

      </div>

      {/* --- md and up: the full grid -------------------------------- */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="sticky left-0 z-10 min-w-[12rem] cursor-pointer bg-card"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Athlete {renderSortIndicator('name')}
                  </div>
                </TableHead>
                {gridData.races.map((race, index) => {
                  // The distance appears only where it distinguishes
                  // something — a meet with one distance would just be
                  // repeating itself in every header.
                  const isHeat = meetGroups.find((g) => g.columns.some((c) => c.index === index))?.hasHeats;
                  return (
                    <TableHead
                      key={index}
                      className="cursor-pointer"
                      onClick={() => handleSort('time', index)}
                      title={isHeat ? `${race.name} — ${distanceLabel(race.distanceMeters)}` : race.name}
                    >
                      <div className="flex items-center">
                        <span className="max-w-[10rem] truncate">
                          {race.name}
                          {isHeat && (
                            <span className="ml-1 font-normal text-muted-foreground">
                              {distanceLabel(race.distanceMeters)}
                            </span>
                          )}
                        </span>
                        {renderSortIndicator('time', index)}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedAthletes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={gridData.races.length + 1} className="py-4 text-center">
                    No athletes match the selected filters
                  </TableCell>
                </TableRow>
              ) : (
                processedAthletes.map((athlete) => (
                  <TableRow key={athlete.athleteId}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">
                      {athlete.name} ({gradeLabelShort(athlete.grade)})
                    </TableCell>
                    {athlete.results.map((time, index) => (
                      <TableCell key={index} className="font-mono tabular-nums">
                        {time ? formatTime(time) : '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResultsGridPage;
