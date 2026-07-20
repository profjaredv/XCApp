import React, { useState, useEffect } from 'react';
import { teamService, type PendingClaim } from '@/api/teamService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, Users } from 'lucide-react';

interface PendingClaimsCardProps {
  onClaimProcessed?: () => void;
}

export const PendingClaimsCard: React.FC<PendingClaimsCardProps> = ({ onClaimProcessed }) => {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingClaim, setProcessingClaim] = useState<string | null>(null);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await teamService.getPendingClaims();
      setClaims(response.pendingClaims);
    } catch (err) {
      console.error('Error fetching pending claims:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pending claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, []);

  const handleApproveClaim = async (claimId: string, action: 'approve' | 'reject') => {
    setProcessingClaim(claimId);
    setError(null);

    try {
      await teamService.approveClaim(claimId, action);
      await fetchClaims(); // Refresh the list
      onClaimProcessed?.();
    } catch (err) {
      console.error(`Error ${action}ing claim:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${action} claim`);
    } finally {
      setProcessingClaim(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Profile Claims
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading claims...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (claims.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Profile Claims
          </CardTitle>
          <CardDescription>
            Athletes who join via team code will request to claim their profiles here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending profile claims</p>
            <p className="text-sm">Athletes will appear here when they request to claim profiles</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Profile Claims
          <Badge variant="secondary">{claims.length}</Badge>
        </CardTitle>
        <CardDescription>
          Review and approve athlete profile claim requests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {claims.map((claim) => (
          <div
            key={claim._id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{claim.athleteName}</span>
                {claim.matchScore > 60 && (
                  <Badge variant="outline" className="text-xs">
                    {claim.matchScore}% match
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Requested {new Date(claim.requestedAt).toLocaleDateString()}
              </p>
              <p className="text-xs text-muted-foreground">
                User ID: {claim.userId.substring(0, 8)}...
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleApproveClaim(claim._id, 'reject')}
                disabled={processingClaim === claim._id}
                className="text-red-600 hover:text-red-700"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => handleApproveClaim(claim._id, 'approve')}
                disabled={processingClaim === claim._id}
                className="text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            </div>
          </div>
        ))}

        <div className="text-xs text-muted-foreground pt-2">
          <p>
            <strong>Tip:</strong> High match scores indicate the athlete's name closely matches their account name.
            Verify the athlete's identity before approving.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PendingClaimsCard;
