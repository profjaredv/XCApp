import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface RaceResult {
  id: string;
  name: string;
  time: number;
  place: number;
  team?: string;
}

interface RaceVisualizationProps {
  isOpen: boolean;
  onClose: () => void;
  raceName: string;
  results: RaceResult[];
}

const RaceVisualization: React.FC<RaceVisualizationProps> = ({
  isOpen = false,
  onClose,
  raceName = '',
  results = [],
}) => {
  // Calculate time range for scaling and sort results
  const { minTime, maxTime, timeRange, sortedResults } = useMemo(() => {
    if (!results.length) {
      return { minTime: 0, maxTime: 1, timeRange: 1, sortedResults: [] };
    }
    
    const sorted = [...results].sort((a, b) => a.time - b.time);
    const min = Math.min(...sorted.map(r => r.time));
    const max = Math.max(...sorted.map(r => r.time));
    
    return {
      minTime: min,
      maxTime: max,
      timeRange: max - min || 1, // Avoid division by zero
      sortedResults: sorted
    };
  }, [results]);

  // State for tooltip
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    result: RaceResult | null;
  }>({ visible: false, x: 0, y: 0, result: null });

  // Calculate positions for each runner with better distribution
  const getPosition = (time: number, index: number) => {
    // Scale time to x position (0 to 90% of container width)
    const x = ((time - minTime) / timeRange) * 90 + 5; // 5% padding on each side
    
    // Distribute points vertically in a more organized way
    const row = index % 3; // 3 rows of points
    const baseY = 30 + (row * 20); // Base Y position based on row
    const offset = (Math.sin(index * 0.5) * 5); // Subtle wave pattern
    const y = baseY + offset;
    
    return { x, y };
  };

  // Handle point hover for tooltip
  const handlePointHover = (e: React.MouseEvent<SVGCircleElement>, result: RaceResult) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY - 50,
      result
    });
  };

  // Get color based on position
  const getColor = (place: number) => {
    if (place <= 10) return '#10b981'; // Green for top 10
    if (place <= results.length * 0.5) return '#3b82f6'; // Blue for top 50%
    return '#ef4444'; // Red for bottom 50%
  };

  if (!isOpen) return null;
  if (!results?.length) return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl p-6 text-white">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">{raceName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        <p>No race results available.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="relative bg-gray-900 rounded-xl w-full max-w-6xl h-[90vh] overflow-auto text-white">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/90 backdrop-blur-sm z-10 p-6 border-b border-gray-800">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{raceName}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-800 transition-colors"
              aria-label="Close visualization"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-300">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span>Top 10</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <span>Top 50%</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span>Bottom 50%</span>
            </div>
          </div>
        </div>

        {/* Visualization */}
        <div className="p-6">
          <div className="relative w-full h-[60vh] border border-gray-700 rounded-lg bg-gray-800/30">
            <svg width="100%" height="100%" className="overflow-visible">
              {/* X-axis */}
              <line
                x1="5%"
                y1="90%"
                x2="95%"
                y2="90%"
                stroke="#4b5563"
                strokeWidth="1.5"
              />
              
              {/* X-axis labels */}
              <text x="5%" y="95%" textAnchor="start" className="text-xs fill-gray-400">
                {formatTime(minTime)}
              </text>
              <text x="95%" y="95%" textAnchor="end" className="text-xs fill-gray-400">
                {formatTime(maxTime)}
              </text>
              
              {/* Data points */}
              {sortedResults.map((result: RaceResult, index: number) => {
                const { x, y } = getPosition(result.time, index);
                const color = getColor(result.place);
                
                return (
                  <g key={result.id}>
                    <circle
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r={6}
                      fill={color}
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth="1"
                      className="cursor-pointer transition-all duration-200 hover:opacity-80"
                      onMouseEnter={(e) => handlePointHover(e, result)}
                      onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                      data-runner-id={result.id}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip.visible && tooltip.result && (
              <div 
                className="absolute bg-gray-800 text-white p-3 rounded-lg shadow-xl border border-gray-700 z-50 pointer-events-none"
                style={{
                  left: `${tooltip.x}px`,
                  top: `${tooltip.y}px`,
                  transform: 'translateX(-50%)',
                  minWidth: '180px'
                }}
              >
                <div className="font-medium text-sm">{tooltip.result.name}</div>
                <div className="text-gray-300 text-sm mt-1">
                  {formatTime(tooltip.result.time)}
                </div>
                {tooltip.result.team && (
                  <div className="text-gray-400 text-xs mt-1">
                    {tooltip.result.team}
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-400">
                  {tooltip.result.place === 1 ? '🥇 1st' : 
                   tooltip.result.place === 2 ? '🥈 2nd' : 
                   tooltip.result.place === 3 ? '🥉 3rd' : 
                   `#${tooltip.result.place} Place`}
                </div>
              </div>
            )}
          </div>
          
          {/* Main Tooltip - Only one tooltip is needed */}
          {tooltip.visible && tooltip.result && (
            <div 
              className="absolute bg-gray-800 text-white p-3 rounded-lg shadow-xl border border-gray-700 z-50 pointer-events-none"
              style={{
                left: `${tooltip.x}px`,
                top: `${tooltip.y}px`,
                transform: 'translateX(-50%)',
                minWidth: '180px'
              }}
            >
              <div className="font-medium text-sm">{tooltip.result.name}</div>
              <div className="text-gray-300 text-sm mt-1">
                {formatTime(tooltip.result.time)}
              </div>
              {tooltip.result.team && (
                <div className="text-gray-400 text-xs mt-1">
                  {tooltip.result.team}
                </div>
              )}
              <div className="mt-1 text-xs text-gray-400">
                {tooltip.result.place === 1 ? '🥇 1st' : 
                 tooltip.result.place === 2 ? '🥈 2nd' : 
                 tooltip.result.place === 3 ? '🥉 3rd' : 
                 `#${tooltip.result.place} Place`}
              </div>
            </div>
          )}
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-6 pb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-300">Top 10</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-sm text-gray-300">Middle Pack</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-sm text-gray-300">Slower</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RaceVisualization;
