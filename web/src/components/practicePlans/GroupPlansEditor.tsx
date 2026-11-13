import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { practicePlanService, type PracticePlan } from '@/api/practicePlanService';
import { useGroups } from '@/hooks/useGroups';
import { getApiErrorMessage } from '@/lib/apiError';

// The part of a day's plan that differs by group: what the throwers do,
// what the jumpers do. Everything above this in the editor is the whole
// team's plan. One group at a time, so a dozen groups stay one short list.
export const GroupPlansEditor: React.FC<{ plan: PracticePlan | null; seasonId: string | null }> = ({ plan, seasonId }) => {
  const queryClient = useQueryClient();
  const { data: groups = [] } = useGroups(seasonId);
  const usable = groups.filter((g) => !g.archived && g.type !== 'X_TRAINING');
  const [parts, setParts] = useState(plan?.groupPlans ?? []);
  const [groupId, setGroupId] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan) {
    return <p className="text-sm text-muted-foreground">Save the day's plan first, then add what specific groups are doing.</p>;
  }

  const pick = (id: string) => {
    setGroupId(id);
    setDetails(parts.find((p) => p.groupId === id)?.details ?? '');
  };
  const save = async (id: string, text: string) => {
    setBusy(true);
    setError(null);
    try {
      const fresh = await practicePlanService.saveGroupPlan(plan.id, id, text);
      setParts(fresh.groupPlans ?? []);
      setGroupId('');
      setDetails('');
      queryClient.invalidateQueries({ queryKey: ['practicePlans', seasonId] });
    } catch (e) {
      setError(getApiErrorMessage(e, 'That did not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>By group</Label>
      {parts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {parts.map((p) => (
            <li key={p.groupId} className="flex items-start gap-2 rounded-lg border p-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.groupName}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{p.details}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => pick(p.groupId)}>
                Edit
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save(p.groupId, '')}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {usable.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups this season yet. Make them on the Groups screen to plan by group.</p>
      ) : (
        <>
          <select aria-label="Group to plan for" value={groupId} onChange={(e) => pick(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Add a plan for a group…</option>
            {usable.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {groupId && (
            <>
              <Textarea aria-label="Plan for this group" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What this group does today" />
              <Button type="button" size="sm" disabled={busy || !details.trim()} onClick={() => save(groupId, details)}>
                Save for this group
              </Button>
            </>
          )}
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
