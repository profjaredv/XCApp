import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Heart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { saveIntent } from '@/lib/signupIntent';

// The parent link a coach shares: /parents/<join code>. It is the parent
// sign-up with the team's code already in it, so a parent never has to
// choose "I'm a parent" or type a code. A coach still approves the link
// (the code is shared, so it proves nothing about which child is whose).

const ParentLinkPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();
  const joinCode = (code || '').trim().toUpperCase();

  // Already signed in: go straight to picking the runner.
  useEffect(() => {
    if (!loading && currentUser && joinCode) {
      saveIntent({ role: 'parent', joinCode });
      navigate('/onboarding', { replace: true });
    }
  }, [loading, currentUser, joinCode, navigate]);

  const go = (target: 'register' | 'login') => {
    saveIntent({ role: 'parent', joinCode });
    navigate(`/${target}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Heart className="mb-2 h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">Follow your runner</CardTitle>
          <CardDescription>
            See your athlete’s meets and results on LeadPack. Make an account, pick your runner, and a coach
            approves it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => go('register')} disabled={!joinCode}>
            Create my account
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full" onClick={() => go('login')} disabled={!joinCode}>
            I already have an account
          </Button>
          {!joinCode && <p className="text-sm text-destructive">This link is missing its team code.</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default ParentLinkPage;
