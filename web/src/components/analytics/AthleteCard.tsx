import React from 'react';
import { Athlete } from '../../types/analytics';
import { formatTime, formatPace } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface AthleteCardProps {
  athlete: Athlete;
}

export const AthleteCard: React.FC<AthleteCardProps> = ({ athlete }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/athlete/${athlete.id}`);
  };

  return (
    <div 
      className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{athlete.name}</h3>
          <p className="text-sm text-gray-500">Grade {athlete.currentGrade} • {athlete.gender === 'M' ? 'Boys' : 'Girls'}</p>
        </div>
        <div className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
          {athlete.teamName || 'Team'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Best Time</p>
          <p className="font-medium">
            {athlete.bestTime ? formatTime(athlete.bestTime) : 'N/A'}
          </p>
          {athlete.currentSeason?.bestRace && (
            <p className="text-xs text-gray-500">
              {athlete.currentSeason.bestRace.name}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500">Avg Pace</p>
          <p className="font-medium">
            {athlete.avgPace ? formatPace(athlete.avgPace) : 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500">Races</p>
          <p className="font-medium">{athlete.raceCount || 0}</p>
        </div>

        <div>
          <p className="text-xs text-gray-500">Improvement</p>
          <div className="flex items-baseline gap-1">
            {athlete.firstRaceTime && athlete.lastRaceTime && (
              <span className="text-[10px] text-gray-400">
                {formatTime(athlete.firstRaceTime)} → {formatTime(athlete.lastRaceTime)}
              </span>
            )}
            <p className={`font-medium ${athlete.improvementPercent > 0 ? 'text-green-600' : 'text-gray-600'}`}>
              {athlete.improvementPercent > 0 ? '+' : ''}
              {athlete.improvementPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {athlete.personalBests && Object.keys(athlete.personalBests).length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-gray-500 mb-1">Personal Bests</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(athlete.personalBests).map(([distance, time]) => (
              <div key={distance} className="text-xs bg-gray-100 rounded-full px-2 py-1">
                {distance}: {formatTime(time)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
