import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import api from '@/api/api';
import { useTeamColors, type TeamColorsResponse } from '@/hooks/useTeamColors';
import { getApiErrorMessage } from '@/lib/apiError';
import { DEFAULT_PRIMARY, isHex, resolveColors, type TeamColors } from '@/lib/teamColors';

// A team's colors: the app in light mode, the app in dark mode, and anything
// the team exports (athlete highlight images, photo collages).
//
// The coach picks; the app makes sure it stays readable. A pale gold can be
// the team color, but it cannot be the link color on a white page, so the
// color actually used is nudged darker (light mode) or lighter (dark mode)
// until text reads, and this card shows that plainly next to the pick.

type Key = keyof TeamColors;

interface Field {
  key: Key;
  label: string;
  help: string;
  required?: boolean;
  fallback: string;
}

const FIELDS: Field[] = [
  { key: 'primary', label: 'Main color', help: 'Buttons, links and highlights. Light mode uses this; dark mode lightens it unless you pick one below.', required: true, fallback: DEFAULT_PRIMARY },
  { key: 'primaryDark', label: 'Main color, dark mode', help: 'Optional. Leave empty to use a lighter version of the main color.', fallback: '#4ade80' },
  { key: 'accent', label: 'Second color', help: 'Optional. A second color for badges and highlights.', fallback: '#f59e0b' },
  { key: 'accentDark', label: 'Second color, dark mode', help: 'Optional. Leave empty to use a lighter version.', fallback: '#fbbf24' },
  { key: 'exportBackground', label: 'Export background', help: 'Optional. Background of exported images. Leave empty for a dark shade of the main color.', fallback: '#0f172a' },
];

const Swatch: React.FC<{ hex: string | null; label: string; note?: string }> = ({ hex, label, note }) =>
  hex ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-4 w-4 rounded border" style={{ backgroundColor: hex }} aria-hidden="true" />
      {label}
      {note && <span className="text-amber-600 dark:text-amber-400">({note})</span>}
    </span>
  ) : null;

export const TeamColorsCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTeamColors();
  const [draft, setDraft] = useState<TeamColors>({});

  useEffect(() => {
    if (data) setDraft(data.colors ?? {});
  }, [data]);

  const save = useMutation({
    mutationFn: async (body: Partial<Record<Key, string | null>>) => (await api.patch<TeamColorsResponse>('/team/colors', body)).data,
    onSuccess: (result) => {
      queryClient.setQueriesData({ queryKey: ['teamColors'] }, result);
      toast.success('Team colors saved.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save the colors.')),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const saved = data?.colors ?? {};
  const resolved = resolveColors(draft);
  const invalid = FIELDS.find((f) => draft[f.key] && !isHex(draft[f.key]));
  const dirty = FIELDS.some((f) => (draft[f.key] || null) !== (saved[f.key] || null));

  const set = (key: Key, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const clear = (key: Key) => setDraft((d) => ({ ...d, [key]: undefined }));

  const submit = () => {
    const body: Partial<Record<Key, string | null>> = {};
    for (const f of FIELDS) body[f.key] = draft[f.key] && isHex(draft[f.key]) ? draft[f.key]!.toLowerCase() : null;
    // The other colors only mean something next to a main color.
    if (!body.primary) for (const f of FIELDS) body[f.key] = null;
    save.mutate(body);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Pick your team's colors. They apply across the app for everyone on the team, in light and dark mode, and on the images you export. Leave everything empty to use the LeadPack green.
      </p>

      <div className="space-y-4">
        {FIELDS.map((f) => {
          const value = draft[f.key] ?? '';
          const bad = !!value && !isHex(value);
          const disabled = !f.required && !isHex(draft.primary);
          return (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`color-${f.key}`}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${f.label} picker`}
                  value={isHex(value) ? value : f.fallback}
                  disabled={disabled}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 disabled:opacity-50"
                />
                <Input
                  id={`color-${f.key}`}
                  value={value}
                  placeholder={f.required ? '#1f6f43' : 'Default'}
                  disabled={disabled}
                  onChange={(e) => set(f.key, e.target.value.trim())}
                  aria-invalid={bad}
                  className="max-w-[9rem] font-mono"
                />
                {value && !f.required && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => clear(f.key)}>
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{f.help}</p>
              {bad && <p className="text-xs text-destructive">Use a color like #1f6f43.</p>}
            </div>
          );
        })}
      </div>

      {resolved && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">What the app will use</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg p-3" style={{ backgroundColor: '#fcfdfc', color: '#1a211d' }}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Light mode</p>
              <span className="inline-block rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: resolved.light.primary, color: '#fcfdfc' }}>
                Button
              </span>
              <p className="text-sm" style={{ color: resolved.light.primary }}>A link in your color</p>
              <div className="flex flex-wrap gap-3">
                <Swatch hex={resolved.light.primary} label="Main" note={resolved.light.primaryAdjusted ? 'darkened to stay readable' : undefined} />
                <Swatch hex={resolved.light.accent} label="Second" note={resolved.light.accentAdjusted ? 'darkened to stay readable' : undefined} />
              </div>
            </div>
            <div className="space-y-2 rounded-lg p-3" style={{ backgroundColor: '#0d1510', color: '#eef3ef' }}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Dark mode</p>
              <span className="inline-block rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: resolved.dark.primary, color: '#0d1510' }}>
                Button
              </span>
              <p className="text-sm" style={{ color: resolved.dark.primary }}>A link in your color</p>
              <div className="flex flex-wrap gap-3 text-[#c8d2cb]">
                <Swatch hex={resolved.dark.primary} label="Main" note={resolved.dark.primaryAdjusted ? 'lightened to stay readable' : undefined} />
                <Swatch hex={resolved.dark.accent} label="Second" note={resolved.dark.accentAdjusted ? 'lightened to stay readable' : undefined} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={!dirty || !!invalid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save colors'}
        </Button>
        {Object.keys(saved).length > 0 && (
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              if (window.confirm('Go back to the LeadPack green for everyone on the team?')) save.mutate({ primary: null, primaryDark: null, accent: null, accentDark: null, exportBackground: null });
            }}
          >
            Use LeadPack green
          </Button>
        )}
      </div>
    </div>
  );
};
