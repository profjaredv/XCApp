import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { axiosInstance } from '@/api/axios';
import { useAuth } from '@/contexts/AuthContext';
import { gradeLabel } from '@/lib/seasonUtils';

// Format time helper
const formatTime = (timeInSeconds: number): string => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};

// Course difficulty is a pace GAP (sec/mile), not a pace itself — signed,
// small in magnitude, and needs its own +/- reading, unlike formatTime.
// Within ±3 sec/mile reads as noise, not a real signal either way.
const formatDifficulty = (secPerMile: number | null): string => {
  if (secPerMile == null) return 'Not enough data yet';
  if (Math.abs(secPerMile) < 3) return 'About average';
  const rounded = Math.round(Math.abs(secPerMile));
  return secPerMile > 0 ? `+${rounded} sec/mi harder` : `-${rounded} sec/mi easier`;
};

interface RaceComparisonTabProps {
  teamId: string;
}

interface MultiSeasonMeet {
  meetName: string;
  alternateNames: string[];
  seasons: number[];
}

interface GenderStats {
  count: number;
  avgTime: number;
  avgPace: number;
  avgPlace: number | null;
  fastestTime: number;
  top10AvgTime: number;
  top10AvgPace: number;
  top10Count: number;
}

interface SeasonStats {
  season: number;
  raceDate: string;
  boys: GenderStats | null;
  girls: GenderStats | null;
  team: GenderStats;
}

interface MeetComparison {
  meetName: string;
  seasons: SeasonStats[];
}

interface AthleteResult {
  season: number;
  raceDate: string;
  time: number;
  pace: number;
  place: number;
}

interface AthleteData {
  athleteId: string;
  meetName: string;
  results: AthleteResult[];
}

interface Athlete {
  id: string;
  name: string;
  preferredName?: string | null;
  grade: string;
  gender: string;
}

interface TopSevenEntry {
  athleteId: string;
  athleteName: string;
  paceAtRace: number;
  baselinePace: number | null;
  deltaSecPerMile: number | null;
}

interface SeasonDifficulty {
  season: number;
  raceDate: string;
  difficultySecPerMile: number | null;
  contributingCount: number;
  topSeven: TopSevenEntry[];
}

interface CourseDifficulty {
  meetName: string;
  courseDifficultySecPerMile: number | null;
  seasons: SeasonDifficulty[];
}

type MetricType = 'avgTime' | 'avgPace' | 'top10AvgTime' | 'fastestTime';

export function RaceComparisonTab({ teamId }: RaceComparisonTabProps) {
  const { getFreshToken } = useAuth();
  
  // State
  const [multiSeasonMeets, setMultiSeasonMeets] = useState<MultiSeasonMeet[]>([]);
  const [selectedMeet, setSelectedMeet] = useState<string>('');
  const [meetComparison, setMeetComparison] = useState<MeetComparison | null>(null);
  const [courseDifficulty, setCourseDifficulty] = useState<CourseDifficulty | null>(null);
  const [isLoadingDifficulty, setIsLoadingDifficulty] = useState(false);
  const [eligibleAthletes, setEligibleAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [athleteData, setAthleteData] = useState<AthleteData | null>(null);
  
  const [isLoadingMeets, setIsLoadingMeets] = useState(true);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isLoadingAthletes, setIsLoadingAthletes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Metric and toggle state
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('avgTime');
  const [showTeam, setShowTeam] = useState(true);
  const [showBoys, setShowBoys] = useState(false);
  const [showGirls, setShowGirls] = useState(false);
  const [showAthlete, setShowAthlete] = useState(false);

  // Fetch multi-season meets
  useEffect(() => {
    const fetchMultiSeasonMeets = async () => {
      try {
        setIsLoadingMeets(true);
        setError(null);
        const token = await getFreshToken();
        const response = await axiosInstance.get(`/enhanced-performance/multi-season-meets`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMultiSeasonMeets(response.data.data || []);
      } catch (err) {
        console.error('Error fetching multi-season meets:', err);
        setError('Failed to load meets');
      } finally {
        setIsLoadingMeets(false);
      }
    };

    if (teamId) {
      fetchMultiSeasonMeets();
    }
  }, [teamId, getFreshToken]);

  // Fetch eligible athletes
  useEffect(() => {
    const fetchEligibleAthletes = async () => {
      try {
        setIsLoadingAthletes(true);
        const token = await getFreshToken();
        const response = await axiosInstance.get(`/enhanced-performance/eligible-athletes`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEligibleAthletes(response.data.data || []);
      } catch (err) {
        console.error('Error fetching eligible athletes:', err);
      } finally {
        setIsLoadingAthletes(false);
      }
    };

    if (teamId) {
      fetchEligibleAthletes();
    }
  }, [teamId, getFreshToken]);

  // Fetch meet comparison when meet is selected
  useEffect(() => {
    const fetchMeetComparison = async () => {
      if (!selectedMeet) {
        setMeetComparison(null);
        return;
      }

      try {
        setIsLoadingComparison(true);
        setError(null);
        const token = await getFreshToken();
        const encodedMeetName = encodeURIComponent(selectedMeet);
        const response = await axiosInstance.get(`/enhanced-performance/meet-comparison/${encodedMeetName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMeetComparison(response.data.data);
      } catch (err) {
        console.error('Error fetching meet comparison:', err);
        // Don't show error for 404, might not be implemented yet
        if (err instanceof Error && err.message.includes('404')) {
          setError(null);
        } else {
          setError('Failed to load meet comparison');
        }
      } finally {
        setIsLoadingComparison(false);
      }
    };

    fetchMeetComparison();
  }, [selectedMeet, teamId, getFreshToken]);

  // Fetch course difficulty alongside the comparison — separate request
  // since it's a materially different (athlete-relative) computation, not
  // just another metric on the same season stats.
  useEffect(() => {
    const fetchCourseDifficulty = async () => {
      if (!selectedMeet) {
        setCourseDifficulty(null);
        return;
      }

      try {
        setIsLoadingDifficulty(true);
        const token = await getFreshToken();
        const encodedMeetName = encodeURIComponent(selectedMeet);
        const response = await axiosInstance.get(`/enhanced-performance/course-difficulty/${encodedMeetName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourseDifficulty(response.data.data);
      } catch (err) {
        console.error('Error fetching course difficulty:', err);
        setCourseDifficulty(null);
      } finally {
        setIsLoadingDifficulty(false);
      }
    };

    fetchCourseDifficulty();
  }, [selectedMeet, teamId, getFreshToken]);

  // Fetch athlete data when athlete is selected
  useEffect(() => {
    const fetchAthleteData = async () => {
      if (!selectedAthlete || !selectedMeet) {
        setAthleteData(null);
        return;
      }

      try {
        const token = await getFreshToken();
        const encodedMeetName = encodeURIComponent(selectedMeet);
        const response = await axiosInstance.get(`/enhanced-performance/meet-athlete/${encodedMeetName}/${selectedAthlete}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAthleteData(response.data.data);
      } catch (err) {
        console.error('Error fetching athlete data:', err);
      }
    };

    if (showAthlete) {
      fetchAthleteData();
    }
  }, [selectedAthlete, selectedMeet, teamId, showAthlete, getFreshToken]);

  // Prepare chart data
  const getChartData = () => {
    if (!meetComparison) return [];
    
    return meetComparison.seasons.map(season => {
      const dataPoint: Record<string, number> = { season: season.season };
      
      // Add team data
      if (showTeam && season.team) {
        if (selectedMetric === 'avgTime') dataPoint.Team = season.team.avgTime;
        else if (selectedMetric === 'avgPace') dataPoint.Team = season.team.avgPace;
        else if (selectedMetric === 'top10AvgTime') dataPoint.Team = season.team.top10AvgTime;
        else if (selectedMetric === 'fastestTime') dataPoint.Team = season.team.fastestTime;
      }
      
      // Add boys data
      if (showBoys && season.boys) {
        if (selectedMetric === 'avgTime') dataPoint.Boys = season.boys.avgTime;
        else if (selectedMetric === 'avgPace') dataPoint.Boys = season.boys.avgPace;
        else if (selectedMetric === 'top10AvgTime') dataPoint.Boys = season.boys.top10AvgTime;
        else if (selectedMetric === 'fastestTime') dataPoint.Boys = season.boys.fastestTime;
      }
      
      // Add girls data
      if (showGirls && season.girls) {
        if (selectedMetric === 'avgTime') dataPoint.Girls = season.girls.avgTime;
        else if (selectedMetric === 'avgPace') dataPoint.Girls = season.girls.avgPace;
        else if (selectedMetric === 'top10AvgTime') dataPoint.Girls = season.girls.top10AvgTime;
        else if (selectedMetric === 'fastestTime') dataPoint.Girls = season.girls.fastestTime;
      }
      
      // Add athlete data
      if (showAthlete && athleteData) {
        const athleteResult = athleteData.results.find(r => r.season === season.season);
        if (athleteResult) {
          if (selectedMetric === 'avgTime' || selectedMetric === 'fastestTime') {
            dataPoint.Athlete = athleteResult.time;
          } else if (selectedMetric === 'avgPace') {
            dataPoint.Athlete = athleteResult.pace;
          }
        }
      }
      
      return dataPoint;
    });
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'avgTime': return 'Average Finish Time';
      case 'avgPace': return 'Average Pace';
      case 'top10AvgTime': return 'Average Top 10 Finish Times';
      case 'fastestTime': return 'Fastest Time';
      default: return '';
    }
  };

  const getYAxisFormatter = () => {
    if (selectedMetric === 'avgPace') {
      return (value: number) => formatTime(value) + '/mi';
    }
    return (value: number) => formatTime(value);
  };

  const selectedAthleteEntry = eligibleAthletes.find(a => a.id === selectedAthlete);
  const selectedAthleteName = selectedAthleteEntry ? (selectedAthleteEntry.preferredName || selectedAthleteEntry.name) : '';

  return (
    <div className="space-y-6">
      {/* Meet Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Meet</CardTitle>
          <CardDescription>Choose a meet that your team has attended in multiple seasons</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMeets ? (
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading meets...</span>
            </div>
          ) : multiSeasonMeets.length === 0 ? (
            <Alert>
              <AlertDescription>
                No recurring meets found. Your team needs to attend the same meet in at least 2 different seasons.
              </AlertDescription>
            </Alert>
          ) : (
            <Select value={selectedMeet} onValueChange={setSelectedMeet}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a meet to compare..." />
              </SelectTrigger>
              <SelectContent>
                {multiSeasonMeets.map((meet) => (
                  <SelectItem key={meet.meetName} value={meet.meetName}>
                    <div className="flex flex-col">
                      <span>{meet.meetName} ({meet.seasons.join(', ')})</span>
                      {meet.alternateNames.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Also: {meet.alternateNames.join(', ')}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedMeet && (
        <Card>
          <CardHeader>
            <CardTitle>Course Difficulty</CardTitle>
            <CardDescription>
              Top 7 team finishers' pace at {selectedMeet}, compared to their own average pace at other meets that
              same season — isolates the course from just who happened to run that day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDifficulty ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Calculating…</span>
              </div>
            ) : !courseDifficulty || courseDifficulty.seasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No finished results here yet.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-2xl font-bold">{formatDifficulty(courseDifficulty.courseDifficultySecPerMile)}</p>
                <div className="space-y-2">
                  {courseDifficulty.seasons.map((s) => (
                    <div key={s.season} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.season}</span>
                        <span className="text-muted-foreground">{formatDifficulty(s.difficultySecPerMile)}</span>
                      </div>
                      {s.contributingCount > 0 ? (
                        <>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Based on {s.contributingCount} of the top {s.topSeven.length} finishers who had another race that season to compare against.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {s.topSeven.map((t) => (
                              <span key={t.athleteId}>
                                {t.athleteName}
                                {t.deltaSecPerMile != null
                                  ? `: ${t.deltaSecPerMile > 0 ? '+' : ''}${Math.round(t.deltaSecPerMile)}s/mi`
                                  : ': no baseline yet'}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          None of the top {s.topSeven.length} finishers had another race that season yet to compare against.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoadingComparison && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading comparison...</span>
        </div>
      )}

      {meetComparison && !isLoadingComparison && (
        <div className="space-y-6">
          {/* Metric Selector and Display Options Combined */}
          <Card>
            <CardHeader>
              <CardTitle>Chart Configuration</CardTitle>
              <CardDescription>Choose metric and toggle which lines to display</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Metric Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric</label>
                  <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avgTime">Average Finish Time</SelectItem>
                      <SelectItem value="avgPace">Average Pace</SelectItem>
                      <SelectItem value="top10AvgTime">Average Top 10 Finish Times</SelectItem>
                      <SelectItem value="fastestTime">Fastest Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Display Options */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Options</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={showTeam ? "default" : "outline"}
                      onClick={() => setShowTeam(!showTeam)}
                      className={showTeam ? "bg-purple-600 hover:bg-purple-700" : ""}
                    >
                      Entire Team
                    </Button>
                    <Button
                      variant={showBoys ? "default" : "outline"}
                      onClick={() => setShowBoys(!showBoys)}
                      className={showBoys ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                      Boys
                    </Button>
                    <Button
                      variant={showGirls ? "default" : "outline"}
                      onClick={() => setShowGirls(!showGirls)}
                      className={showGirls ? "bg-pink-600 hover:bg-pink-700" : ""}
                    >
                      Girls
                    </Button>
                    <Button
                      variant={showAthlete ? "default" : "outline"}
                      onClick={() => setShowAthlete(!showAthlete)}
                      className={showAthlete ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      Specific Athlete
                    </Button>
                  </div>
                </div>
              </div>

              {/* Athlete Selector */}
              {showAthlete && (
                <div className="mt-4">
                  {isLoadingAthletes ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading athletes...</span>
                    </div>
                  ) : (
                    <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose an athlete..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleAthletes.map((athlete) => (
                          <SelectItem key={athlete.id} value={athlete.id}>
                            {athlete.preferredName || athlete.name} ({gradeLabel(Number(athlete.grade))})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{getMetricLabel()}</CardTitle>
              <CardDescription>Performance across seasons at {meetComparison.meetName}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={getChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis tickFormatter={getYAxisFormatter()} />
                  <Tooltip formatter={(value) => {
                    const formatted = formatTime(value as number);
                    return selectedMetric === 'avgPace' ? formatted + '/mi' : formatted;
                  }} />
                  <Legend />
                  {showTeam && <Line type="monotone" dataKey="Team" stroke="#8b5cf6" strokeWidth={3} name="Team" connectNulls />}
                  {showBoys && <Line type="monotone" dataKey="Boys" stroke="#3b82f6" strokeWidth={2} name="Boys" connectNulls />}
                  {showGirls && <Line type="monotone" dataKey="Girls" stroke="#ec4899" strokeWidth={2} name="Girls" connectNulls />}
                  {showAthlete && selectedAthlete && (
                    <Line 
                      type="monotone" 
                      dataKey="Athlete" 
                      stroke="#10b981" 
                      strokeWidth={2} 
                      name={selectedAthleteName} 
                      connectNulls 
                    />
                  )}
                  {selectedMetric === 'top10AvgTime' && showTeam && (
                    <Line 
                      type="monotone" 
                      dataKey="Team" 
                      stroke="#f59e0b" 
                      strokeWidth={3} 
                      name="Top 10 Avg" 
                      connectNulls 
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
