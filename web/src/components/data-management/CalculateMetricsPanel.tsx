import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2, BarChart2 } from "lucide-react";
import { useToast } from "../../components/ui/use-toast";
import { Progress } from "../../components/ui/progress";
import { useCalculateMetrics } from "../../hooks/useDataManagement";

interface CalculateMetricsPanelProps {
  teamId: string;
  season: string;
  onComplete: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

interface CalculationStats {
  totalAthletes: number;
  totalRaces: number;
  totalResults: number;
  totalMiles: number;
}

export function CalculateMetricsPanel({ teamId, season, onComplete, setIsProcessing }: CalculateMetricsPanelProps) {
  const { toast } = useToast();
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [stats, setStats] = useState<CalculationStats | null>(null);
  
  // Use the calculate metrics mutation hook
  const calculateMetricsMutation = useCalculateMetrics();
  const isCalculating = calculateMetricsMutation.isPending;

  // Calculation steps for display
  const calculationSteps = [
    'Processing athlete race metrics',
    'Calculating team metrics',
    'Computing meet performance metrics',
    'Storing results in database'
  ];

  // Simulate progress updates with steps
  const startProgressSimulation = () => {
    setProgress(0);
    let stepIndex = 0;
    setCurrentStep(calculationSteps[stepIndex]);

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + Math.random() * 5;
        
        // Update step based on progress
        if (newProgress > 25 && stepIndex === 0) {
          stepIndex = 1;
          setCurrentStep(calculationSteps[stepIndex]);
        } else if (newProgress > 50 && stepIndex === 1) {
          stepIndex = 2;
          setCurrentStep(calculationSteps[stepIndex]);
        } else if (newProgress > 75 && stepIndex === 2) {
          stepIndex = 3;
          setCurrentStep(calculationSteps[stepIndex]);
        }
        
        if (newProgress >= 95) {
          clearInterval(interval);
          return 95;
        }
        return newProgress;
      });
    }, 800);

    return () => clearInterval(interval);
  };

  const handleCalculateMetrics = async () => {
    setIsProcessing(true);
    setCalculationStatus('loading');
    
    // Start progress simulation
    const stopProgressSimulation = startProgressSimulation();
    
    try {
      // Call the mutation to calculate metrics
      const data = await calculateMetricsMutation.mutateAsync({
        teamId,
        season
      });
      
      // Set progress to 100% when complete
      setProgress(100);
      setCurrentStep('Calculation complete');
      
      // Update calculation stats
      setStats({
        totalAthletes: data.athleteCount || 0,
        totalRaces: data.raceCount || 0,
        totalResults: data.resultCount || 0,
        totalMiles: data.totalMiles || 0
      });
      
      setCalculationStatus('success');
      toast({
        title: "Metrics Calculated Successfully",
        description: "All performance metrics have been calculated and stored.",
      });
      
      // Wait a moment before completing to let the user see the success state
      setTimeout(() => {
        setIsProcessing(false);
        onComplete();
      }, 1500);
      
    } catch (error) {
      stopProgressSimulation();
      setCalculationStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      setIsProcessing(false);
      
      toast({
        variant: "destructive",
        title: "Error Calculating Metrics",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Calculate Metrics</CardTitle>
        <CardDescription>
          Calculate performance metrics for season {season}.
          This step is required for data to appear correctly in analytics.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {calculationStatus === 'idle' && (
          <div className="space-y-4">
            <Alert>
              <BarChart2 className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                This step calculates all performance metrics including:
                <ul className="list-disc pl-6 mt-2">
                  <li>Athlete race metrics (total races, miles, pace)</li>
                  <li>Team aggregate metrics</li>
                  <li>Meet performance analysis</li>
                </ul>
                This process may take several minutes for large datasets.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {calculationStatus === 'loading' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Calculating metrics for season {season}...</p>
              <p className="text-sm text-muted-foreground">This may take several minutes.</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{currentStep}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
            
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Current Process:</p>
              <ul className="space-y-2">
                {calculationSteps.map((step, index) => (
                  <li key={index} className="flex items-center text-sm">
                    {progress > index * 25 ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <div className="h-4 w-4 mr-2 rounded-full border border-muted-foreground" />
                    )}
                    <span className={progress > index * 25 ? 'text-green-500 font-medium' : ''}>
                      {step}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {calculationStatus === 'success' && stats && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">Metrics calculated successfully!</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalAthletes}</p>
                <p className="text-sm text-muted-foreground">Athletes</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalRaces}</p>
                <p className="text-sm text-muted-foreground">Races</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalResults}</p>
                <p className="text-sm text-muted-foreground">Results</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalMiles.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">Total Miles</p>
              </div>
            </div>
            
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle>All Done!</AlertTitle>
              <AlertDescription>
                All metrics have been calculated and stored. You can now view analytics for this season.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {calculationStatus === 'error' && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {errorMessage || 'Failed to calculate metrics. Please try again.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end">
        {calculationStatus === 'idle' && (
          <Button onClick={handleCalculateMetrics} disabled={isCalculating}>
            Calculate Metrics
          </Button>
        )}
        
        {calculationStatus === 'loading' && (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Calculating...
          </Button>
        )}
        
        {calculationStatus === 'success' && (
          <Button onClick={onComplete}>
            View Analytics
          </Button>
        )}
        
        {calculationStatus === 'error' && (
          <Button onClick={handleCalculateMetrics} disabled={isCalculating}>
            Try Again
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
