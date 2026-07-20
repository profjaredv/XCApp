import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api as axios } from '../api/axios';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const ProfilePage: React.FC = () => {
  const { currentUser, setCurrentUser } = useAuth();
  const [name, setName] = useState<string>(currentUser?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await axios.put('/users/me', { name });
      const updated = res.data?.user;
      if (updated) {
        setCurrentUser(updated);
      }
      setSuccess('Profile updated.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }, message?: string };
      setError(error?.response?.data?.message || error?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setResetMsg('');
    if (!currentUser?.email) {
      setResetMsg('No email on file.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email);
      if (error) throw error;
      setResetMsg('Password reset email sent.');
    } catch (err: unknown) {
      const error = err as { message?: string };
      setResetMsg(error?.message || 'Failed to send reset email.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Update your display name and manage your password.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-md">
            <div>
              <label className="text-sm text-muted-foreground">Email</label>
              <Input value={currentUser?.email || ''} readOnly disabled className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Role</label>
              <Input value={currentUser?.role || ''} readOnly disabled className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Display Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={handlePasswordReset}>
                Send Password Reset Email
              </Button>
              {currentUser?.role !== 'coach' && (
                <Button type="button" variant="outline" onClick={() => window.location.href = '/upgrade-role'}>
                  Upgrade to Coach
                </Button>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            {resetMsg && <p className="text-sm text-muted-foreground">{resetMsg}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
