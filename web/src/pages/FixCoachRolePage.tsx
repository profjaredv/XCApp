import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Settings, Copy } from 'lucide-react';

const FixCoachRolePage: React.FC = () => {
  const { currentUser, getFreshToken } = useAuth();
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; user?: any } | null>(null);
  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  const getFirebaseToken = async () => {
    try {
      // Use the getFreshToken method from auth context
      const token = await getFreshToken();
      if (token) {
        setToken(token);
        return token;
      }
      throw new Error('No authenticated user found');
    } catch (error) {
      console.error('Error getting token:', error);
      throw error;
    }
  };

  const fixCoachRole = async () => {
    setIsFixing(true);
    setResult(null);

    try {
      let authToken = token;
      
      if (!authToken) {
        try {
          authToken = await getFirebaseToken();
        } catch (error) {
          setShowTokenInput(true);
          throw new Error('Please get your Firebase token manually using the browser console method below');
        }
      }

      const response = await fetch('/api/profile/fix-coach-role', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: data.message, user: data.user });
        // Refresh the page after a short delay to update the auth context
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(data.message || 'Unknown error occurred');
      }
    } catch (error) {
      setResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to fix coach role' 
      });
    } finally {
      setIsFixing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const browserConsoleCode = `// Use the auth context to get token
// First, make sure you're on the LeadPack XC app page
import('/src/firebase.js').then(({ auth }) => {
  const user = auth.currentUser;
  
  if (!user) {
    alert('No authenticated user found. Please make sure you are logged in.');
    return;
  }
  
  user.getIdToken().then(token => {
    fetch('/api/profile/fix-coach-role', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${token}\`,
        'Content-Type': 'application/json'
      }
    })
    .then(r => r.json())
    .then(data => {
      console.log('Result:', data);
      if (data.message) {
        alert(\`Success: \${data.message}\\nYour role is now: \${data.user.role}\`);
        location.reload();
      }
    })
    .catch(err => {
      console.error('Error:', err);
      alert('Error: ' + err.message);
    });
  });
}).catch(() => {
  // Fallback: try to access Firebase from window object
  if (window.firebase && window.firebase.auth) {
    const user = window.firebase.auth().currentUser;
    if (user) {
      user.getIdToken().then(token => {
        // Same fetch logic as above
        fetch('/api/profile/fix-coach-role', {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          }
        })
        .then(r => r.json())
        .then(data => {
          console.log('Result:', data);
          if (data.message) {
            alert(\`Success: \${data.message}\\nYour role is now: \${data.user.role}\`);
            location.reload();
          }
        });
      });
    } else {
      alert('No user logged in');
    }
  } else {
    alert('Firebase not found. Please use the automatic method above instead.');
  }
});`;

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <Card className="mb-8">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Settings className="h-12 w-12 text-blue-500" />
            </div>
            <CardTitle className="text-2xl">Fix Coach Role</CardTitle>
            <CardDescription>
              Restore your coach role if it was accidentally changed to athlete
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentUser && (
              <Alert>
                <AlertDescription>
                  <strong>Current User:</strong> {currentUser.email}<br />
                  <strong>Current Role:</strong> <Badge variant={currentUser.role === 'coach' ? 'default' : 'secondary'}>
                    {currentUser.role}
                  </Badge>
                </AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert variant={result.success ? 'default' : 'destructive'}>
                <div className="flex items-start gap-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  )}
                  <div>
                    <AlertDescription>
                      {result.message}
                      {result.success && result.user && (
                        <div className="mt-2">
                          <p><strong>New Role:</strong> {result.user.role}</p>
                          <p><strong>Team:</strong> {result.user.team?.name || 'None'}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Page will refresh automatically in 2 seconds...
                          </p>
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Method 1: Automatic Fix</h3>
              <p className="text-sm text-muted-foreground">
                This will automatically get your Firebase token and fix your role.
              </p>
              
              {showTokenInput && (
                <div className="space-y-2">
                  <Label htmlFor="token">Firebase Auth Token (if automatic method fails):</Label>
                  <Input
                    id="token"
                    type="text"
                    placeholder="Paste your Firebase token here"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              )}

              <Button 
                onClick={fixCoachRole} 
                disabled={isFixing || !currentUser}
                className="w-full"
              >
                {isFixing ? 'Fixing Coach Role...' : 'Fix My Coach Role'}
              </Button>
              
              {!currentUser && (
                <p className="text-sm text-red-600 text-center">
                  Please log in first to fix your coach role.
                </p>
              )}
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Method 2: Browser Console (Alternative)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                If the automatic method doesn't work, you can run this code in your browser console:
              </p>
              
              <div className="bg-gray-50 p-4 rounded-lg relative">
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(browserConsoleCode)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <pre className="text-xs overflow-x-auto pr-16">
                  <code>{browserConsoleCode}</code>
                </pre>
              </div>
              
              <div className="mt-4 text-sm text-muted-foreground">
                <p><strong>Steps:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>Press F12 to open browser dev tools</li>
                  <li>Go to the "Console" tab</li>
                  <li>Paste the code above and press Enter</li>
                  <li>The page will refresh automatically if successful</li>
                </ol>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-2">How This Works</h3>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>This tool checks if you own a team (your Firebase UID matches the team's coachUid) and:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Sets your role to "coach" if you own a team</li>
                  <li>Links your user account to your team</li>
                  <li>Preserves all your existing data</li>
                </ul>
                <p className="mt-4">
                  <strong>Safe:</strong> This only affects your role and team assignment. 
                  No team data, athlete data, or results are modified.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FixCoachRolePage;
