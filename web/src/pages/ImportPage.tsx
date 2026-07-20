import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { axiosInstance } from '@/api/axios';
import { auth } from '@/firebase';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useInvalidatePerformanceCache } from '../hooks/usePerformanceMetrics';

const ImportPage: React.FC = () => {
  const { currentUser } = useAuth();
  const currentYear = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(true);
  const [isLongRunning, setIsLongRunning] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const invalidateCache = useInvalidatePerformanceCache();
  const pollRef = useRef<number | null>(null);
  // Roster-only import state
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [rosterSuccess, setRosterSuccess] = useState('');

  // Rotating, punny loading messages
  const loadingMessages = useMemo(
    () => [
      'Lacing up the spikes...',
      'Stretching hamstrings and endpoints...',
      'Doing strides with the scraper...',
      'Hydrating the database...',
      'Checking the course map...',
      'Finding the starting line on Athletic.net...',
      'Splitting times and parsing lines...',
      'Passing the baton to Firestore...',
      'Kicking into the final 400m...'
    ],
    []
  );

  useEffect(() => {
    if (!loading) return;
    setLoadingMsgIndex(0);
    const id = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % loadingMessages.length);
    }, 2000);
    return () => clearInterval(id);
  }, [loading, loadingMessages.length]);

  // Long-running watchdog (45 seconds)
  useEffect(() => {
    if (!loading) {
      setIsLongRunning(false);
      return;
    }
    const timer = setTimeout(() => setIsLongRunning(true), 45000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Poll seasons to detect completion in background
  useEffect(() => {
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(async () => {
        try {
          const res = await axiosInstance.get('/teams/seasons');
          const seasons: number[] = res.data?.seasons || res.data || [];
          const yearNum = Number(selectedYear);
          if (Array.isArray(seasons) && seasons.includes(yearNum)) {
            setSuccess(`Import complete for ${selectedYear}.`);
            setError('');
            setLoading(false);
          }
        } catch {
          // ignore polling errors
        }
      }, 10000);
    };

    if (loading || isLongRunning) {
      startPolling();
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loading, isLongRunning, selectedYear]);

  const handleImport = async () => {
    if (!currentUser?.team) {
      setError('You must be part of a team to import data.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setIsLongRunning(false);

    try {
      // If update mode is enabled and it's the current season, clear the season results first
      if (isUpdateMode && selectedYear === currentYear) {
        try {
          await axiosInstance.delete(`/seasons/${selectedYear}/results`);
          toast.success(`Cleared existing results for ${selectedYear} season.`);
        } catch (clearErr) {
          console.error('Error clearing season results:', clearErr);
          toast.error('Failed to clear existing results. Continuing with import.');
          // Continue with import despite clear error
        }
      }
      
      const token = await auth.currentUser?.getIdToken();
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await axiosInstance.post(
        `/teams/scrape`,
        { year: selectedYear },
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
      setSuccess(response.data.message || `Successfully imported data for the ${selectedYear} season.`);
      
      // Invalidate performance cache to refresh data
      if (currentUser?.team?._id) {
        // Invalidate all performance data for this team
        await invalidateCache('all');
        toast.info('Performance data cache refreshed.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === 'ERR_CANCELED') {
          setError('Import canceled.');
        } else {
          setError(err.response?.data?.message || err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during import.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handleImportRosterOnly = async () => {
    if (!currentUser?.team) {
      setRosterError('You must be part of a team to import a roster.');
      return;
    }
    setRosterLoading(true);
    setRosterError('');
    setRosterSuccess('');
    try {
      const res = await axiosInstance.post('/teams/roster-scrape', { year: selectedYear });
      setRosterSuccess(res.data?.message || `Roster imported for ${selectedYear}.`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRosterError(err.response?.data?.message || err.message);
      } else if (err instanceof Error) {
        setRosterError(err.message);
      } else {
        setRosterError('An unexpected error occurred importing roster.');
      }
    } finally {
      setRosterLoading(false);
    }
  };

  const handleClearData = async () => {
    if (!currentUser?.team) {
      setError('You must be part of a team to clear data.');
      return;
    }

    setIsClearing(true);
    setError('');
    setSuccess('');

    try {
      const response = await axiosInstance.delete('/teams/data');
      toast.success(response.data.message || 'Team data cleared successfully.');
      
      // Invalidate performance cache to refresh data
      if (currentUser?.team?._id) {
        // Invalidate all performance data for this team
        await invalidateCache('all');
        toast.info('Performance data cache refreshed.');
      }
    } catch (err) {
      let errorMessage = 'An unexpected error occurred.';
      if (axios.isAxiosError(err)) {
        errorMessage = err.response?.data?.message || err.message;
      }
      toast.error(`Failed to clear data: ${errorMessage}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Import Data</h1>
      <Card>
        <CardHeader>
          <CardTitle>Import Season Data</CardTitle>
          <CardDescription>
            Import race results from Athletic.net for a specific season.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentUser?.role === 'coach' ? (
            <div className="flex flex-col gap-4">
              <p>Select a season to import race results from Athletic.net. Importing a previous season is a one-time operation. The current season can be re-imported to fetch the latest results.</p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => {
                        const yearStr = year.toString();
                        const isImported = currentUser?.team?.importedSeasons?.includes(year);

                        return (
                          <SelectItem key={year} value={yearStr}>
                            {yearStr} {isImported && '(Imported)'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleImport} disabled={loading}>
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {selectedYear === currentYear && isUpdateMode ? 'Updating...' : 'Importing...'}
                      </span>
                    ) : (
                      selectedYear === currentYear && isUpdateMode ? `Update ${selectedYear} Season` : `Import ${selectedYear} Season`
                    )}
                  </Button>
                  {loading && (
                    <Button variant="outline" onClick={handleCancel} disabled={!loading}>
                      Cancel
                    </Button>
                  )}
                </div>
                
                {selectedYear === currentYear && (
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="updateMode" 
                      checked={isUpdateMode} 
                      onCheckedChange={(checked) => setIsUpdateMode(checked === true)}
                    />
                    <Label htmlFor="updateMode" className="text-sm font-medium">
                      Update Season Results (clears existing results before importing)
                    </Label>
                  </div>
                )}
              </div>
              {loading && !isLongRunning && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>{loadingMessages[loadingMsgIndex]}</span>
                </div>
              )}
              {loading && isLongRunning && (
                <div className="text-sm text-muted-foreground">
                  <p>Taking longer than usual — Athletic.net can be a hilly course. We’re still working on it.</p>
                  <ul className="list-disc pl-5 mt-1">
                    <li>Keep this tab open until we finish the lap.</li>
                    <li>You can check the Analytics page to see partial results as they arrive.</li>
                  </ul>
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}
            </div>
          ) : (
            <p>You must be a coach to import data.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Roster Only</CardTitle>
          <CardDescription>
            Create/update the roster for the selected season without importing any results. Useful to set up the season when no races have happened yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentUser?.role === 'coach' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select a year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleImportRosterOnly} disabled={rosterLoading} variant="secondary">
                  {rosterLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing Roster...
                    </span>
                  ) : (
                    `Import ${selectedYear} Roster`
                  )}
                </Button>
              </div>
              {rosterError && <p className="text-sm text-red-600">{rosterError}</p>}
              {rosterSuccess && <p className="text-sm text-green-600">{rosterSuccess}</p>}
            </div>
          ) : (
            <p>You must be a coach to import the roster.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>This action is permanent and cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isClearing}>
                {isClearing ? 'Clearing Data...' : 'Clear All Team Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all athletes, races, and results for your team. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearData}>Yes, clear all data</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportPage;
