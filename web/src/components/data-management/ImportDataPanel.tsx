import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "../../components/ui/use-toast";
import { Progress } from "../../components/ui/progress";
import { useImportData } from "../../hooks/useDataManagement";
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ImportDataPanelProps {
  teamId: string;
  season: string;
  onComplete: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export function ImportDataPanel({ teamId, season, onComplete, setIsProcessing }: ImportDataPanelProps) {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [athleticNetTeamId, setAthleticNetTeamId] = useState<string>(currentUser?.team?.athleticTeamId || '');
  const [importStats, setImportStats] = useState<{
    races: number;
    athletes: number;
    results: number;
  } | null>(null);
  
  // Use the import data mutation hook
  const importDataMutation = useImportData();
  const isImporting = importDataMutation.isPending;

  // Keep the Athletic.net Team ID in sync with the authenticated user's team
  useEffect(() => {
    const fromProfile = currentUser?.team?.athleticTeamId || '';
    setAthleticNetTeamId((prev) => (prev ? prev : fromProfile));
  }, [currentUser?.team?.athleticTeamId]);

  // Simulate progress updates
  const startProgressSimulation = () => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 10;
      });
    }, 1000);

    return () => clearInterval(interval);
  };

  const handleImportData = async () => {
    if (!athleticNetTeamId) {
      toast({
        variant: "destructive",
        title: "Athletic.net Team ID Required",
        description: "Please enter the Athletic.net Team ID to import data.",
      });
      return;
    }

    setIsProcessing(true);
    setImportStatus('loading');
    
    // Start progress simulation
    const stopProgressSimulation = startProgressSimulation();
    
    try {
      // Call the mutation to import data
      const data = await importDataMutation.mutateAsync({
        teamId,
        season,
        athleticNetTeamId
      });
      
      // Set progress to 100% when complete
      setProgress(100);
      
      // Update import stats
      setImportStats({
        races: data.racesImported || 0,
        athletes: data.athletesImported || 0,
        results: data.resultsImported || 0,
      });
      
      setImportStatus('success');
      toast({
        title: "Data Imported Successfully",
        description: `Imported ${data.racesImported || 0} races, ${data.athletesImported || 0} athletes, and ${data.resultsImported || 0} results.`,
      });
      
      // Wait a moment before completing to let the user see the success state
      setTimeout(() => {
        setIsProcessing(false);
        onComplete();
      }, 1500);
      
    } catch (error) {
      stopProgressSimulation();
      setImportStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      setIsProcessing(false);
      
      toast({
        variant: "destructive",
        title: "Error Importing Data",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Import Season Data</CardTitle>
        <CardDescription>
          Import race data for season {season} from Athletic.net.
          This will create or update athletes, races, and results.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {importStatus === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="athleticNetTeamId">Athletic.net Team ID</Label>
              <Input
                id="athleticNetTeamId"
                placeholder="e.g., 460"
                value={athleticNetTeamId}
                onChange={(e) => setAthleticNetTeamId(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                You can find this ID in the URL of your team's Athletic.net page.
              </p>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>
                This process will import all races for the selected season.
                It may take several minutes depending on the amount of data.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {importStatus === 'loading' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Importing data for season {season}...</p>
              <p className="text-sm text-muted-foreground">This may take several minutes.</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </div>
        )}
        
        {importStatus === 'success' && importStats && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">Data imported successfully!</p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{importStats.races}</p>
                <p className="text-sm text-muted-foreground">Races</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{importStats.athletes}</p>
                <p className="text-sm text-muted-foreground">Athletes</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{importStats.results}</p>
                <p className="text-sm text-muted-foreground">Results</p>
              </div>
            </div>
            
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                You can now proceed to calculate metrics for this data.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {importStatus === 'error' && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {errorMessage || 'Failed to import data. Please try again.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end">
        {importStatus === 'idle' && (
          <Button onClick={handleImportData} disabled={isImporting || !athleticNetTeamId}>
            Import Data
          </Button>
        )}
        
        {importStatus === 'loading' && (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importing...
          </Button>
        )}
        
        {importStatus === 'success' && (
          <Button onClick={onComplete}>
            Continue to Next Step
          </Button>
        )}
        
        {importStatus === 'error' && (
          <Button onClick={handleImportData} disabled={isImporting || !athleticNetTeamId}>
            Try Again
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
