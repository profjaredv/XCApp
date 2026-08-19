import { Link, useLocation } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTeamContext } from '../hooks/useTeamContext';
import { useTeamPath } from '../hooks/useTeamRoute';

// F4 (LeadPack Master Build Handoff): "before the dashboard functions, the
// coach hits a required checkout step" — but exploring the app itself is
// deliberately never gated (only join codes/invites are, server-side). This
// is the visible reminder that friction still exists, not a blocker: a link,
// not a modal, and it never shows for anyone but the head coach who'd
// actually complete it.
export const CheckoutReminderBanner = () => {
  const { currentUser } = useAuth();
  const { data: teamContext } = useTeamContext();
  const teamPath = useTeamPath();
  const location = useLocation();

  if (currentUser?.teamRole !== 'HEAD_COACH') return null;
  if (!teamContext?.team || teamContext.team.plan === 'active') return null;
  if (location.pathname.endsWith('/checkout')) return null;

  return (
    <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 font-medium">
        <CreditCard className="h-4 w-4" />
        Checkout isn't complete yet — join codes and invites are locked until it is.
      </span>
      <Link
        to={teamPath('/checkout')}
        className="flex items-center gap-1 rounded-md bg-amber-900/10 hover:bg-amber-900/20 px-2.5 py-1 transition-colors whitespace-nowrap"
      >
        Complete checkout
      </Link>
    </div>
  );
};
