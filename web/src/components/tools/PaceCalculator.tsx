import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { axiosInstance as api } from '@/api/axios';
import { formatTime } from '../../lib/formatUtils';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Create a simple utility function for className merging
const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

// Simple command component implementations
const Command: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover">{children}</div>
);

const CommandInput: React.FC<{placeholder?: string; value: string; onValueChange: (value: string) => void}> = 
  ({placeholder, value, onValueChange}) => (
    <input 
      className="flex h-10 w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  );

const CommandEmpty: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="py-6 text-center text-sm">{children}</div>
);

const CommandGroup: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="overflow-hidden p-1 text-foreground">{children}</div>
);

const CommandList: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">{children}</div>
);

const CommandItem: React.FC<{value: string; onSelect: () => void; children: React.ReactNode}> = 
  ({onSelect, children}) => {
    return (
      <div 
        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        role="option"
        tabIndex={0}
      >
        {children}
      </div>
    );
  };

// Simple popover component implementations
const Popover: React.FC<{children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void}> = 
  ({children}) => (
    <div className="relative">{children}</div>
  );

const PopoverTrigger: React.FC<{children: React.ReactNode; asChild?: boolean}> = ({children}) => (
  <div>{children}</div>
);

const PopoverContent: React.FC<{className?: string; children: React.ReactNode}> = 
  ({className = '', children}) => (
    <div className={`absolute z-50 w-full min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 shadow-md ${className}`}>
      {children}
    </div>
  );

interface Athlete {
  _id?: string;
  id?: string;
  name: string;
  grade?: number;
  gender?: string;
  graduationYear?: number;
  recentMileTime?: number;
  averageRacePace?: number;
  paceSource?: 'mile' | 'average';
}

interface PaceResult {
  type: string;
  mile?: string;
  km?: string;
  m1200?: string;
  m800?: string;
  m600?: string;
  m400?: string;
  m300?: string;
  m200?: string;
  description: string;
}

const PaceCalculator: React.FC = () => {
  const { currentUser } = useAuth();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState<string>('');
  const [basePace, setBasePace] = useState<number | null>(null);
  const [paceSource, setPaceSource] = useState<'athlete' | 'custom'>('athlete');
  const [paceResults, setPaceResults] = useState<PaceResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fetch pace data for a selected athlete
  const fetchPaceData = useCallback((athleteId: string) => {
    if (!athleteId) return;
    
    setLoading(true);
    setError(null);
    
    console.log(`Fetching pace data for athlete ${athleteId}`);
    api.get(`/athletes/${athleteId}/pace-data`)
      .then(response => {
        console.log('Pace data response:', response.data);
        const { recentMileTime, averageRacePace } = response.data;
        
        // Update the athletes array with the pace data for the selected athlete
        setAthletes(prevAthletes => {
          return prevAthletes.map(athlete => {
            if ((athlete._id === athleteId) || (athlete.id === athleteId)) {
              return {
                ...athlete,
                recentMileTime,
                averageRacePace,
                paceSource: recentMileTime ? 'mile' : 'average'
              };
            }
            return athlete;
          });
        });
        
        // Use recent mile time if available, otherwise use average race pace
        if (recentMileTime) {
          setBasePace(recentMileTime);
        } else if (averageRacePace) {
          setBasePace(averageRacePace);
        } else {
          setError('No pace data available for this athlete');
          setBasePace(null);
        }
        
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching pace data:', error);
        console.error('Error details:', error.response?.data || 'No response data');
        setError(`Failed to fetch pace data: ${error.message}`);
        setBasePace(null);
        setLoading(false);
        toast.error(`Failed to fetch pace data: ${error.message}`);
      });
  }, []);

  // Note: We directly use fetchPaceData instead of a separate handler function

  // Fetch athletes with search
  const searchAthletes = useCallback((query: string = '') => {
    // Clear previous timeout if it exists
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    if (query.length > 0 && currentUser?.team?._id) {
      setSearchLoading(true);
      
      // Debounce search requests
      searchTimeout.current = setTimeout(() => {
        console.log('Searching for:', query);
        api.get('/athletes', { params: { search: query } })
          .then(response => {
            console.log('Search results:', response.data);
            if (Array.isArray(response.data)) {
              // Map the response data to our Athlete interface
              const mappedAthletes = response.data.map(athlete => ({
                _id: athlete._id,
                id: athlete._id, // For backward compatibility
                name: athlete.name,
                grade: athlete.grade,
                gender: athlete.gender,
                graduationYear: athlete.graduationYear
              }));
              setAthletes(mappedAthletes);
            } else {
              console.warn('Unexpected response format:', response.data);
              setAthletes([]);
            }
            setSearchLoading(false);
          })
          .catch(error => {
            console.error('Error fetching athletes:', error);
            console.error('Error details:', error.response?.data || 'No response data');
            setSearchLoading(false);
            setAthletes([]);
            toast.error(`Failed to fetch athletes: ${error.message}`);
          });
      }, 300);
    } else {
      // Clear athletes when search is empty
      setAthletes([]);
    }
  }, [currentUser?.team?._id]);

  // Only load athletes when search is opened
  useEffect(() => {
    if (isSearchOpen && currentUser?.team?._id && searchTerm.length > 0) {
      searchAthletes(searchTerm);
    }
  }, [isSearchOpen, currentUser, searchAthletes, searchTerm]);
  
  // Fetch selected athlete data if we have an ID but no athlete object
  useEffect(() => {
    if (selectedAthlete && !athletes.some(a => a.id === selectedAthlete) && currentUser?.team?._id) {
      console.log('Fetching selected athlete data for ID:', selectedAthlete);
      setLoading(true);
      api.get(`/athletes/${selectedAthlete}`)
        .then(response => {
          console.log('Fetched athlete data:', response.data);
          if (response.data) {
            // Add this athlete to the athletes array
            setAthletes(prev => {
              // Check if athlete already exists in the array
              if (!prev.some(a => a.id === response.data.id)) {
                return [...prev, response.data];
              }
              return prev;
            });
          }
          setLoading(false);
        })
        .catch(error => {
          console.error('Error fetching athlete data:', error);
          setLoading(false);
        });
    }
  }, [selectedAthlete, athletes, currentUser?.team?._id]);

  // This useEffect is only for handling tab changes
  useEffect(() => {
    if (selectedAthlete && paceSource === 'athlete') {
      console.log('Tab changed to athlete, fetching pace data for:', selectedAthlete);
      fetchPaceData(selectedAthlete);
    }
  }, [paceSource, selectedAthlete, fetchPaceData]);

  // Parse custom time input (format: MM:SS or M:SS)
  const parseCustomTime = (timeString: string): number | null => {
    const parts = timeString.split(':');
    if (parts.length !== 2) return null;
    
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    
    if (isNaN(minutes) || isNaN(seconds)) return null;
    
    return minutes * 60 + seconds;
  };

  // Handle custom time input change
  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomTime(e.target.value);
    const parsedTime = parseCustomTime(e.target.value);
    if (parsedTime) {
      setBasePace(parsedTime);
    }
  };

  // Handle tab change between athlete and custom time
  const handleTabChange = (value: string) => {
    setPaceSource(value as 'athlete' | 'custom');
    if (value === 'custom') {
      const parsedTime = parseCustomTime(customTime);
      if (parsedTime) {
        setBasePace(parsedTime);
      } else {
        setBasePace(null);
      }
    }
  };

  // Calculate training paces based on base pace
  const calculatePaces = () => {
    if (!basePace) return;

    const results: PaceResult[] = [];

    // Easy pace (mile pace + 1:05 to + 2:03)
    const easyMinPace = basePace + 65;
    const easyMaxPace = basePace + 123;
    results.push({
      type: 'Easy',
      mile: `${formatTime(easyMinPace)} ~ ${formatTime(easyMaxPace)}`,
      km: `${formatTime(easyMinPace / 1.609)} ~ ${formatTime(easyMaxPace / 1.609)}`,
      description: 'Mile pace + 1:05 to + 2:03'
    });

    // Marathon pace (mile pace - 5 seconds)
    const marathonPace = basePace - 5;
    results.push({
      type: 'Marathon',
      mile: formatTime(marathonPace),
      km: formatTime(marathonPace / 1.609),
      description: 'Mile pace - 5 seconds'
    });

    // Threshold pace (mile pace - 39 seconds)
    const thresholdPace = basePace - 39;
    results.push({
      type: 'Threshold',
      mile: formatTime(thresholdPace),
      km: formatTime(thresholdPace / 1.609),
      m1200: formatTime(thresholdPace * 0.75),
      m800: formatTime(thresholdPace * 0.5),
      m600: formatTime(thresholdPace * 0.375),
      description: 'Mile pace - 39 seconds'
    });

    // Interval pace (mile pace - 78 seconds)
    const intervalPace = basePace - 78;
    results.push({
      type: 'Interval',
      mile: formatTime(intervalPace),
      km: formatTime(intervalPace / 1.609),
      m1200: formatTime(intervalPace * 0.75),
      m800: formatTime(intervalPace * 0.5),
      m600: formatTime(intervalPace * 0.375),
      m400: formatTime(intervalPace * 0.25),
      m300: formatTime(intervalPace * 0.1875),
      m200: formatTime(intervalPace * 0.125),
      description: 'Mile pace - 78 seconds'
    });

    // Repetition pace (mile pace - 102 seconds)
    const repetitionPace = basePace - 102;
    results.push({
      type: 'Repetition',
      mile: formatTime(repetitionPace),
      km: formatTime(repetitionPace / 1.609),
      m1200: formatTime(repetitionPace * 0.75),
      m800: formatTime(repetitionPace * 0.5),
      m600: formatTime(repetitionPace * 0.375),
      m400: formatTime(repetitionPace * 0.25),
      m300: formatTime(repetitionPace * 0.1875),
      m200: formatTime(repetitionPace * 0.125),
      description: 'Mile pace - 102 seconds'
    });

    // Fast Reps pace (mile pace - 115 seconds)
    const fastRepsPace = basePace - 115;
    results.push({
      type: 'Fast Reps',
      m400: formatTime(fastRepsPace * 0.25),
      m300: formatTime(fastRepsPace * 0.1875),
      m200: formatTime(fastRepsPace * 0.125),
      description: 'Mile pace - 115 seconds'
    });

    setPaceResults(results);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Training Pace Calculator</CardTitle>
        <CardDescription>
          Calculate training paces based on recent race performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <Tabs defaultValue="athlete" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="athlete">Select Athlete</TabsTrigger>
              <TabsTrigger value="custom">Custom Time</TabsTrigger>
            </TabsList>
            <TabsContent value="athlete" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Search and select an athlete:
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isSearchOpen}
                      className="w-full justify-between"
                      onClick={() => {
                        console.log('Toggle search dropdown');
                        setIsSearchOpen(!isSearchOpen);
                      }}
                    >
                      {selectedAthlete
                        ? athletes.find((athlete) => (athlete._id === selectedAthlete || athlete.id === selectedAthlete))?.name || 
                          "Select an athlete"
                        : "Select an athlete"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  {isSearchOpen && (<PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Search athletes..." 
                        value={searchTerm}
                        onValueChange={(value: string) => {
                          setSearchTerm(value);
                          searchAthletes(value);
                        }}
                      />
                      {searchLoading && (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="ml-2 text-sm">Searching...</span>
                        </div>
                      )}
                      {athletes.length === 0 && searchTerm.length > 0 ? (
                        <CommandEmpty>No athletes found.</CommandEmpty>
                      ) : searchTerm.length === 0 ? (
                        <CommandEmpty>Type to search for athletes...</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          <CommandList key="athlete-search-list">
                            {athletes.map((athlete, index) => (
                            <CommandItem
                              key={athlete._id || athlete.id || `athlete-${index}`}
                              value={athlete._id || athlete.id || ''}
                              onSelect={() => {
                                const athleteId = athlete._id || athlete.id;
                                console.log('Selecting athlete:', athleteId, athlete.name);
                                // First update the selected athlete state
                                if (athleteId) {
                                  setSelectedAthlete(athleteId);
                                  // Then fetch the athlete's pace data
                                  fetchPaceData(athleteId);
                                  // Close the dropdown and clear the search
                                  setIsSearchOpen(false);
                                  setSearchTerm('');
                                } else {
                                  console.error('Invalid athlete ID');
                                  toast.error('Invalid athlete selection');
                                }
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  (selectedAthlete === athlete._id || selectedAthlete === athlete.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <div>{athlete.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {athlete.grade ? `Grade ${athlete.grade}` : ''}
                                </div>
                              </div>
                            </CommandItem>
                            ))}
                          </CommandList>
                        </CommandGroup>
                      )}
                    </Command>
                  </PopoverContent>)}
                </Popover>
                {selectedAthlete && basePace && (
                  <div className="text-sm mt-2 space-y-1">
                    <p className="font-medium">
                      Base pace: {formatTime(basePace)} min/mile
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Source: {(() => {
                        const selectedAthleteData = athletes.find(a => a._id === selectedAthlete || a.id === selectedAthlete);
                        if (selectedAthleteData?.paceSource === 'mile') {
                          return 'Recent mile race';
                        } else if (selectedAthleteData?.recentMileTime) {
                          return 'Recent mile race';
                        } else {
                          return 'Average race pace';
                        }
                      })()}
                    </p>
                  </div>
                )}
                {loading && (
                  <div className="flex items-center mt-2">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm">Loading pace data...</span>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="custom" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Enter mile time (MM:SS):
                </label>
                <Input
                  type="text"
                  placeholder="5:30"
                  value={customTime}
                  onChange={handleCustomTimeChange}
                />
                {customTime && basePace && (
                  <p className="text-sm mt-2">
                    Base pace: {formatTime(basePace)} min/mile
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={calculatePaces} 
            disabled={!basePace || loading}
            className="w-full"
          >
            Calculate Training Paces
          </Button>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {paceResults.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium">Training Paces</h3>
              
              <div className="overflow-x-auto">
                <div className="grid grid-cols-3 gap-4 mb-2">
                  <div className="font-medium">Type</div>
                  <div className="font-medium">1 Mi</div>
                  <div className="font-medium">1 Km</div>
                </div>
                
                {paceResults.filter(r => r.mile && r.km).map((result, index) => (
                  <div key={index} className={`grid grid-cols-3 gap-4 py-2 ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <div className="text-blue-500">{result.type}</div>
                    <div>{result.mile}</div>
                    <div>{result.km}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto mt-8">
                <div className="grid grid-cols-4 gap-4 mb-2">
                  <div className="font-medium">Type</div>
                  <div className="font-medium">1200m</div>
                  <div className="font-medium">800m</div>
                  <div className="font-medium">600m</div>
                </div>
                
                {paceResults.filter(r => r.m1200 && r.m800 && r.m600).map((result, index) => (
                  <div key={index} className={`grid grid-cols-4 gap-4 py-2 ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <div className="text-blue-500">{result.type}</div>
                    <div>{result.m1200}</div>
                    <div>{result.m800}</div>
                    <div>{result.m600}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto mt-8">
                <div className="grid grid-cols-4 gap-4 mb-2">
                  <div className="font-medium">Type</div>
                  <div className="font-medium">400m</div>
                  <div className="font-medium">300m</div>
                  <div className="font-medium">200m</div>
                </div>
                
                {paceResults.filter(r => r.m400 && r.m300 && r.m200).map((result, index) => (
                  <div key={index} className={`grid grid-cols-4 gap-4 py-2 ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <div className="text-blue-500">{result.type}</div>
                    <div>{result.m400}</div>
                    <div>{result.m300}</div>
                    <div>{result.m200}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-medium">How Calculations Are Made</h3>
                <div className="space-y-2 text-sm">
                  {paceResults.map((result, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="font-medium text-blue-500">{result.type}:</span>
                      <span>{result.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaceCalculator;
