import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

// A drill-down page (reached by clicking into a specific athlete/meet/race
// from a list, not a sidebar destination in its own right) needs a way
// back that isn't "use the browser's back button or re-click the sidebar"
// — this is that affordance. Pass `to` for a fixed destination (when the
// page is only ever reached from one place, e.g. an athlete profile);
// omit it to fall back to browser-history back (when the page can be
// reached from more than one place, e.g. a journey linked from both a
// coach's athlete profile and an athlete's own My Progress).

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({ to, label = 'Back', className }) => {
  const navigate = useNavigate();

  if (to) {
    return (
      <Button variant="ghost" asChild className={className}>
        <Link to={to}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="ghost" onClick={() => navigate(-1)} className={className}>
      <ChevronLeft className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
};

export default BackButton;
