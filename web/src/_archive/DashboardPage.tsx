import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CreateTeamForm from '@/components/CreateTeamForm';
import UpgradeToCoachForm from '@/components/UpgradeToCoachForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DashboardPage: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-gray-500">Welcome back, {currentUser?.name}!</p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>My Profile</CardTitle>
            <CardDescription>View and manage your profile information.</CardDescription>
          </CardHeader>
          <CardContent>
            <p><strong>Email:</strong> {currentUser?.email}</p>
            <p><strong>Role:</strong> <span className="capitalize">{currentUser?.role}</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Team</CardTitle>
            <CardDescription>View your team details and members.</CardDescription>
          </CardHeader>
          <CardContent>
            {currentUser?.team ? (
              <div>
                <p><strong>Team Name:</strong> {currentUser.team.name}</p>
                <p><strong>Athletic.net ID:</strong> {currentUser.team.athleticTeamId}</p>
              </div>
            ) : (
              <p>You are not yet part of a team.</p>
            )}
          </CardContent>
        </Card>

        {currentUser?.role !== 'coach' && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade to Coach</CardTitle>
              <CardDescription>Create and manage your own team.</CardDescription>
            </CardHeader>
            <CardContent>
              <UpgradeToCoachForm />
            </CardContent>
          </Card>
        )}

        {currentUser?.role === 'coach' && !currentUser.team && (
          <Card>
            <CardHeader>
              <CardTitle>Create a Team</CardTitle>
              <CardDescription>Get started by creating a team.</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateTeamForm />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
