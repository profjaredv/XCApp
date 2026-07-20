import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from './ui/use-toast';
import { useCurrentSeason } from '../hooks/useSeasons';
import { seasonService } from '../api/seasonService';
import { axiosInstance } from '../api/axios';

interface ScraperControlsProps {
  teamId: string;
}

export const ScraperControls: React.FC<ScraperControlsProps> = ({ teamId }) => {
  const { data: currentSeason } = useCurrentSeason();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [clearFirst, setClearFirst] = useState(true);
  const { toast } = useToast();

  // Validate URL format
  const isValidAthleticNetUrl = (url: string): boolean => {
    return /^https?:\/\/(?:www\.)?athletic\.net\/(?:CrossCountry|TrackAndField)\/(?:Team|Meet)\/\d+/.test(url);
  };

  const handleScrape = async () => {
    // Input validation
    if (!url) {
      toast({
        title: 'Error',
        description: 'Please enter an Athletic.net URL',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidAthleticNetUrl(url)) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid Athletic.net team or meet URL',
        variant: 'destructive',
      });
      return;
    }

    if (!currentSeason) {
      toast({
        title: 'No Active Season',
        description: 'No active season found. Please create and activate a season first.',
        variant: 'destructive',
      });
      return;
    }

    if (!teamId) {
      toast({
        title: 'Missing Team ID',
        description: 'Team ID is required for scraping',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);

      // Clear existing results if option is selected
      if (clearFirst && currentSeason) {
        try {
          const clearResult = await seasonService.clearSeasonResults(currentSeason._id);
          toast({
            title: 'Results Cleared',
            description: `Cleared ${clearResult.count} results for the current season.`,
          });
        } catch (clearError) {
          console.error('Error clearing results:', clearError);
          toast({
            title: 'Warning',
            description: 'Failed to clear existing results. Continuing with scrape.',
            variant: 'destructive',
          });
          // Continue with scraping despite clear error
        }
      }

      // Call scraper endpoint
      const response = await axiosInstance.post('/scraper/run', {
        url,
        teamId,
        season: currentSeason?.year,
      });

      const resultsCount = response.data.count || 0;
      
      toast({
        title: 'Scraper Complete',
        description: `Successfully scraped ${resultsCount} results: ${response.data.message || 'Complete'}`,
      });
    } catch (error) {
      // Type guard for axios errors
      type AxiosError = {
        response?: {
          status: number;
          data?: { message?: string };
        };
        request?: unknown;
        message?: string;
      };
      
      const err = error as AxiosError;
      console.error('Scraper error:', error);
      
      // Handle different error types
      if (err.response) {
        // Server responded with error status
        const statusCode = err.response.status;
        const errorMessage = err.response.data?.message || 'Unknown server error';
        
        if (statusCode === 404) {
          toast({
            title: 'URL Not Found',
            description: 'The Athletic.net page could not be found. Please check the URL.',
            variant: 'destructive',
          });
        } else if (statusCode === 403) {
          toast({
            title: 'Access Denied',
            description: 'The scraper does not have permission to access this page.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: `Server Error (${statusCode})`,
            description: errorMessage,
            variant: 'destructive',
          });
        }
      } else if (err.request) {
        // Request made but no response received
        toast({
          title: 'Network Error',
          description: 'Could not connect to the server. Please check your internet connection.',
          variant: 'destructive',
        });
      } else {
        // Error setting up the request
        toast({
          title: 'Scraper Error',
          description: err.message || 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Athletic.net Scraper</CardTitle>
        <CardDescription>
          Enter an Athletic.net team or meet URL to scrape results
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="url">Athletic.net URL</Label>
          <Input
            id="url"
            placeholder="https://www.athletic.net/team/460/cross-country/2024"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="clearFirst" 
            checked={clearFirst} 
            onCheckedChange={(checked) => setClearFirst(checked === true)}
          />
          <Label htmlFor="clearFirst" className="text-sm font-medium">
            Clear existing season results before scraping
          </Label>
        </div>

        <div className="pt-2">
          <Button 
            onClick={handleScrape} 
            disabled={isLoading || !url || !currentSeason}
            className="w-full"
          >
            {isLoading ? 'Scraping...' : 'Start Scraping'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
