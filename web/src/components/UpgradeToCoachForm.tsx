import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { axiosInstance } from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAxiosError } from 'axios';

const UpgradeToCoachForm: React.FC = () => {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const { currentUser, setCurrentUser, getFreshToken } = useAuth();

    const handleUpgrade = async () => {
        setError('');
        setSuccess('');
        setLoading(true);

        if (!currentUser) {
            setError('You must be logged in.');
            setLoading(false);
            return;
        }

        if (!code) {
            setError('Upgrade code is required.');
            setLoading(false);
            return;
        }

        try {
            const token = await getFreshToken();
            const response = await axiosInstance.post('/profile/upgrade-to-coach', { code }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setCurrentUser(response.data.user);
            setSuccess(response.data.message);
        } catch (err: unknown) {
            if (isAxiosError(err) && err.response) {
                setError(err.response.data.message || 'An unexpected error occurred.');
            } else {
                setError('An unexpected error occurred.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600">
                Enter the upgrade code to become a coach and manage your own team.
            </p>
            <Input
                type="text"
                placeholder="Upgrade Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
            />
            <Button onClick={handleUpgrade} disabled={loading || !code} className="w-full">
                {loading ? 'Upgrading...' : 'Upgrade to Coach'}
            </Button>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            {success && <p className="text-green-500 text-sm mt-2">{success}</p>}
        </div>
    );
};


export default UpgradeToCoachForm;
