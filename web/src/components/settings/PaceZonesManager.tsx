import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Gauge, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../lib/apiError';
import { usePaceZones, useSavePaceZones } from '../../hooks/usePaceZones';
import { MCMILLAN_ZONES, resolvePaceZone, type PaceZoneDefinition } from '../../lib/paceZones';
import { describeRule, formatPaceRange, distanceLabel } from '../../lib/paceFormat';
import { NerdBox } from '../NerdBox';
import type { PaceZoneInput } from '../../api/paceZoneService';

// Where a team writes down what its own pace terms mean.
//
// The McMillan-style defaults are always present and are not editable —
// they are a code constant, not rows — so this screen is purely additive:
// whatever a team defines here is shown ALONGSIDE the defaults, never
// instead of them. That is why there is no "reset to defaults" button:
// deleting every custom zone already gets you there.

// The distances a rule can be anchored to. A fixed list rather than a free
// number field: every one of these is a race a coach names out loud, and an
// open metres box invites the "I typed 1 for one mile" bug that
// lib/paceZoneRules.js has to reject at the edge anyway.
const ANCHOR_DISTANCES = [800, 1200, 1609, 3000, 3218, 5000, 6000, 8000, 10000];

// A worked example, so the first thing a coach sees is a pace they can
// check by eye rather than an empty preview. An 18:00 5K is a real
// mid-pack varsity time.
const PREVIEW_RACE = { distanceMiles: 5000 / 1609.34, timeSeconds: 18 * 60 };

type DraftZone = PaceZoneInput & { key: string };

let draftKeySeq = 0;
function nextKey() {
  draftKeySeq += 1;
  return `draft-${draftKeySeq}`;
}

function blankZone(): DraftZone {
  return {
    key: nextKey(),
    abbreviation: '',
    name: '',
    notes: null,
    ruleType: 'OFFSET',
    refDistanceMeters: 1609,
    offsetFastSec: 60,
    offsetSlowSec: 90,
    rangeDistanceAMeters: null,
    rangeDistanceBMeters: null,
  };
}

// The wire shape of one zone: everything the server stores, with the local
// bookkeeping key (and the server id) stripped off.
function toInput(zone: DraftZone): PaceZoneInput {
  return {
    abbreviation: zone.abbreviation,
    name: zone.name,
    notes: zone.notes,
    ruleType: zone.ruleType,
    refDistanceMeters: zone.refDistanceMeters,
    offsetFastSec: zone.offsetFastSec,
    offsetSlowSec: zone.offsetSlowSec,
    rangeDistanceAMeters: zone.rangeDistanceAMeters,
    rangeDistanceBMeters: zone.rangeDistanceBMeters,
  };
}

function toDraft(zone: PaceZoneDefinition): DraftZone {
  return { ...toInput({ ...zone, key: '' }), key: `saved-${zone.id}` };
}

// Seconds <-> "m:ss" for the offset fields. A coach thinks "2:00", not
// "120", and typing 120 into a box labelled minutes:seconds is exactly how
// you get a zone two hours slower than mile pace.
function offsetToText(seconds: number | null): string {
  if (seconds == null) return '';
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function textToOffset(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const parts = body.split(':');
  if (parts.length === 1) {
    // A bare number is read as seconds — ":30" and "30" should mean the
    // same thing, since a coach writes both.
    const secs = Number(parts[0]);
    if (!Number.isFinite(secs)) return null;
    return negative ? -Math.round(secs) : Math.round(secs);
  }
  if (parts.length !== 2) return null;
  const mins = Number(parts[0] === '' ? 0 : parts[0]);
  const secs = Number(parts[1]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
  const total = Math.round(mins * 60 + secs);
  return negative ? -total : total;
}

// An offset field has to keep the coach's raw keystrokes as its own state:
// "1:" and "1:3" are both mid-typing and neither parses, and a field driven
// straight off the parsed number would erase the character they just typed.
// So text is local, and the parsed value is pushed up on every change.
//
// It is genuinely controlled, not a defaultValue: `value` re-seeds it
// whenever the number changes from outside — which is exactly what
// "Discard changes" does, and an uncontrolled input would have kept showing
// the abandoned text.
const OffsetInput: React.FC<{
  id: string;
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (seconds: number | null) => void;
}> = ({ id, label, placeholder, value, onChange }) => {
  const [text, setText] = useState(() => offsetToText(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Re-seed on an outside change only. Comparing against the last value
    // we saw (rather than against what our own text parses to) is what
    // keeps this from fighting the coach mid-keystroke.
    setLastValue(value);
    setText(offsetToText(value));
  }
  return (
    <div className="w-28 space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        inputMode="text"
        onChange={(e) => {
          setText(e.target.value);
          const parsed = textToOffset(e.target.value);
          setLastValue(parsed);
          onChange(parsed);
        }}
      />
    </div>
  );
};

const ZoneRow: React.FC<{
  zone: DraftZone;
  index: number;
  total: number;
  onChange: (patch: Partial<DraftZone>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}> = ({ zone, index, total, onChange, onRemove, onMove }) => {
  // Preview against the worked example. A definition mid-edit is often
  // incomplete, and that is fine — the preview just goes quiet rather than
  // showing a wrong number.
  const preview = resolvePaceZone({ ...zone, id: zone.key }, PREVIEW_RACE);

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24 space-y-1">
          <Label htmlFor={`abbr-${zone.key}`} className="text-xs">Short</Label>
          <Input
            id={`abbr-${zone.key}`}
            value={zone.abbreviation}
            placeholder="T"
            maxLength={12}
            onChange={(e) => onChange({ abbreviation: e.target.value })}
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor={`name-${zone.key}`} className="text-xs">Name</Label>
          <Input
            id={`name-${zone.key}`}
            value={zone.name}
            placeholder="Threshold"
            maxLength={60}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button" variant="ghost" size="sm" className="h-11 w-11 p-0"
            aria-label={`Move ${zone.name || 'zone'} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button" variant="ghost" size="sm" className="h-11 w-11 p-0"
            aria-label={`Move ${zone.name || 'zone'} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button" variant="ghost" size="sm"
            className="h-11 w-11 p-0 text-destructive"
            aria-label={`Remove ${zone.name || 'zone'}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Wide enough for its own longest option, and truncating rather
            than overflowing: at w-44 "Slower/faster than a race pace" ran
            straight out of the trigger and collided with the next field. */}
        <div className="w-56 space-y-1">
          <Label className="text-xs">Defined as</Label>
          <Select
            value={zone.ruleType}
            onValueChange={(v) =>
              onChange(
                v === 'OFFSET'
                  ? { ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90, rangeDistanceAMeters: null, rangeDistanceBMeters: null }
                  : { ruleType: 'RANGE', rangeDistanceAMeters: 3218, rangeDistanceBMeters: 5000, refDistanceMeters: null, offsetFastSec: null, offsetSlowSec: null }
              )
            }
          >
            <SelectTrigger className="min-w-0">
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFFSET">Offset from a race pace</SelectItem>
              <SelectItem value="RANGE">Between two race paces</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {zone.ruleType === 'OFFSET' ? (
          <>
            <div className="w-32 space-y-1">
              <Label className="text-xs">Based on</Label>
              <Select
                value={String(zone.refDistanceMeters ?? 1609)}
                onValueChange={(v) => onChange({ refDistanceMeters: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANCHOR_DISTANCES.map((m) => (
                    <SelectItem key={m} value={String(m)}>{distanceLabel(m)} pace</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <OffsetInput
              id={`fast-${zone.key}`}
              label="From"
              placeholder="1:00"
              value={zone.offsetFastSec}
              onChange={(v) => onChange({ offsetFastSec: v })}
            />
            <OffsetInput
              id={`slow-${zone.key}`}
              label="To"
              placeholder="1:30"
              value={zone.offsetSlowSec}
              onChange={(v) => onChange({ offsetSlowSec: v })}
            />
            <p className="text-xs text-muted-foreground pb-2">
              slower. Use a minus for faster.
            </p>
          </>
        ) : (
          <>
            <div className="w-32 space-y-1">
              <Label className="text-xs">From</Label>
              <Select
                value={String(zone.rangeDistanceAMeters ?? 3218)}
                onValueChange={(v) => onChange({ rangeDistanceAMeters: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANCHOR_DISTANCES.map((m) => (
                    <SelectItem key={m} value={String(m)}>{distanceLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs">To</Label>
              <Select
                value={String(zone.rangeDistanceBMeters ?? 5000)}
                onValueChange={(v) => onChange({ rangeDistanceBMeters: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANCHOR_DISTANCES.map((m) => (
                    <SelectItem key={m} value={String(m)}>{distanceLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground pb-2">race pace</p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`notes-${zone.key}`} className="text-xs">Notes for athletes (optional)</Label>
        <Input
          id={`notes-${zone.key}`}
          value={zone.notes ?? ''}
          maxLength={500}
          placeholder="e.g. or :30 slower than 5k average pace"
          onChange={(e) => onChange({ notes: e.target.value || null })}
        />
      </div>

      {/* The whole point of the preview: a coach should never have to save
          and navigate elsewhere to find out that a rule they just typed
          produces a pace nobody can run. */}
      <p className="text-xs text-muted-foreground">
        For an 18:00 5K runner:{' '}
        {preview ? (
          <span className="font-mono font-medium text-foreground">{formatPaceRange(preview)}</span>
        ) : (
          <span className="italic">finish the rule to see a pace</span>
        )}
      </p>
      {/* With nerd mode on this updates as the rule is typed, which makes
          the editor a place to CHECK a definition, not just enter one. */}
      <NerdBox explain={preview?.explain} />
    </div>
  );
};

export function PaceZonesManager() {
  const { currentUser } = useAuth();
  // Same check the server makes (routes/paceZones.js is
  // requireRole(['HEAD_COACH'])) — a super admin only counts while
  // actually impersonating a team, or the button just 403s.
  const canEdit =
    currentUser?.teamRole === 'HEAD_COACH' ||
    Boolean(currentUser?.isSuperAdmin && currentUser?.isImpersonating);

  const { data: saved, isLoading, isError, refetch } = usePaceZones();
  const saveZones = useSavePaceZones();

  const [drafts, setDrafts] = useState<DraftZone[] | null>(null);
  useEffect(() => {
    // Adopt the server's set once, and again whenever a save returns —
    // but never while the coach has unsaved edits in progress.
    if (saved && drafts === null) setDrafts(saved.map(toDraft));
  }, [saved, drafts]);

  const zones = drafts ?? [];
  // Compared against the loaded set, or against empty when there is none.
  // Requiring `saved !== undefined` here meant a failed GET left dirty
  // permanently false, so Save never enabled and the coach could not work
  // out why — but the honest fix for a failed load is the guard below,
  // not a savable editor over data we could not read.
  const dirty =
    drafts !== null &&
    JSON.stringify(drafts.map(toInput)) !== JSON.stringify((saved ?? []).map(toDraft).map(toInput));

  const patch = (key: string, p: Partial<DraftZone>) =>
    setDrafts((cur) => (cur ?? []).map((z) => (z.key === key ? { ...z, ...p } : z)));

  const move = (key: string, delta: number) =>
    setDrafts((cur) => {
      const list = [...(cur ?? [])];
      const i = list.findIndex((z) => z.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });

  const handleSave = async () => {
    try {
      const payload = (drafts ?? []).map(toInput);
      const result = await saveZones.mutateAsync(payload);
      setDrafts(result.map(toDraft));
      toast.success(result.length === 0 ? 'Custom zones cleared.' : 'Pace zones saved.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not save pace zones.'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Training pace zones
        </CardTitle>
        <CardDescription>
          What your team's pace terms mean. Everyone gets the standard set below; anything you
          define here is shown alongside it, in your own words.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Standard zones</h3>
          <p className="text-xs text-muted-foreground">
            Always available, the same for every team. McMillan-style — his zone structure and
            race-pace relationships, calculated from each athlete's own most recent race.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MCMILLAN_ZONES.map((zone) => {
              const preview = resolvePaceZone(zone, PREVIEW_RACE);
              return (
                <div key={zone.id} className="rounded-md border border-dashed p-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge variant="secondary">{zone.abbreviation}</Badge>
                    <span className="font-medium">{zone.name}</span>
                    <span className="text-xs text-muted-foreground">{describeRule(zone)}</span>
                  </div>
                  {preview && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      18:00 5K runner: {formatPaceRange(preview)}
                    </p>
                  )}
                  <NerdBox explain={preview?.explain} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Your team's zones</h3>
            {canEdit && !isError && (
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setDrafts((cur) => [...(cur ?? []), blankZone()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add zone
              </Button>
            )}
          </div>

          {isError ? (
            // Saving replaces the whole set, so saving on top of a set we
            // could not read would silently delete whatever is actually
            // stored. Refuse to edit until the load succeeds.
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                <p className="text-sm">
                  Couldn't load your team's zones. Saving now could overwrite them, so editing is
                  off until this loads.
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? 'None yet. Add one to describe a zone in the words your team already uses.'
                : 'Your team uses the standard zones above.'}
            </p>
          ) : canEdit ? (
            <div className="space-y-3">
              {zones.map((zone, i) => (
                <ZoneRow
                  key={zone.key}
                  zone={zone}
                  index={i}
                  total={zones.length}
                  onChange={(p) => patch(zone.key, p)}
                  onRemove={() => setDrafts((cur) => (cur ?? []).filter((z) => z.key !== zone.key))}
                  onMove={(d) => move(zone.key, d)}
                />
              ))}
            </div>
          ) : (
            // Read-only view for assistant coaches and athletes: the
            // definitions matter to them, the editor does not.
            <div className="grid gap-2 sm:grid-cols-2">
              {zones.map((zone) => (
                <div key={zone.key} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge>{zone.abbreviation}</Badge>
                    <span className="font-medium">{zone.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {describeRule({ ...zone, id: zone.key })}
                  </p>
                  {zone.notes && <p className="mt-1 text-xs italic text-muted-foreground">{zone.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {canEdit && !isError && (
            <>
              <Alert>
                <AlertDescription className="text-xs">
                  Paces are estimated from each athlete's most recent race using the Riegel
                  equivalent-performance model. Treat them as a starting point, not a prescription —
                  and expect short-distance zones (800m–mile anchors) to come out slightly
                  conservative.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={!dirty || saveZones.isPending}>
                  {saveZones.isPending ? 'Saving…' : 'Save zones'}
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => setDrafts((saved ?? []).map(toDraft))}
                    disabled={saveZones.isPending}
                  >
                    Discard changes
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PaceZonesManager;
