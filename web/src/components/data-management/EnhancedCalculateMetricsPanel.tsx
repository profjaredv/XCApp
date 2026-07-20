import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { useToast } from "../../components/ui/use-toast";
import { Progress } from "../../components/ui/progress";
import { useCalculateMetrics } from "../../hooks/useDataManagement";

interface EnhancedCalculateMetricsPanelProps {
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

export function EnhancedCalculateMetricsPanel({ teamId, season, onComplete, setIsProcessing }: EnhancedCalculateMetricsPanelProps) {
  const { toast } = useToast();
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [stats, setStats] = useState<CalculationStats | null>(null);
  
  // Use unified calculation (no more separate enhanced)
  const calculateMetricsMutation = useCalculateMetrics();
  const isCalculating = calculateMetricsMutation.isPending;

  // Unified calculation steps (includes all enhanced metrics)
  const calculationSteps = [
    'Processing athlete race metrics',
    'Calculating meet performance metrics',
    'Computing team metrics',
    'Calculating distance-specific performance',
    'Analyzing team depth and pack running',
    'Storing comprehensive analytics data'
  ];

  // Simulate progress updates with steps
  const startProgressSimulation = () => {
    setProgress(0);
    let stepIndex = 0;
    setCurrentStep(calculationSteps[stepIndex]);

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + Math.random() * 3;
        
        // Update step based on progress
        const stepThreshold = 100 / calculationSteps.length;
        const currentStepIndex = Math.floor(newProgress / stepThreshold);
        if (currentStepIndex < calculationSteps.length && currentStepIndex !== stepIndex) {
          stepIndex = currentStepIndex;
          setCurrentStep(calculationSteps[stepIndex]);
        }
        
        if (newProgress >= 95) {
          clearInterval(interval);
          return 95;
        }
        return newProgress;
      });
    }, 1000);

    return () => clearInterval(interval);
  };

  const handleCalculateMetrics = async () => {
    setIsProcessing(true);
    setCalculationStatus('loading');
    
    // Start progress simulation
    const stopProgressSimulation = startProgressSimulation();
    
    try {
      // Call unified metrics calculation (includes all enhanced metrics)
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
        title: 'Metrics Calculated Successfully',
        description: 'All performance metrics including enhanced analytics have been calculated and stored.',
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
          Calculate comprehensive performance metrics for season {season}.
          This includes all basic and enhanced analytics in one unified calculation.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {calculationStatus === 'idle' && (
          <div className="space-y-6">
            <Alert className="border-blue-200 bg-blue-50">
              <Zap className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Unified Metrics Calculation</AlertTitle>
              <AlertDescription className="text-blue-700">
                Calculates comprehensive analytics including:
                <ul className="list-disc pl-6 mt-2">
                  <li><strong>Athlete race metrics</strong> (total races, miles, pace)</li>
                  <li><strong>Team aggregate metrics</strong> and meet performance</li>
                  <li><strong>Distance-specific analysis</strong> (1-mile, 1.5-mile, 3-mile, 5K averages)</li>
                  <li><strong>Gender and grade breakdowns</strong> (men/women, 9th/10th/11th/12th)</li>
                  <li><strong>Team depth analysis</strong> (pack running, top 5/7 spreads)</li>
                  <li><strong>Season progression tracking</strong> (early vs late season improvement)</li>
                </ul>
                This process typically takes 2-3 minutes for complete analysis.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {calculationStatus === 'loading' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">
                Calculating comprehensive metrics for season {season}...
              </p>
              <p className="text-sm text-muted-foreground">
                This may take 2-3 minutes.
              </p>
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
                    {progress > (index * 100 / calculationSteps.length) ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <div className="h-4 w-4 mr-2 rounded-full border border-muted-foreground" />
                    )}
                    <span className={progress > (index * 100 / calculationSteps.length) ? 'text-green-500 font-medium' : ''}>
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
              <p className="text-lg font-medium">
                Metrics calculated successfully!
              </p>
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
            
            <Alert className="bg-blue-50 border-blue-200">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <AlertTitle>All Done!</AlertTitle>
              <AlertDescription>
                All metrics including enhanced analytics have been calculated and stored. 
                You can now view comprehensive analytics for this season.
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
            <Zap className="mr-2 h-4 w-4" />
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
