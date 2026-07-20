import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SimulationNodeDatum } from 'd3-force';
import { scaleLinear } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { select } from 'd3-selection';
import { formatTime } from '@/lib/formatUtils';
import { RaceResult } from '@/types/analytics';

interface SwarmChartProps {
  results: RaceResult[];
}

interface SimulationNode extends SimulationNodeDatum, RaceResult {
  id: string;
}

const greenScale = scaleLinear<string, string>()
  .domain([2, 10])
  .range(['#a8e063', '#248f24']);

const SwarmChart: React.FC<SwarmChartProps> = ({ results }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const xAxisRef = useRef<SVGGElement>(null);
  const [nodes, setNodes] = useState<SimulationNode[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const { width, height } = dimensions;

  const xScale = useMemo(() => {
    if (!results.length) return null;
    const timeExtent = [Math.min(...results.map(r => r.time)), Math.max(...results.map(r => r.time))];
    return scaleLinear().domain(timeExtent).range([50, width - 50]);
  }, [results, width]);

  useEffect(() => {
    if (!results.length || !xScale) return;

    const sortedResults = [...results].sort((a, b) => a.time - b.time);
    const animationNodes: SimulationNode[] = sortedResults.map((r, index) => ({ 
      ...r, 
      id: `${r.athleteId}-${index}`, 
      place: index + 1,
      x: 50,
      y: height / 2 + (Math.random() - 0.5) * 50,
      vx: 0,
      vy: 0
    }));

    const maxTime = Math.max(...results.map(r => r.time));
    const animationDuration = 8000; // 8 seconds total animation

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Update each node's position based on their race time
      const updatedNodes = animationNodes.map(node => {
        // Calculate how far this runner should be based on their time
        const runnerProgress = Math.min(progress * (maxTime / node.time), 1);
        const targetX = xScale(node.time);
        const currentX = 50 + (targetX - 50) * runnerProgress;
        
        return {
          ...node,
          x: currentX,
          y: height / 2 + (Math.random() - 0.5) * 20 // Small vertical variation
        };
      });

      setNodes(updatedNodes);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      startTimeRef.current = null;
    };
  }, [results, xScale, height]);

  useEffect(() => {
    if (xScale && xAxisRef.current) {
      const xAxis = axisBottom(xScale).ticks(5).tickFormat((d) => formatTime(d as number));
      select(xAxisRef.current).call(xAxis);
    }
  }, [xScale]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} width={width} height={height}>
        <g ref={xAxisRef} transform={`translate(0, ${height - 30})`} />
        <g>
          {nodes.map(node => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={6}
                fill={node.place === 1 ? '#00ff00' : (node.place && node.place >= 2 && node.place <= 10) ? greenScale(node.place) : node.pr ? 'gold' : 'steelblue'}
                stroke="white"
                strokeWidth={1.5}
                onMouseOver={() => {
                  if (node.x && node.y) {
                    setTooltip({
                      x: node.x,
                      y: node.y - 10,
                      content: `${node.name}: ${formatTime(node.time)}`,
                    });
                  }
                }}
                onMouseOut={() => setTooltip(null)}
              />
            </g>
          ))}
        </g>
        {tooltip && (
          <g transform={`translate(${tooltip.x}, ${tooltip.y})`}>
            <rect x="-50" y="-25" width="100" height="20" fill="black" opacity="0.7" rx="3" />
            <text x="0" y="-12" textAnchor="middle" fill="white" fontSize="10">
              {tooltip.content}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

export default SwarmChart;
