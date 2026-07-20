import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api as axios } from '../api/axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useNavigate } from 'react-router-dom';

const UpgradeRolePage: React.FC = () => {
  const { currentUser, setCurrentUser } = useAuth();
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await axios.post('/profile/upgrade-to-coach', { code });
      const updated = res.data?.user;
      if (updated) {
        setCurrentUser(updated);
        setSuccess('Successfully upgraded to coach role!');
        // Redirect to profile page after a short delay
        setTimeout(() => {
          navigate('/profile');
        }, 2000);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }, message?: string };
      setError(error?.response?.data?.message || error?.message || 'Failed to upgrade role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Upgrade to Coach</h1>

      <Card>
        <CardHeader>
          <CardTitle>Coach Role Upgrade</CardTitle>
          <CardDescription>Enter your coach upgrade code to gain access to additional features.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-md">
            <div>
              <label className="text-sm text-muted-foreground">Current Role</label>
              <Input value={currentUser?.role || ''} readOnly disabled className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Upgrade Code</label>
              <Input 
                type="password" 
                value={code} 
                onChange={(e) => setCode(e.target.value)} 
                className="mt-1" 
                placeholder="Enter your coach upgrade code"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleUpgrade} disabled={loading || !code.trim()}>
                {loading ? 'Upgrading...' : 'Upgrade to Coach'}
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpgradeRolePage;
