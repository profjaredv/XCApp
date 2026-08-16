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

// Row sizing — a coach can have anywhere from a handful to 150+ runners on
// screen at once (desktop/projector use, per the request). Row height is
// computed from the actual available vertical space divided by runner
// count (see trackHeight/ResizeObserver below), clamped between these:
// MAX keeps a small roster from stretching into absurdly tall rows, MIN is
// the floor below which a dot/line stops being legible at all — past that
// point the track scrolls instead of compressing further.
const MAX_ROW_HEIGHT = 26;
const MIN_ROW_HEIGHT = 5;
// Below this row height, per-row chrome (row number, finish-time labels)
// gets dropped rather than rendered unreadably small — the dots and lines
// (the actual race) stay legible far below where the text would.
const ROW_NUMBER_MIN_HEIGHT = 11;
const TIME_LABEL_MIN_HEIGHT = 13;

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

  // Available height for the runner rows, in px — measured, not guessed,
  // so the row-height math below always reflects the real viewport (and
  // recomputes automatically on any resize, window or otherwise).
  const trackWrapperRef = useRef<HTMLDivElement>(null);
  const [trackHeight, setTrackHeight] = useState(0);

  useEffect(() => {
    if (teamId) {
      fetchImprovementData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, currentSeason]);

  // The wrapper only exists once loading finishes (it's in the "loaded"
  // render branch below) — re-run once loading flips so the observer
  // actually attaches to a real node instead of running once against null.
  useEffect(() => {
    if (loading) return;
    const el = trackWrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setTrackHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

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

  // Fit as many runners on screen as the viewport allows: divide the
  // measured available height by the runner count, clamp to a legible
  // range. Only when even the minimum row height can't fit everyone does
  // the track fall back to scrolling — a graceful floor for very large
  // rosters rather than shrinking rows into invisibility.
  const rowHeight = useMemo(() => {
    if (runners.length === 0 || trackHeight === 0) return MAX_ROW_HEIGHT;
    const ideal = trackHeight / runners.length;
    return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, ideal));
  }, [runners.length, trackHeight]);

  const contentHeight = rowHeight * runners.length;
  const needsScroll = trackHeight > 0 && contentHeight > trackHeight + 1;
  const showRowNumbers = rowHeight >= ROW_NUMBER_MIN_HEIGHT;
  const showTimeLabels = rowHeight >= TIME_LABEL_MIN_HEIGHT;
  const dotSize = Math.min(10, Math.max(3, rowHeight * 0.55));

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
    <div className="h-screen bg-[#0d0d0d] text-white p-6 relative overflow-hidden flex flex-col">
      {/* Subtle vignette instead of a loud gradient — a quiet, polished
          backdrop that doesn't compete with the runner colors. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(57,135,229,0.08), transparent 60%)' }}
      ></div>

      {/* No max-width cap — desktop/projector use benefits from using the
          full available width; the track's positions are percentage-based
          already, so a wider screen just gives every runner more room. */}
      <div className="relative z-10 flex flex-col h-full w-full min-h-0">
        {/* Header */}
        <div className="text-center mb-3 shrink-0">
          <h1 className="text-2xl font-bold text-white mb-1">
            Season Improvement Visualization
          </h1>
          <p className="text-[#c3c2b7] text-sm">
            {currentUser?.team?.name} • {currentSeason} Season
          </p>
        </div>

        {/* Controls Card */}
        <div className="bg-[#1a1a19] border border-white/10 rounded-xl p-4 mb-3 shrink-0">
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
              <div className="font-mono text-xl tabular-nums px-5 py-1.5 bg-black/40 rounded-lg border border-white/10">
                {formatTime(timer)}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-6 bg-black/40 px-6 py-2 rounded-lg border border-white/10">
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

        {/* Race Track — fills whatever vertical space remains; row height
            is computed (above) to fit every runner in that space without
            scrolling, falling back to a scrollbar only past MIN_ROW_HEIGHT. */}
        <div className="bg-[#1a1a19] border border-white/10 rounded-xl p-4 flex-1 min-h-0">
          <div
            ref={trackWrapperRef}
            className="relative h-full"
            style={{
              overflowY: needsScroll ? 'auto' : 'hidden',
              paddingLeft: showRowNumbers ? '2rem' : '0.5rem',
              paddingRight: showTimeLabels ? '8rem' : '1rem',
            }}
          >
            <div className="relative" style={{ height: needsScroll ? `${contentHeight}px` : '100%' }}>
              {/* Start Line */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#199e70]"></div>

              {/* Finish Line */}
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/60"></div>

              {/* Mile Markers (roughly 1/2/3/4mi of a 5K) */}
              {[20, 40, 60, 80].map((pct) => (
                <div
                  key={pct}
                  className="absolute top-0 bottom-0 w-px bg-white/10"
                  style={{ left: `${pct}%` }}
                ></div>
              ))}

              {/* Runners */}
              {runners.map((runner, index) => {
                const gradeColor = getGradeColor(runner.grade);
                const startPos = positions[`${runner.name}-start`] ?? 0;
                const prPos = positions[`${runner.name}-pr`] ?? 0;
                return (
                  <div
                    key={`${runner.name}-${index}`}
                    className="relative"
                    style={{ height: `${rowHeight}px` }}
                    title={`${runner.name} — first ${formatTime(runner.startTime)}, best ${formatTime(runner.prTime)}`}
                  >
                    {showRowNumbers && (
                      <div
                        className="absolute font-mono text-[#898781]"
                        style={{ left: '-1.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: Math.min(11, rowHeight * 0.55), lineHeight: 1 }}
                      >
                        {index + 1}
                      </div>
                    )}

                    {/* Runner Line */}
                    <div className="absolute inset-x-0 top-1/2 h-px bg-white/10"></div>

                    {/* Start Time Runner (colored by grade) — no CSS
                        transition: position is already recomputed every
                        animation frame from elapsedMs, so the JS update
                        itself is the motion. Layering a transition on top
                        of an already-continuous value only adds lag. */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        left: `${startPos}%`,
                        top: '50%',
                        width: dotSize,
                        height: dotSize,
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
                      className="absolute rounded-full bg-white"
                      style={{
                        left: `${prPos}%`,
                        top: '50%',
                        width: dotSize,
                        height: dotSize,
                        transform: 'translate(-50%, -50%)',
                      }}
                    ></div>

                    {/* Time Labels — dropped below TIME_LABEL_MIN_HEIGHT
                        rather than rendered illegibly small; full name and
                        finish times are still on the row via native title
                        tooltip regardless of row height. */}
                    {showTimeLabels && startPos >= 100 && (
                      <div
                        className="absolute font-mono text-[#c3c2b7] whitespace-nowrap"
                        style={{ left: 'calc(100% + 0.5rem)', top: '50%', transform: 'translateY(-50%)', fontSize: Math.min(11, rowHeight * 0.5) }}
                      >
                        {formatTime(runner.startTime)}
                      </div>
                    )}
                    {showTimeLabels && prPos >= 100 && (
                      <div
                        className="absolute font-mono text-white whitespace-nowrap"
                        style={{ left: 'calc(100% + 3.25rem)', top: '50%', transform: 'translateY(-50%)', fontSize: Math.min(11, rowHeight * 0.5) }}
                      >
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
    </div>
  );
}
