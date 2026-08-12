import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminService } from '@/api/adminService';
import { setAdminTeam } from '@/lib/impersonation';

// Only ever rendered when currentUser.isSuperAdmin is true (see
// Layout.tsx) — this component itself does no authorization, it's a picker
// UI backed by a super-admin-only endpoint (GET /api/admin/teams). Picking
// a team sets it in sessionStorage and does a full page navigation/reload
// (lib/impersonation.ts) so every cached query starts fresh under the new
// team context.
export const AdminTeamSwitcher = ({ isCollapsed }: { isCollapsed: boolean }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['adminTeams'],
    queryFn: () => adminService.listTeams(),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q) || t.athleticTeamId.includes(q));
  }, [teams, search]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`w-full ${isCollapsed ? 'px-0' : 'justify-start'} text-amber-700 border-amber-200 hover:bg-amber-50`}
        onClick={() => setOpen(true)}
      >
        <Shield className="h-4 w-4 shrink-0" />
        {!isCollapsed && <span className="ml-2 truncate">Admin: switch team</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>View a different team</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search teams…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No teams match.</p>
            ) : (
              filtered.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setAdminTeam(team.id, team.name, team.athleticTeamId)}
                  className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  <span className="font-medium">{team.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {team.athleteCount} athlete{team.athleteCount === 1 ? '' : 's'}
                    {team.currentSeason ? ` · ${team.currentSeason}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
