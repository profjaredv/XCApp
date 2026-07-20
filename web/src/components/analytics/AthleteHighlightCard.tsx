import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatTime, formatPace } from '@/lib/formatUtils';
import html2canvas from 'html2canvas';

interface BestRaceByDistance {
  distance: string;
  time: number;
  raceName: string;
}

interface AthleteHighlightCardProps {
  athleteName: string;
  grade: number;
  gender: 'M' | 'F';
  season: number;
  mode: 'season' | 'career';
  stats: {
    totalRaces: number;
    totalMiles: number;
    prTime: number;
    sbTime?: number;
    avgPace: number;
    bestPace?: number;
    milePR?: number;
    improvement?: number;
    timeDropped?: number;
    firstRaceTime?: number;
    fastestRaceTime?: number;
    bestRaceName?: string;
    bestRacesByDistance?: BestRaceByDistance[];
    progressionData?: number[]; // Array of race times for sparkline
  };
  teamName: string;
}

export const AthleteHighlightCard: React.FC<AthleteHighlightCardProps> = ({
  athleteName,
  grade,
  gender,
  season,
  mode,
  stats,
  teamName
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!cardRef.current) return;
    
    try {
      // Temporarily disable animations for export
      const animatedElements = cardRef.current.querySelectorAll('.animate-pulse');
      animatedElements.forEach(el => {
        (el as HTMLElement).style.animation = 'none';
      });
      
      // Wait for animations to stop and layout to settle
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('Starting export...');
      
      // Use html2canvas with proper configuration
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, // 2x resolution for quality
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#020617', // slate-950
        logging: false,
        windowWidth: cardRef.current.scrollWidth,
        windowHeight: cardRef.current.scrollHeight,
        width: cardRef.current.scrollWidth,
        height: cardRef.current.scrollHeight,
        onclone: (clonedDoc, element) => {
          // Convert oklch colors by reading from original element and applying to cloned
          const convertOklchColors = (originalEl: Element, clonedEl: Element) => {
            if (originalEl instanceof HTMLElement && clonedEl instanceof HTMLElement) {
              // Get computed style from the ORIGINAL element (browser has converted oklch to rgb)
              const computedStyle = window.getComputedStyle(originalEl);
              
              // List of color properties to convert
              const colorProps = [
                'color',
                'backgroundColor',
                'borderColor',
                'borderTopColor',
                'borderRightColor',
                'borderBottomColor',
                'borderLeftColor',
                'outlineColor'
              ];
              
              // Apply computed RGB values to cloned element
              colorProps.forEach(prop => {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                  clonedEl.style.setProperty(prop, value);
                }
              });
              
              // Handle background-image (gradients)
              const bgImage = computedStyle.backgroundImage;
              if (bgImage && bgImage !== 'none') {
                clonedEl.style.backgroundImage = bgImage;
              }
            }
            
            // Recursively process children
            const originalChildren = Array.from(originalEl.children);
            const clonedChildren = Array.from(clonedEl.children);
            originalChildren.forEach((origChild, index) => {
              if (clonedChildren[index]) {
                convertOklchColors(origChild, clonedChildren[index]);
              }
            });
          };
          
          // Convert colors from original to cloned element
          if (element && cardRef.current) {
            convertOklchColors(cardRef.current, element);
            
            // Force dimensions
            element.style.width = `${cardRef.current.scrollWidth}px`;
            element.style.height = `${cardRef.current.scrollHeight}px`;
            element.style.maxWidth = 'none';
            element.style.margin = '0';
          }
        }
      });
      
      // Re-enable animations
      animatedElements.forEach(el => {
        (el as HTMLElement).style.animation = '';
      });
      
      console.log('Canvas created:', canvas.width, 'x', canvas.height);
      
      // Convert to blob for better quality
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `${athleteName.replace(/\s+/g, '_')}_${mode}_highlights_${season}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png', 1.0);
      
    } catch (error) {
      console.error('Error exporting card:', error);
      alert('Failed to export image. Please try again.');
    }
  };

  const getGenderColor = () => {
    return gender === 'M' ? 'from-blue-600 to-blue-800' : 'from-purple-600 to-purple-800';
  };

  const getAccentColor = () => {
    return gender === 'M' ? 'bg-blue-500' : 'bg-purple-500';
  };

  // Simple sparkline SVG
  const renderSparkline = () => {
    if (!stats.progressionData || stats.progressionData.length < 2) return null;
    
    const data = stats.progressionData;
    const width = 120;
    const height = 40;
    const padding = 4;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg width={width} height={height} className="inline-block">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <div className="flex justify-end gap-2">
        <Button onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export as Image
        </Button>
      </div>

      {/* The Card to Export */}
      <div
        ref={cardRef}
        data-export-card
        className="relative w-full max-w-2xl mx-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-3xl overflow-hidden shadow-2xl"
        style={{ minHeight: '800px' }}
      >
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 opacity-20">
          <div className={`absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br ${getGenderColor()} rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3 animate-pulse`}></div>
          <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr ${getGenderColor()} rounded-full blur-3xl transform -translate-x-1/3 translate-y-1/3 animate-pulse`} style={{ animationDelay: '1s' }}></div>
          <div className={`absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-gradient-to-r ${getGenderColor()} rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2 opacity-50`}></div>
        </div>
        
        {/* Gradient Overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/50"></div>
        
        {/* Noise texture for premium feel */}
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")' }}></div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className={`text-xs font-bold uppercase tracking-wider ${getAccentColor()} text-white px-3 py-1 rounded-full`}>
                {mode === 'season' ? `${season} Season` : 'Career Highlights'}
              </div>
              <div className="text-white/60 text-sm font-medium">
                LeadPack XC
              </div>
            </div>
            <h1 className="text-5xl font-black text-white mb-2 leading-tight">
              {athleteName}
            </h1>
            <p className="text-white/70 text-lg">
              Grade {grade} • {teamName}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 auto-rows-min">
            {/* PR Time with Sparkline and Best Race Name - FULL WIDTH */}
            <div className="col-span-2 bg-white/5 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/10 transition-all shadow-lg">
              <p className="text-white/60 text-sm uppercase tracking-wide mb-2">
                {mode === 'season' ? 'Season Best 5K' : 'Personal Record 5K'}
              </p>
              <p className="text-5xl font-black text-white mb-2 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {formatTime(stats.prTime)}
              </p>
              {stats.bestRaceName && (
                <p className="text-white/50 text-xs mt-2 truncate" title={stats.bestRaceName}>
                  {stats.bestRaceName}
                </p>
              )}
              {stats.progressionData && stats.progressionData.length > 1 && (
                <div className="text-white/60 mt-2">
                  {renderSparkline()}
                </div>
              )}
            </div>

            {/* Total Races */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/10 transition-all shadow-lg">
              <p className="text-white/60 text-sm uppercase tracking-wide mb-2">
                Total Races
              </p>
              <p className="text-5xl font-black text-white bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {stats.totalRaces}
              </p>
            </div>

            {/* Total Miles */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/10 transition-all shadow-lg">
              <p className="text-white/60 text-sm uppercase tracking-wide mb-2">
                Total Miles
              </p>
              <p className="text-5xl font-black text-white bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                {stats.totalMiles.toFixed(1)}
              </p>
              <p className="text-white/40 text-xs mt-1">miles raced</p>
            </div>

            {/* 1 Mile PR */}
            {stats.milePR && stats.milePR > 0 && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/10 transition-all shadow-lg">
                <p className="text-white/60 text-sm uppercase tracking-wide mb-2">
                  1 Mile PR
                </p>
                <p className="text-5xl font-black text-white bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                  {formatPace(stats.milePR)}
                </p>
              </div>
            )}

            {/* Time Improvement */}
            {stats.timeDropped && stats.timeDropped > 0 && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6">
                <p className="text-white/60 text-sm uppercase tracking-wide mb-2">
                  Time Dropped
                </p>
                <p className="text-5xl font-black text-green-400">
                  {Math.floor(stats.timeDropped / 60)}:{String(Math.floor(stats.timeDropped % 60)).padStart(2, '0')}
                </p>
                <p className="text-white/40 text-xs mt-1">faster</p>
              </div>
            )}

            {/* Improvement (if season mode and available) */}
            {mode === 'season' && stats.improvement !== undefined && stats.improvement > 0 && (
              <div className="col-span-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl p-6 border border-green-500/30">
                <p className="text-green-300 text-sm uppercase tracking-wide mb-2">
                  Season Improvement
                </p>
                <div className="flex items-baseline gap-4">
                  <p className="text-5xl font-black text-green-400">
                    {stats.improvement.toFixed(1)}%
                  </p>
                  {stats.timeDropped && stats.timeDropped > 0 && (
                    <p className="text-2xl font-bold text-green-300">
                      -{Math.floor(stats.timeDropped / 60)}:{String(Math.floor(stats.timeDropped % 60)).padStart(2, '0')} faster
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Best Races by Distance */}
            {stats.bestRacesByDistance && stats.bestRacesByDistance.length > 0 && (
              <div className="col-span-2 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
                <p className="text-white/80 text-sm uppercase tracking-wider mb-4 font-bold">
                  🏆 Best Races by Distance
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {stats.bestRacesByDistance.map((race) => (
                    <div key={race.distance} className="bg-white/10 rounded-xl p-4 hover:bg-white/15 transition-all">
                      <p className="text-white/60 text-xs uppercase mb-1 font-semibold">{race.distance}</p>
                      <p className="text-3xl font-black text-white bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                        {formatTime(race.time)}
                      </p>
                      <p className="text-white/50 text-xs mt-2 truncate" title={race.raceName}>
                        {race.raceName}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-white/40 text-sm">
                {new Date().getFullYear()} • Cross Country
              </div>
              <div className={`${getAccentColor()} w-12 h-12 rounded-full flex items-center justify-center`}>
                <span className="text-white font-black text-xl">🏃</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
