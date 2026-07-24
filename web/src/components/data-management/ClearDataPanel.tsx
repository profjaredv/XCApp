import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "../../components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { useClearData } from "../../hooks/useDataManagement";

interface ClearDataPanelProps {
  teamId: string;
  season: string;
  onComplete: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export function ClearDataPanel({ teamId, season, onComplete, setIsProcessing }: ClearDataPanelProps) {
  const { toast } = useToast();
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [clearingStatus, setClearingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Use the clear data mutation hook
  const clearDataMutation = useClearData();
  const isClearing = clearDataMutation.isPending;

  const handleClearData = async () => {
    setIsProcessing(true);
    setClearingStatus('loading');
    
    try {
      // Call the mutation to clear data
      const data = await clearDataMutation.mutateAsync({ teamId, season });
      
      setClearingStatus('success');
      toast({
        title: "Data Cleared Successfully",
        description: `Removed ${data.racesDeleted || 0} races, ${data.resultsDeleted || 0} results, and ${data.metricsDeleted || 0} metrics.`,
      });
      
      // Wait a moment before completing to let the user see the success state
      setTimeout(() => {
        setIsProcessing(false);
        onComplete();
      }, 1500);
      
    } catch (error) {
      setClearingStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      setIsProcessing(false);
      
      toast({
        variant: "destructive",
        title: "Error Clearing Data",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  const handleSkip = () => {
    toast({
      title: "Step Skipped",
      description: "You've skipped the data clearing step. Existing data will remain.",
    });
    onComplete();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Clear Season Data</CardTitle>
        <CardDescription>
          Clear existing data for season {season} before importing new data.
          This helps prevent duplicate entries and ensures accurate metrics.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            This will remove all races, results, and metrics for the selected season.
            Athlete profiles will be preserved. This action cannot be undone.
          </AlertDescription>
        </Alert>
        
        {clearingStatus === 'loading' && (
          <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Clearing data for season {season}...</p>
            <p className="text-sm text-muted-foreground">This may take a moment.</p>
          </div>
        )}
        
        {clearingStatus === 'success' && (
          <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">Data cleared successfully!</p>
            <p className="text-sm text-muted-foreground">You can now proceed to import new data.</p>
          </div>
        )}
        
        {clearingStatus === 'error' && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {errorMessage || 'Failed to clear data. Please try again.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleSkip} disabled={isClearing}>
          Skip This Step
        </Button>
        
        <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isClearing || clearingStatus === 'success'}>
              {isClearing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                'Clear Season Data'
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Data Clearing</DialogTitle>
              <DialogDescription>
                Are you sure you want to clear all data for season {season}? 
                This will remove all races, results, and metrics for this season.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  setIsConfirmDialogOpen(false);
                  handleClearData();
                }}
              >
                Yes, Clear Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
