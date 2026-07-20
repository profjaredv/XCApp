import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { axiosInstance as api } from '@/api/axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';

interface GridData {
  races: string[];
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

const ResultsGridPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedGrades, setSelectedGrades] = useState<Set<number>>(new Set());
  const [selectedGenders, setSelectedGenders] = useState<Set<string>>(new Set(['M', 'F']));
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sortRaceIndex, setSortRaceIndex] = useState<RaceIndex>(null);

  // Fetch available seasons
  useEffect(() => {
    // @ts-expect-error - team.id exists in runtime but not in type definition
    const teamId = currentUser?.team?.id || currentUser?.team_id;
    if (teamId) {
      api.get('/teams/seasons')
        .then((response: { data: number[] }) => {
          setSeasons(response.data);
          if (response.data.length > 0) {
            setSelectedSeason(response.data[0]); // Select the most recent season by default
          }
        })
        .catch((err: unknown) => {
          console.error('Failed to fetch seasons', err);
          setError('Failed to load available seasons.');
        });
    }
  }, [currentUser]);

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
  const availableGenders = useMemo(() => {
    if (!gridData) return ['M', 'F'];
    const genders = new Set<string>();
    gridData.athletes.forEach(athlete => {
      if (athlete.gender) genders.add(athlete.gender);
    });
    // If no genders found in data, default to M and F
    if (genders.size === 0) {
      return ['M', 'F'];
    }
    return Array.from(genders);
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

  // Filter and sort athletes based on selected criteria
  const processedAthletes = useMemo(() => {
    if (!gridData) return [];
    
    console.log('Processing athletes with data:', gridData);
    console.log('Selected grades:', Array.from(selectedGrades));
    console.log('Selected genders:', Array.from(selectedGenders));
    
    // Step 1: Filter by grade and gender
    let result = gridData.athletes.filter(athlete => {
      // Check if grade exists and is in selected grades
      const gradeMatch = athlete.grade && selectedGrades.has(athlete.grade);
      
      // Handle gender filtering - include athlete if they have no gender or their gender is selected
      let genderMatch = true;
      if (athlete.gender) {
        genderMatch = selectedGenders.has(athlete.gender);
      } else if (selectedGenders.size < availableGenders.length) {
        // If athlete has no gender and not all genders are selected, check if we should include them
        genderMatch = false; // Default to false if not all genders are selected and athlete has no gender
      }
      
      return gradeMatch && genderMatch;
    });
    
    console.log('Filtered athletes:', result);
    
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

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!gridData || gridData.athletes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <p>No results found for the selected season.</p>
        {seasons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {seasons.map((season) => (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={`px-3 py-1 rounded-md ${
                  selectedSeason === season
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {season}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <CardTitle>Results Grid</CardTitle>
            {seasons.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Season:</span>
                <select
                  className="border rounded-md px-2 py-1 text-sm"
                  value={selectedSeason || ''}
                  onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                >
                  {seasons.map((season) => (
                    <option key={season} value={season}>
                      {season}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          {/* Grade Filter */}
          {availableGrades.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Filter by Grade:</span>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGrades(new Set(availableGrades))}
                  className={`text-xs ${selectedGrades.size === availableGrades.length ? 'bg-blue-100' : ''}`}
                >
                  All Grades
                </Button>
                {availableGrades.map((grade) => (
                  <Button
                    key={grade}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newSelected = new Set(selectedGrades);
                      if (newSelected.has(grade)) {
                        newSelected.delete(grade);
                      } else {
                        newSelected.add(grade);
                      }
                      setSelectedGrades(newSelected);
                    }}
                    className={`text-xs ${selectedGrades.has(grade) ? 'bg-blue-100' : ''}`}
                  >
                    Grade {grade}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Gender Filter */}
          {availableGenders.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Filter by Gender:</span>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGenders(new Set(availableGenders))}
                  className={`text-xs ${selectedGenders.size === availableGenders.length ? 'bg-blue-100' : ''}`}
                >
                  All Genders
                </Button>
                {availableGenders.map((gender) => (
                  <Button
                    key={gender}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newSelected = new Set(selectedGenders);
                      if (newSelected.has(gender)) {
                        newSelected.delete(gender);
                      } else {
                        newSelected.add(gender);
                      }
                      setSelectedGenders(newSelected);
                    }}
                    className={`text-xs ${selectedGenders.has(gender) ? 'bg-blue-100' : ''}`}
                  >
                    {gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : gender}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Sort by:</span>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSort('name')}
                className={`text-xs flex items-center ${sortField === 'name' ? 'bg-blue-100' : ''}`}
              >
                Name {renderSortIndicator('name')}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="sticky left-0 bg-white z-10 cursor-pointer"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  Athlete {renderSortIndicator('name')}
                </div>
              </TableHead>
              {gridData.races.map((raceName, index) => (
                <TableHead 
                  key={index} 
                  className="cursor-pointer"
                  onClick={() => handleSort('time', index)}
                >
                  <div className="flex items-center">
                    {raceName} {renderSortIndicator('time', index)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedAthletes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={gridData.races.length + 1} className="text-center py-4">
                  No athletes match the selected filters
                </TableCell>
              </TableRow>
            ) : (
              processedAthletes.map((athlete) => (
                <TableRow key={athlete.athleteId}>
                  <TableCell className="sticky left-0 bg-white z-10 font-medium">
                    {athlete.name} ({athlete.grade})
                  </TableCell>
                  {athlete.results.map((time, index) => (
                    <TableCell key={index}>
                      {time ? formatTime(time) : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ResultsGridPage;
