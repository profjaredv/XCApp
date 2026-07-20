import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Zap, BarChart3, Users, TrendingUp, Target, ArrowLeft } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useEnhancedTeamMetrics } from '../hooks/useEnhancedAnalytics';
import { EnhancedOverviewTab } from '../components/analytics/EnhancedOverviewTab';
import { DistanceAnalysisTab } from '../components/analytics/DistanceAnalysisTab';
import { RaceComparisonTab } from '../components/analytics/RaceComparisonTab';
import { EnhancedAthleteProfile } from '../components/analytics/EnhancedAthleteProfile';
import { Link } from 'react-router-dom';

export function EnhancedAnalyticsPage() {
  const { currentUser } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState<string>('2025');
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Get team ID (Supabase uses 'id', legacy MongoDB used '_id')
  const teamId = currentUser?.team?.id || currentUser?.team?._id;
  
  // Debug logging
  console.log('🔍 EnhancedAnalyticsPage - currentUser:', currentUser);
  console.log('🔍 EnhancedAnalyticsPage - team:', currentUser?.team);
  console.log('🔍 EnhancedAnalyticsPage - teamId:', teamId);

  // Fetch regular analytics data for athlete list
  const { 
    data: analyticsData
  } = useAnalyticsData(parseInt(selectedSeason));

  // Fetch enhanced team metrics to check if they exist
  const { 
    data: enhancedTeamMetrics,
    error: enhancedError,
    isLoading: isLoadingEnhanced
  } = useEnhancedTeamMetrics(teamId || '', selectedSeason);

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Team Required</CardTitle>
            <CardDescription>Please select a team to view enhanced analytics.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const availableSeasons = ['2022', '2023', '2024', '2025'];
  const athletes: Array<{ _id: string; name: string }> = (analyticsData?.athletes || []).map(athlete => ({
    _id: athlete.id,
    name: athlete.name
  }));

  const hasEnhancedData = !!enhancedTeamMetrics && !enhancedError;
  const needsCalculation = enhancedError?.message?.includes('Enhanced metrics not found');

  // Show loading state while calculating enhanced metrics
  if (isLoadingEnhanced) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/analytics">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Analytics
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Zap className="h-8 w-8 mr-3 text-blue-500" />
                Enhanced Analytics
              </h1>
              <p className="text-muted-foreground">
                Comprehensive performance analysis with advanced metrics
              </p>
            </div>
          </div>
        </div>
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Calculating Enhanced Metrics</h3>
            <p className="text-muted-foreground text-center max-w-md">
              We're analyzing your team's performance data to generate comprehensive metrics. 
              This may take 30-60 seconds for large datasets.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show message if enhanced metrics need to be calculated
  if (needsCalculation) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/analytics">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Analytics
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Zap className="h-8 w-8 mr-3 text-blue-500" />
                Enhanced Analytics
              </h1>
              <p className="text-muted-foreground">
                Comprehensive performance analysis with advanced metrics
              </p>
            </div>
          </div>
        </div>
        
        <Alert>
          <Target className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Enhanced Metrics Not Available</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Enhanced analytics require pre-calculated metrics for optimal performance. 
                  Please calculate enhanced metrics for the {selectedSeason} season first.
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <Link to="/data-management">
                  <Button>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Go to Data Management
                  </Button>
                </Link>
                <p className="text-xs text-muted-foreground">
                  Use "Calculate Enhanced Metrics" in Data Management
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/analytics">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Analytics
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Zap className="h-8 w-8 mr-3 text-blue-500" />
              Enhanced Analytics
            </h1>
            <p className="text-muted-foreground">
              Comprehensive performance analysis with advanced metrics
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableSeasons.map((season) => (
                <SelectItem key={season} value={season}>
                  {season}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {hasEnhancedData && (
            <Badge variant="default" className="bg-blue-500">
              <Zap className="h-3 w-3 mr-1" />
              Enhanced Data Available
            </Badge>
          )}
        </div>
      </div>

      {/* Enhanced Data Status */}
      {!hasEnhancedData && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Enhanced analytics data not found for {selectedSeason}. 
              Please run enhanced calculations in Data Management to unlock comprehensive analytics.
            </span>
            <Link to="/data-management">
              <Button size="sm" className="ml-4">
                <Target className="h-4 w-4 mr-2" />
                Calculate Enhanced Metrics
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      {hasEnhancedData ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="distances" className="flex items-center">
              <Target className="h-4 w-4 mr-2" />
              Distance Analysis
            </TabsTrigger>
            <TabsTrigger value="comparisons" className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Race Comparisons
            </TabsTrigger>
            <TabsTrigger value="athletes" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Athlete Profiles
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center">
              <Zap className="h-4 w-4 mr-2" />
              Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <EnhancedOverviewTab teamId={teamId} season={selectedSeason} />
          </TabsContent>

          <TabsContent value="distances">
            <DistanceAnalysisTab teamId={teamId} season={selectedSeason} />
          </TabsContent>

          <TabsContent value="comparisons">
            <RaceComparisonTab 
              teamId={teamId}
            />
          </TabsContent>

          <TabsContent value="athletes">
            <div className="space-y-6">
              {/* Athlete Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Enhanced Athlete Profiles</CardTitle>
                  <CardDescription>
                    Detailed performance analysis for individual athletes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium">Select Athlete:</label>
                    <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
                      <SelectTrigger className="w-[300px]">
                        <SelectValue placeholder="Choose an athlete to view enhanced profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {athletes.map((athlete) => (
                          <SelectItem key={athlete._id} value={athlete._id}>
                            {athlete.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Enhanced Athlete Profile */}
              {selectedAthlete && (
                <EnhancedAthleteProfile
                  athleteId={selectedAthlete}
                  athleteName={athletes.find(a => a._id === selectedAthlete)?.name || ''}
                  season={selectedSeason}
                />
              )}

              {!selectedAthlete && (
                <Card>
                  <CardContent className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select an Athlete</h3>
                    <p className="text-muted-foreground">
                      Choose an athlete from the dropdown above to view their enhanced performance profile
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Insights</CardTitle>
                  <CardDescription>
                    AI-powered insights and recommendations based on enhanced analytics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
                    <p className="text-muted-foreground">
                      AI-powered insights and performance recommendations will be available in a future update
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* Fallback content when no enhanced data */
        <Card>
          <CardHeader>
            <CardTitle>Enhanced Analytics Unavailable</CardTitle>
            <CardDescription>
              Enhanced analytics require additional data processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <Zap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">Unlock Enhanced Analytics</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Enhanced analytics provide comprehensive insights including distance-specific analysis, 
                season progression tracking, and season-over-season race comparisons.
              </p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  <div className="p-4 border rounded-lg">
                    <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <h4 className="font-medium">Distance Analysis</h4>
                    <p className="text-sm text-muted-foreground">Performance breakdown by race distance</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <h4 className="font-medium">Season Progression</h4>
                    <p className="text-sm text-muted-foreground">Track improvement throughout the season</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                    <h4 className="font-medium">Race Comparisons</h4>
                    <p className="text-sm text-muted-foreground">Compare performance across seasons</p>
                  </div>
                </div>
                
                <Link to="/data-management">
                  <Button size="lg" className="mt-4">
                    <Zap className="h-4 w-4 mr-2" />
                    Calculate Enhanced Metrics
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
