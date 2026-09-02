import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTeamFeatures, type TeamFeatureKey, type TeamFeaturesResponse } from '@/hooks/useTeamFeatures';
import { getApiErrorMessage } from '@/lib/apiError';
import api from '@/api/api';

// Turning parts of the app off for one team.
//
// Not every program wants every screen — the one that started this was
// attendance, which plenty of coaches take on paper or in whatever system
// their school already requires. Turning a feature off hides it and closes
// its API (backend middleware/teamFeatures.js); it never deletes anything,
// which is what makes this a setting a coach can try rather than a
// decision they have to be sure about.

export const TeamFeaturesCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTeamFeatures();

  const setFeature = useMutation({
    mutationFn: async (update: Partial<Record<TeamFeatureKey, boolean>>) => {
      const response = await api.patch<TeamFeaturesResponse>('/team/features', update);
      return response.data;
    },
    onSuccess: (result, update) => {
      queryClient.setQueryData(['teamFeatures'], result);
      // Nav, route guards and buttons all read this; anything cached from
      // before the change is now describing an app that no longer exists.
      queryClient.invalidateQueries({ queryKey: ['teamContext'] });
      const [key, value] = Object.entries(update)[0] as [TeamFeatureKey, boolean];
      const feature = result.features.find((f) => f.key === key);
      toast.success(`${feature?.label ?? 'Feature'} turned ${value ? 'on' : 'off'}.`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not change that setting.')),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Turn off what your team doesn't use. Nothing is deleted — anything already recorded comes
        back if you turn the feature on again, and it stays in your data export either way.
      </p>

      <div className="divide-y rounded-lg border">
        {(data?.features ?? []).map((feature) => (
          <div key={feature.key} className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <Label htmlFor={`feature-${feature.key}`} className="text-sm font-medium">
                {feature.label}
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </div>
            {/* A checkbox rather than a toggle switch: the app has no
                Switch primitive, and pulling one in for four rows isn't
                worth a dependency. "Use this" reads fine as a checkbox. */}
            <Checkbox
              id={`feature-${feature.key}`}
              className="mt-1 h-5 w-5"
              checked={feature.enabled}
              disabled={setFeature.isPending}
              onCheckedChange={(checked) => setFeature.mutate({ [feature.key]: checked === true })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamFeaturesCard;
