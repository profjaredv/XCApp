import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "../components/ui/tabs";
import { ResponsiveTabsList } from "../components/ui/responsive-tabs";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useToast } from "../components/ui/use-toast";
import { useTeam } from '../hooks/useTeam';
import { useAuth } from '../contexts/AuthContext';
import { useTeamPath } from '../hooks/useTeamRoute';
import { useSeasonSelection } from '../contexts/SeasonContext';
import { currentCalendarSeason } from '../lib/seasonUtils';
import { ClearDataPanel } from '../components/data-management/ClearDataPanel';
import { ImportDataPanel } from '../components/data-management/ImportDataPanel';
import { EnhancedCalculateMetricsPanel } from '../components/data-management/EnhancedCalculateMetricsPanel';

// Define the steps in the data management process
enum DataManagementStep {
  CLEAR = 'clear',
  IMPORT = 'import',
  CALCULATE = 'calculate'
}

export function DataManagementPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { currentTeam } = useTeam();
  const { currentUser } = useAuth();
  const [activeStep, setActiveStep] = useState<DataManagementStep>(DataManagementStep.CLEAR);
  // Shared with every other season-scoped screen (SeasonContext) — defaults
  // to the team's actual active season (accounts for imported data), not
  // the calendar year. The list below stays this page's own, though: a
  // coach importing a season's data for the first time needs to be able to
  // pick a year that doesn't exist in the system yet, which the shared
  // seasons list (seasons the team already "has") deliberately excludes.
  const { activeYear, setSelectedYear } = useSeasonSelection();
  const selectedSeason = activeYear != null ? String(activeYear) : String(currentCalendarSeason());
  const setSelectedSeason = (value: string) => setSelectedYear(Number(value));
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<Set<DataManagementStep>>(new Set());

  // Available seasons (current year and past 5 years) — deliberately not
  // the shared SeasonContext list, see comment above.
  const currentYear = new Date().getFullYear();
  const availableSeasons = Array.from({ length: 6 }, (_, i) => (currentYear - i).toString());

  // Mark a step as completed
  const markStepCompleted = (step: DataManagementStep) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  };

  // Check if a step is completed
  const isStepCompleted = (step: DataManagementStep) => {
    return completedSteps.has(step);
  };

  // Move to the next step
  const goToNextStep = () => {
    if (activeStep === DataManagementStep.CLEAR) {
      setActiveStep(DataManagementStep.IMPORT);
    } else if (activeStep === DataManagementStep.IMPORT) {
      setActiveStep(DataManagementStep.CALCULATE);
    } else {
      // If we're at the last step, show success message
      toast({
        title: "Process Complete",
        description: "All data management steps have been completed successfully.",
      });
    }
  };

  // Handle season change
  const handleSeasonChange = (value: string) => {
    setSelectedSeason(value);
    // Reset completed steps when season changes
    setCompletedSteps(new Set());
  };

  // Debug logging
  console.log('Current team:', currentTeam);
  
  // Resolve team id from either useTeam() or currentUser.team, prefer useTeam if present
  const getTeamId = (): string => {
    if (currentTeam) {
      if (typeof currentTeam === 'object' && currentTeam !== null) {
        if ('id' in currentTeam && typeof currentTeam.id === 'string') return currentTeam.id;
        if ('_id' in currentTeam && typeof currentTeam._id === 'string') return currentTeam._id;
      }
    }
    if (currentUser?.team) {
      if (typeof currentUser.team === 'object' && currentUser.team !== null) {
        if ('id' in currentUser.team && typeof currentUser.team.id === 'string') return currentUser.team.id;
        if ('_id' in currentUser.team && typeof currentUser.team._id === 'string') return currentUser.team._id;
      }
    }
    return '';
  };
  
  const teamId = getTeamId();
  
  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Team Required</CardTitle>
            <CardDescription>Please select a team to manage data.</CardDescription>
          </CardHeader>
          <CardFooter>
            {/* /teams was never a real route — there is no team switcher,
                each user has exactly one team, so the only path forward
                without one is onboarding. */}
            <Button onClick={() => navigate('/onboarding')}>Set Up a Team</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Data Management</h1>
      
      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-2">Current Team</p>
          <p className="font-medium">{currentTeam?.name || currentUser?.team?.name || 'Unknown Team'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Season</p>
          <Select value={selectedSeason} onValueChange={handleSeasonChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Season" />
            </SelectTrigger>
            <SelectContent>
              {availableSeasons.map(season => (
                <SelectItem key={season} value={season}>{season}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeStep} onValueChange={(value) => setActiveStep(value as DataManagementStep)}>
        <ResponsiveTabsList
          className="grid w-full grid-cols-3"
          value={activeStep}
          onValueChange={(value) => setActiveStep(value as DataManagementStep)}
        >
          <TabsTrigger value={DataManagementStep.CLEAR} disabled={isProcessing}>
            Step 1: Clear Data
            {isStepCompleted(DataManagementStep.CLEAR) && <span className="ml-2 text-green-500">✓</span>}
          </TabsTrigger>
          <TabsTrigger value={DataManagementStep.IMPORT} disabled={isProcessing}>
            Step 2: Import Data
            {isStepCompleted(DataManagementStep.IMPORT) && <span className="ml-2 text-green-500">✓</span>}
          </TabsTrigger>
          <TabsTrigger value={DataManagementStep.CALCULATE} disabled={isProcessing}>
            Step 3: Calculate Metrics
            {isStepCompleted(DataManagementStep.CALCULATE) && <span className="ml-2 text-green-500">✓</span>}
          </TabsTrigger>
        </ResponsiveTabsList>
        
        <TabsContent value={DataManagementStep.CLEAR}>
          <ClearDataPanel 
            teamId={teamId} 
            season={selectedSeason}
            onComplete={() => {
              markStepCompleted(DataManagementStep.CLEAR);
              goToNextStep();
            }}
            setIsProcessing={setIsProcessing}
          />
        </TabsContent>
        
        <TabsContent value={DataManagementStep.IMPORT}>
          <ImportDataPanel 
            teamId={teamId} 
            season={selectedSeason}
            onComplete={() => {
              markStepCompleted(DataManagementStep.IMPORT);
              goToNextStep();
            }}
            setIsProcessing={setIsProcessing}
          />
        </TabsContent>
        
        <TabsContent value={DataManagementStep.CALCULATE}>
          <EnhancedCalculateMetricsPanel 
            teamId={teamId} 
            season={selectedSeason}
            onComplete={() => {
              markStepCompleted(DataManagementStep.CALCULATE);
            }}
            setIsProcessing={setIsProcessing}
          />
        </TabsContent>
      </Tabs>
      
      <div className="mt-6 flex justify-between">
        <Button
          variant="outline"
          onClick={() => navigate(teamPath('/analytics'))}
          disabled={isProcessing}
        >
          Back to Dashboard
        </Button>
        
        <Button 
          onClick={goToNextStep} 
          disabled={isProcessing || !isStepCompleted(activeStep)}
        >
          {activeStep === DataManagementStep.CALCULATE ? 'Finish' : 'Next Step'}
        </Button>
      </div>
    </div>
  );
}

export default DataManagementPage;
