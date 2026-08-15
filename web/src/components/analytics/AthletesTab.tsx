import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { formatTime, formatPace } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
import type { Athlete } from '@/types/analytics';

interface AthletesTabProps {
  searchTerm: string;
  handleSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  genderFilter: 'all' | 'M' | 'F';
  handleGenderFilterChange: (value: 'all' | 'M' | 'F') => void;
  gradeFilter: string;
  handleGradeFilterChange: (value: string) => void;
  grades: number[];
  filteredAthletes: Athlete[];
  setSelectedAthlete: (athlete: Athlete) => void;
  getGradeBorderColor: (grade: number) => string;
}

export const AthletesTab = ({ 
  searchTerm, 
  handleSearch, 
  genderFilter, 
  handleGenderFilterChange, 
  gradeFilter, 
  handleGradeFilterChange, 
  grades, 
  filteredAthletes, 
  setSelectedAthlete,
  getGradeBorderColor
}: AthletesTabProps) => {
  return (
    <div>
      <div className="flex items-center mb-4 gap-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search athletes..." value={searchTerm} onChange={handleSearch} className="pl-10" />
        </div>
        <Select value={genderFilter} onValueChange={handleGenderFilterChange as (value: string) => void}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by gender" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="M">Boys</SelectItem>
            <SelectItem value="F">Girls</SelectItem>
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={handleGradeFilterChange}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by grade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {grades.map(grade => (
              <SelectItem key={grade} value={grade.toString()}>{gradeLabel(grade)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAthletes.map((athlete: Athlete) => (
          <Card key={athlete.id} onClick={() => setSelectedAthlete(athlete)} className={`cursor-pointer hover:shadow-lg transition-shadow border-b-4 ${getGradeBorderColor(athlete.currentGrade)}`}>
            <CardHeader>
              <CardTitle>{athlete.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{gradeLabel(athlete.currentGrade)} &bull; {athlete.gender === 'M' ? 'Boys' : athlete.gender === 'F' ? 'Girls' : athlete.gender || 'Unknown'}</p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <p className="text-muted-foreground">SB 5K</p>
                    <p className="font-semibold">{formatTime(athlete.bestTime)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground">PR 5K</p>
                    <p className="font-semibold">{formatTime(athlete.prBest5K || athlete.bestTime)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground">Avg. Pace</p>
                    <p className="font-semibold">{formatPace(athlete.avgPace)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground">Races</p>
                    <p className="font-semibold">{athlete.raceCount ?? athlete.races.length}</p>
                </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
