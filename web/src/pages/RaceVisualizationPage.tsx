import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSeason } from '@/hooks/useCurrentSeason';
import axiosInstance from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Pause, RotateCcw } from 'lucide-react';

interface RunnerData {
  name: string;
  grade: string;
  gender: string;
  startTime: number; // seconds
  prTime: number; // seconds
}

interface ImprovementData {
  athlete: {
    name: string;
    grade: string;
    gender: string;
  };
  firstRace: {
    time: number;
  };
  bestRace: {
    time: number;
  };
}

const getGradeColor = (grade: string) => {
  const colors: Record<string, string> = {
    '9': '#FF0000',    // Red for freshmen
    '10': '#00FF00',   // Green for sophomores
    '11': '#0000FF',   // Blue for juniors
    '12': '#FF00FF'    // Purple for seniors
  };
  return colors[grade] || '#FFFFFF';
};

export default function RaceVisualizationPage() {
  const { currentUser } = useAuth();
  const teamId = currentUser?.team?.id;
  const currentSeason = useCurrentSeason();

  const [runners, setRunners] = useState<RunnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timer, setTimer] = useState(0);
  const [completedTimes, setCompletedTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (teamId) {
      fetchImprovementData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, currentSeason]);

  const fetchImprovementData = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(
        `/coaches-tools/improvement-tracking/${teamId}/${currentSeason}`
      );
      
      const improvements: ImprovementData[] = response.data.data || [];
      
      // Transform improvement data to runner format
      const runnerData: RunnerData[] = improvements
        .filter((imp: ImprovementData) => imp.firstRace && imp.bestRace)
        .map((imp: ImprovementData) => ({
          name: imp.athlete.name,
          grade: imp.athlete.grade,
          gender: imp.athlete.gender,
          startTime: imp.firstRace.time,
          prTime: imp.bestRace.time
        }))
        .sort((a: RunnerData, b: RunnerData) => a.prTime - b.prTime); // Sort by PR

      setRunners(runnerData);
    } catch (error) {
      console.error('Error fetching improvement data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('Animation effect triggered:', { isRunning, isPaused, runnersCount: runners.length });
    if (isRunning && !isPaused) {
      console.log('Starting animation intervals');
      const positionInterval = setInterval(() => {
        setPositions(prev => {
          const newPositions = { ...prev };
          let allFinished = true;

          runners.forEach(runner => {
            ['start', 'pr'].forEach(type => {
              const key = `${runner.name}-${type}`;
              
              if (newPositions[key] === undefined) {
                newPositions[key] = 0;
              }
              
              if (newPositions[key] < 100) {
                newPositions[key] += 100 / (runner[type === 'start' ? 'startTime' : 'prTime'] * 20);
                allFinished = false;
              }
              
              if (newPositions[key] >= 100 && !completedTimes[key]) {
                setCompletedTimes(prev => ({
                  ...prev,
                  [key]: runner[type === 'start' ? 'startTime' : 'prTime']
                }));
              }
            });
          });

          if (allFinished) {
            setIsRunning(false);
          }

          return newPositions;
        });
      }, 50);

      const timerInterval = setInterval(() => {
        setTimer(prev => prev + 0.05); // Faster timer increment
      }, 50);

      return () => {
        clearInterval(positionInterval);
        clearInterval(timerInterval);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, isPaused, runners]);

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    setPositions({});
    setTimer(0);
    setCompletedTimes({});
  };

  const handleStart = () => {
    console.log('Start clicked, runners:', runners.length);
    if (runners.length > 0) {
      setIsRunning(true);
    } else {
      console.log('No runners to animate');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#001233] text-white">
        <p>Please join a team to view race visualization</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#001233]">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Season Improvement Visualization
          </h1>
          <p className="text-slate-300 text-lg">
            {currentUser?.team?.name} • {currentSeason} Season
          </p>
        </div>

        {/* Controls Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-8 shadow-2xl">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <Button
                onClick={handleStart}
                disabled={isRunning && !isPaused || runners.length === 0}
                className="gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                <Play className="h-4 w-4" />
                Start Race
              </Button>
              <Button
                onClick={() => setIsPaused(!isPaused)}
                disabled={!isRunning}
                variant="outline"
                className="gap-2 border-slate-600 hover:bg-slate-700"
              >
                <Pause className="h-4 w-4" />
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                className="gap-2 border-slate-600 hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <div className="font-mono text-2xl px-6 py-2 bg-slate-900/50 rounded-lg border border-slate-700">
                {formatTime(timer)}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-6 bg-slate-900/50 px-6 py-3 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white shadow-lg shadow-white/50"></div>
                <span className="text-slate-300">Best 5K</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50"></div>
                <span className="text-slate-300">Freshmen</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50"></div>
                <span className="text-slate-300">Sophomores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
                <span className="text-slate-300">Juniors</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500 shadow-lg shadow-purple-500/50"></div>
                <span className="text-slate-300">Seniors</span>
              </div>
            </div>
          </div>
        </div>

        {/* Race Track */}
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 shadow-2xl">
          <div className="relative" style={{ width: '1250px', margin: '0 auto' }}>
            {/* Start Line */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-lg shadow-green-500/50" style={{ height: `${runners.length * 30}px` }}></div>
            
            {/* Finish Line */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500 shadow-lg shadow-red-500/50" style={{ height: `${runners.length * 30}px` }}></div>
            
            {/* Mile Markers */}
            {[250, 500, 750, 1000].map((left, idx) => (
              <div
                key={idx}
                className="absolute top-0 w-px bg-slate-600"
                style={{ left: `${left}px`, height: `${runners.length * 30}px` }}
              ></div>
            ))}

          {/* Runners */}
          {runners.map((runner, index) => (
            <div key={`${runner.name}-${index}`} className="relative h-[30px] mb-1.5">
              {/* Row Number */}
              <div className="absolute -left-8 top-0 font-mono text-sm">{index + 1}</div>
              
              {/* Runner Line */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20"></div>
              
              {/* Start Time Runner (colored by grade) */}
              <div
                className="absolute w-2 h-2 rounded-full transition-all duration-500"
                style={{
                  left: `${positions[`${runner.name}-start`] || 0}%`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: getGradeColor(runner.grade),
                  boxShadow: `0 0 5px ${getGradeColor(runner.grade)}`
                }}
              ></div>
              
              {/* Improvement Line (dashed) */}
              <div
                className="absolute h-0.5 top-1/2 -translate-y-1/2 transition-all duration-500"
                style={{
                  left: `${positions[`${runner.name}-start`] || 0}%`,
                  width: `${(positions[`${runner.name}-pr`] || 0) - (positions[`${runner.name}-start`] || 0)}%`,
                  borderTop: `2px dashed ${getGradeColor(runner.grade)}`
                }}
              ></div>
              
              {/* PR Runner (white) */}
              <div
                className="absolute w-2 h-2 rounded-full bg-white transition-all duration-500"
                style={{
                  left: `${positions[`${runner.name}-pr`] || 0}%`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  boxShadow: '0 0 5px white'
                }}
              ></div>
              
              {/* Time Labels */}
              {completedTimes[`${runner.name}-start`] && (
                <div className="absolute -right-16 top-0 font-mono text-xs">
                  {formatTime(runner.startTime)}
                </div>
              )}
              {completedTimes[`${runner.name}-pr`] && (
                <div className="absolute -right-32 top-0 font-mono text-xs">
                  {formatTime(runner.prTime)}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
