import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSeasonWithData } from '@/hooks/useCurrentSeasonWithData';
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

// Validated categorical palette (dataviz skill, dark-mode steps: blue,
// orange, aqua, yellow — validated against this page's dark track surface,
// worst adjacent CVD ΔE 8.4 / normal-vision ΔE 19.8, all >=3:1 contrast).
const GRADE_COLORS: Record<string, string> = {
  '9': '#3987e5',   // blue — freshmen
  '10': '#d95926',  // orange — sophomores
  '11': '#199e70',  // aqua — juniors
  '12': '#c98500',  // yellow — seniors
};
const getGradeColor = (grade: string) => GRADE_COLORS[grade] || '#c3c2b7';

// 60x time compression: a race run in T seconds animates in T/60 real
// seconds — a 22-minute (1320s) race finishes in 22 real seconds.
const COMPRESSION = 60;

export default function RaceVisualizationPage() {
  const { currentUser } = useAuth();
  const teamId = currentUser?.team?.id;
  // No season picker on this page — default past an empty active/preseason
  // to the most recent season with actual improvement data to animate.
  const currentSeason = useCurrentSeasonWithData(teamId);

  const [runners, setRunners] = useState<RunnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Real milliseconds elapsed since the (possibly paused/resumed) race
  // start — the single source of truth every dot's position and the
  // on-screen clock are computed from each frame. Driving positions from
  // one continuously-advancing value (via requestAnimationFrame) instead
  // of accumulating fixed per-tick increments (the old setInterval
  // approach) is what makes the motion smooth — no discrete stepping, no
  // drift, no overshoot past the finish line.
  const [elapsedMs, setElapsedMs] = useState(0);

  const rafRef = useRef<number | null>(null);
  const raceStartRef = useRef(0); // performance.now() timestamp elapsedMs=0 maps to
  const pausedElapsedRef = useRef(0); // elapsedMs captured at the moment of pausing

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
        `/coaches-tools/improvement-tracking/${currentSeason}`
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

  // The longest compressed race duration in ms — once elapsedMs passes
  // this, every runner has finished and the animation should stop itself.
  const maxDurationMs = useMemo(() => {
    return runners.reduce((max, r) => {
      const runnerMax = Math.max(r.startTime, r.prTime) * (1000 / COMPRESSION);
      return Math.max(max, runnerMax);
    }, 0);
  }, [runners]);

  useEffect(() => {
    if (!isRunning || isPaused) return;

    raceStartRef.current = performance.now() - pausedElapsedRef.current;

    const step = (now: number) => {
      const next = now - raceStartRef.current;
      setElapsedMs(next);
      if (next < maxDurationMs) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setElapsedMs(maxDurationMs);
        setIsRunning(false);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, isPaused, maxDurationMs]);

  // Every dot's position (0-100%) derived fresh from elapsedMs each frame
  // — exact math, never drifts, never needs clamping-after-the-fact.
  const positions = useMemo(() => {
    const result: Record<string, number> = {};
    runners.forEach((runner) => {
      (['start', 'pr'] as const).forEach((type) => {
        const raceSeconds = type === 'start' ? runner.startTime : runner.prTime;
        const durationMs = (raceSeconds * 1000) / COMPRESSION;
        result[`${runner.name}-${type}`] = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 100;
      });
    });
    return result;
  }, [runners, elapsedMs]);

  // Simulated race clock (seconds) — elapsedMs run back through the same
  // compression factor, so it reads out the runners' actual race time.
  const timer = (elapsedMs / 1000) * COMPRESSION;

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    setElapsedMs(0);
    pausedElapsedRef.current = 0;
  };

  const handleStart = () => {
    if (runners.length > 0) {
      handleReset();
      setIsRunning(true);
    }
  };

  const handlePauseToggle = () => {
    if (!isPaused) {
      pausedElapsedRef.current = elapsedMs;
    }
    setIsPaused(!isPaused);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d0d0d] text-white">
        <p>Please join a team to view race visualization</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d0d0d]">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white p-8 relative overflow-hidden">
      {/* Subtle vignette instead of a loud gradient — a quiet, polished
          backdrop that doesn't compete with the runner colors. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(57,135,229,0.08), transparent 60%)' }}
      ></div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Season Improvement Visualization
          </h1>
          <p className="text-[#c3c2b7] text-lg">
            {currentUser?.team?.name} • {currentSeason} Season
          </p>
        </div>

        {/* Controls Card */}
        <div className="bg-[#1a1a19] border border-white/10 rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex gap-3 items-center">
              <Button
                onClick={handleStart}
                disabled={isRunning || runners.length === 0}
                className="gap-2 bg-[#3987e5] hover:bg-[#2a78d6] text-white"
              >
                <Play className="h-4 w-4" />
                Start Race
              </Button>
              <Button
                onClick={handlePauseToggle}
                disabled={!isRunning}
                variant="outline"
                className="gap-2 border-white/15 text-white hover:bg-white/10"
              >
                <Pause className="h-4 w-4" />
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                className="gap-2 border-white/15 text-white hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <div className="font-mono text-2xl tabular-nums px-6 py-2 bg-black/40 rounded-lg border border-white/10">
                {formatTime(timer)}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-6 bg-black/40 px-6 py-3 rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white"></div>
                <span className="text-[#c3c2b7] text-sm">Best 5K</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS['9'] }}></div>
                <span className="text-[#c3c2b7] text-sm">Freshmen</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS['10'] }}></div>
                <span className="text-[#c3c2b7] text-sm">Sophomores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS['11'] }}></div>
                <span className="text-[#c3c2b7] text-sm">Juniors</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS['12'] }}></div>
                <span className="text-[#c3c2b7] text-sm">Seniors</span>
              </div>
            </div>
          </div>
        </div>

        {/* Race Track */}
        <div className="bg-[#1a1a19] border border-white/10 rounded-xl p-8">
          <div className="relative" style={{ width: '1250px', margin: '0 auto' }}>
            {/* Start Line */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#199e70]" style={{ height: `${runners.length * 30}px` }}></div>

            {/* Finish Line */}
            <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/60" style={{ height: `${runners.length * 30}px` }}></div>

            {/* Mile Markers */}
            {[250, 500, 750, 1000].map((left, idx) => (
              <div
                key={idx}
                className="absolute top-0 w-px bg-white/10"
                style={{ left: `${left}px`, height: `${runners.length * 30}px` }}
              ></div>
            ))}

          {/* Runners */}
          {runners.map((runner, index) => {
            const gradeColor = getGradeColor(runner.grade);
            const startPos = positions[`${runner.name}-start`] ?? 0;
            const prPos = positions[`${runner.name}-pr`] ?? 0;
            return (
            <div key={`${runner.name}-${index}`} className="relative h-[30px] mb-1.5">
              {/* Row Number */}
              <div className="absolute -left-8 top-0 font-mono text-sm text-[#898781]">{index + 1}</div>

              {/* Runner Line */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10"></div>

              {/* Start Time Runner (colored by grade) — no CSS transition:
                  position is already recomputed every animation frame from
                  elapsedMs, so the JS update itself is the motion. Layering
                  a transition on top of an already-continuous value only
                  adds lag and a "chasing" stutter. */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full"
                style={{
                  left: `${startPos}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: gradeColor,
                }}
              ></div>

              {/* Improvement Line (dashed) */}
              <div
                className="absolute h-0.5 top-1/2 -translate-y-1/2"
                style={{
                  left: `${startPos}%`,
                  width: `${Math.max(0, prPos - startPos)}%`,
                  borderTop: `2px dashed ${gradeColor}66`,
                }}
              ></div>

              {/* PR Runner (white) */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-white"
                style={{
                  left: `${prPos}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              ></div>

              {/* Time Labels */}
              {startPos >= 100 && (
                <div className="absolute -right-16 top-0 font-mono text-xs text-[#c3c2b7]">
                  {formatTime(runner.startTime)}
                </div>
              )}
              {prPos >= 100 && (
                <div className="absolute -right-32 top-0 font-mono text-xs text-white">
                  {formatTime(runner.prTime)}
                </div>
              )}
            </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
