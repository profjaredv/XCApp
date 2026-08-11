import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { axiosInstance as api } from '@/api/axios';
import { formatTime, formatPace } from '../../lib/formatUtils';
import { trainingPacesFromRace, type TrainingPaceZone } from '../../lib/vdotPaces';
import { Calculator, TrendingUp, User, Clock, Target, Gauge } from 'lucide-react';
import { toast } from 'sonner';

interface Athlete {
  id: string;
  name: string;
  grade?: number;
  gender?: 'Men' | 'Women';
}

interface RecentRace {
  id: string;
  raceName: string;
  date: string;
  distance: number;
  time: number;
}

const VDOTCalculator: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('calculator');
  
  // Calculator state
  const [inputTime, setInputTime] = useState('');
  const [inputDistance, setInputDistance] = useState('5k');
  const [predictedTimes, setPredictedTimes] = useState<Record<string, number>>({});
  
  // Athlete data state
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [recentRaces, setRecentRaces] = useState<RecentRace[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [athletePredictions, setAthletePredictions] = useState<Record<string, number>>({});
  const [trainingPaces, setTrainingPaces] = useState<TrainingPaceZone[]>([]);
  const [vdotScore, setVdotScore] = useState<number | null>(null);
  const [athleteTrainingPaces, setAthleteTrainingPaces] = useState<TrainingPaceZone[]>([]);
  const [athleteVdotScore, setAthleteVdotScore] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAthletes, setIsLoadingAthletes] = useState(false);

  // Fetch athletes for current team
  useEffect(() => {
    const fetchAthletes = async () => {
      if (!currentUser?.team?.id) return;
      
      setIsLoadingAthletes(true);
      try {
        // No season param: the server resolves the team's actual active
        // season (accounting for imported data). Hardcoding the calendar
        // year here returned an empty list for most of the year.
        const response = await api.get('/athletes');
        setAthletes(response.data.slice(0, 50)); // Limit to 50 for performance
      } catch (error) {
        console.error('Error fetching athletes:', error);
        toast.error('Failed to load athletes');
      } finally {
        setIsLoadingAthletes(false);
      }
    };

    fetchAthletes();
  }, [currentUser]);

  // Fetch recent races for selected athlete
  useEffect(() => {
    const fetchRecentRaces = async () => {
      if (!selectedAthlete) {
        setRecentRaces([]);
        return;
      }
      
      setIsLoading(true);
      try {
        const response = await api.get(`/athletes/${selectedAthlete}/races?limit=5&sort=date:desc`);
        setRecentRaces(response.data);
        setSelectedRace(''); // Reset selected race when athlete changes
      } catch (error) {
        console.error('Error fetching races:', error);
        toast.error('Failed to load races');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentRaces();
  }, [selectedAthlete]);

  // Simple VDOT-based prediction calculations
  const calculatePredictions = (timeInSeconds: number, sourceDistance: string) => {
    // Get source distance in miles
    const sourceDist = distances.find(d => d.value === sourceDistance)?.miles || 3.1;
    
    // Calculate predictions for each distance using Riegel's formula
    // T2 = T1 * (D2/D1) ^ 1.06 where 1.06 is the fatigue factor
    const predictions: Record<string, number> = {};
    
    distances.forEach(dist => {
      const timeRatio = Math.pow(dist.miles / sourceDist, 1.06);
      predictions[dist.value] = timeInSeconds * timeRatio;
    });
    
    return predictions;
  };

  // Calculate predictions from manual input
  const calculateFromInput = () => {
    if (!inputTime || !inputDistance) return;
    
    const timeInSeconds = parseTimeToSeconds(inputTime);
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) {
      toast.error('Please enter a valid time');
      return;
    }
    
    setIsLoading(true);

    // Simulate API delay for better UX
    setTimeout(() => {
      const predictions = calculatePredictions(timeInSeconds, inputDistance);
      setPredictedTimes(predictions);
      const sourceDist = distances.find(d => d.value === inputDistance)?.miles || 3.1;
      const paceResult = trainingPacesFromRace(sourceDist, timeInSeconds);
      setTrainingPaces(paceResult?.paces ?? []);
      setVdotScore(paceResult?.vdot ?? null);
      setActiveTab('predictions');
      setIsLoading(false);
    }, 500);
  };

  // Calculate predictions from athlete's race
  const calculateFromAthleteRace = () => {
    if (!selectedRace) return;
    
    const race = recentRaces.find(r => r.id === selectedRace);
    if (!race) return;
    
    setIsLoading(true);

    // Simulate API delay for better UX
    setTimeout(() => {
      const predictions = calculatePredictions(race.time, getDistanceKey(race.distance));
      setAthletePredictions(predictions);
      const paceResult = trainingPacesFromRace(race.distance, race.time);
      setAthleteTrainingPaces(paceResult?.paces ?? []);
      setAthleteVdotScore(paceResult?.vdot ?? null);
      setActiveTab('predictions');
      setIsLoading(false);
    }, 500);
  };

  // Helper functions
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
  };

  const getDistanceKey = (miles: number): string => {
    if (miles >= 3.0) return '5k';
    if (miles >= 2.5) return '3mile';
    if (miles >= 1.25) return '1.5mile';
    return '1mile';
  };

  const distances = [
    { value: '1mile', label: '1 Mile', miles: 1.0 },
    { value: '1.5mile', label: '1.5 Mile', miles: 1.5 },
    { value: '3mile', label: '3 Mile', miles: 3.0 },
    { value: '5k', label: '5K', miles: 3.1 },
    { value: '8k', label: '8K', miles: 5.0 },
    { value: '10k', label: '10K', miles: 6.2 }
  ];

  const renderTrainingPaces = (paces: TrainingPaceZone[], vdot: number | null, title: string) => {
    if (paces.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{title}</h3>
          {vdot !== null && (
            <span className="text-xs text-muted-foreground">(VDOT ~{vdot.toFixed(1)})</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {paces.map((zone) => (
            <Card key={zone.key}>
              <CardContent className="p-4">
                <p className="font-medium">{zone.label}</p>
                <p className="text-xl font-bold text-primary">{formatPace(zone.paceSecPerMile)}</p>
                <p className="text-xs text-muted-foreground">{zone.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const renderPredictions = (predictions: Record<string, number>, title: string) => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {distances.map(dist => {
            const predictedTime = predictions[dist.value];
            const pace = predictedTime ? predictedTime / dist.miles : 0;
            
            return (
              <Card key={dist.value}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{dist.label}</p>
                      <p className="text-2xl font-bold text-primary">
                        {predictedTime ? formatTime(predictedTime) : '--:--'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pace ? formatPace(pace) : '--:--'} /mile
                      </p>
                    </div>
                    <Target className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Calculator className="h-8 w-8" />
          Performance Calculator
        </h1>
        <p className="text-muted-foreground mt-2">
          Predict race times and calculate paces based on recent performances
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Manual Entry
          </TabsTrigger>
          <TabsTrigger value="athlete" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            From Athlete
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Predictions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Calculate from Time</CardTitle>
              <CardDescription>
                Enter a recent race time to predict performances at other distances
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="distance">Race Distance</Label>
                  <Select value={inputDistance} onValueChange={setInputDistance}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select distance" />
                    </SelectTrigger>
                    <SelectContent>
                      {distances.map(dist => (
                        <SelectItem key={dist.value} value={dist.value}>
                          {dist.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Race Time</Label>
                  <Input
                    id="time"
                    placeholder="e.g., 18:30 or 1:05:45"
                    value={inputTime}
                    onChange={(e) => setInputTime(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: MM:SS or H:MM:SS
                  </p>
                </div>
              </div>
              <Button 
                onClick={calculateFromInput} 
                disabled={!inputTime || !inputDistance || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Calculate Predictions
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="athlete" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Calculate from Athlete's Recent Race</CardTitle>
              <CardDescription>
                Select an athlete and their recent race to generate predictions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="athlete">Select Athlete</Label>
                <Select value={selectedAthlete} onValueChange={setSelectedAthlete} disabled={isLoadingAthletes}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingAthletes ? "Loading athletes..." : "Select an athlete"} />
                  </SelectTrigger>
                  <SelectContent>
                    {athletes.map(athlete => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name} {athlete.grade && `(Grade ${athlete.grade})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAthlete && (
                <div className="space-y-2">
                  <Label htmlFor="race">Select Recent Race</Label>
                  <Select value={selectedRace} onValueChange={setSelectedRace} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoading ? "Loading races..." : "Select a race"} />
                    </SelectTrigger>
                    <SelectContent>
                      {recentRaces.map(race => (
                        <SelectItem key={race.id} value={race.id}>
                          {race.raceName} - {formatTime(race.time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button 
                onClick={calculateFromAthleteRace} 
                disabled={!selectedRace || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Generate Predictions
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="mt-6 space-y-8">
          {Object.keys(predictedTimes).length > 0 && (
            <>
              {renderPredictions(predictedTimes, 'Predicted Race Times')}
              {renderTrainingPaces(trainingPaces, vdotScore, 'Training Paces')}
            </>
          )}
          {Object.keys(athletePredictions).length > 0 && (
            <>
              {renderPredictions(athletePredictions, "Athlete's Predicted Times")}
              {renderTrainingPaces(athleteTrainingPaces, athleteVdotScore, "Athlete's Training Paces")}
            </>
          )}
          {Object.keys(predictedTimes).length === 0 && Object.keys(athletePredictions).length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No predictions yet. Calculate from a time or select an athlete's race to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VDOTCalculator;
