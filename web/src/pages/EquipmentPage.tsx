import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Package, Search, X } from 'lucide-react';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useRosterWithRaces, useGroups, useGroupMembers } from '@/hooks/useGroups';
import {
  useEquipmentList,
  useCheckoutEquipment,
  useReturnEquipment,
  useUpdateEquipment,
  useOutstandingEquipment,
} from '@/hooks/useEquipment';
import {
  EQUIPMENT_TYPES,
  EQUIPMENT_CONDITIONS,
  type EquipmentType,
  type EquipmentCondition,
  type EquipmentItem,
} from '@/api/equipmentService';
import { formatDateShort } from '@/lib/formatUtils';
import { matchesQuery } from '@/lib/athleteSearch';

// T6 (Team Management handoff): "fully separable, build whenever there's
// a gap." A grid checkout (athlete rows x Top/Bottom/Spikes/Other columns,
// matching a paper sign-out sheet — coaches already know this layout), a
// season-end outstanding report (the feature that justifies the whole
// build, per the doc), and a minimal inventory list. HEAD_COACH/COACH
// only, matching routes/equipment.js.

const TYPE_LABEL: Record<EquipmentType, string> = {
  TOP: 'Top',
  BOTTOM: 'Bottom',
  SPIKES: 'Spikes',
  OTHER: 'Other',
};

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const ALL = 'ALL';

// Handing out uniforms is a boys-then-girls job — different jerseys, often
// a different afternoon — and on a hundred-name roster the coach is either
// working one squad at a time or hunting for the one athlete standing in
// front of them. Both tabs that list athletes get the same two controls,
// so they behave the same way on each.
const AthleteFilters: React.FC<{
  gender: string;
  onGenderChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  /** Hidden where the underlying data has no gender to filter on. */
  showGender?: boolean;
}> = ({ gender, onGenderChange, query, onQueryChange, showGender = true }) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
    <div className="relative w-full sm:w-[220px]">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Find an athlete…"
        className="h-9 pl-9"
      />
      {query.trim() && (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
    {showGender && (
      <Select value={gender} onValueChange={onGenderChange}>
        <SelectTrigger className="h-9 w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Boys & girls</SelectItem>
          <SelectItem value="M">Boys</SelectItem>
          <SelectItem value="F">Girls</SelectItem>
        </SelectContent>
      </Select>
    )}
  </div>
);

const EquipmentPage: React.FC = () => {
  const { seasons, activeYear } = useSeasonSelection();
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;
  const [equipmentTab, setEquipmentTab] = useState('checkout');

  if (!activeYear || !seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-bold">Equipment</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl md:text-4xl font-bold">Equipment</h1>
      </div>

      <Tabs value={equipmentTab} onValueChange={setEquipmentTab}>
        <ResponsiveTabsList value={equipmentTab} onValueChange={setEquipmentTab}>
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding report</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </ResponsiveTabsList>

        <TabsContent value="checkout" className="pt-4">
          <CheckoutGrid seasonId={seasonId} year={activeYear} />
        </TabsContent>

        <TabsContent value="outstanding" className="pt-4">
          <OutstandingReport seasonId={seasonId} />
        </TabsContent>

        <TabsContent value="inventory" className="pt-4">
          <InventoryList />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// The grid a coach already knows from paper: one row per athlete, one
// column per category, everything an input right in the cell — no dialog
// to open. Size is a dropdown (XS-XXXL, matching what's actually printed
// on a uniform tag), number is free text (jersey #, asset tag), and one
// button per cell does double duty: "Check out" saves both fields and
// creates the assignment, "Check in" returns it. A coaches-group filter
// above the grid narrows the rows to one group at a time — the size a
// 120-name roster actually gets worked in is a handful of kids at once.
const CheckoutGrid: React.FC<{ seasonId: string; year: number }> = ({ seasonId, year }) => {
  const { data: roster = [] } = useRosterWithRaces(year);
  const { data: items = [], isLoading } = useEquipmentList();
  const { data: groups = [] } = useGroups(seasonId);
  const [groupFilter, setGroupFilter] = useState(ALL);
  const [genderFilter, setGenderFilter] = useState(ALL);
  const [athleteQuery, setAthleteQuery] = useState('');
  const { data: groupMembers = [] } = useGroupMembers(groupFilter !== ALL ? groupFilter : null);

  // athleteId -> type -> the item currently checked out to them in that
  // category. Assumes at most one item per athlete per category at a
  // time, matching one cell per (row, column) on a paper grid — if a
  // second item somehow ends up checked out in the same category, this
  // just shows whichever the query returned first for that slot.
  const byAthleteAndType = useMemo(() => {
    const map = new Map<string, Map<EquipmentType, EquipmentItem>>();
    for (const item of items) {
      if (!item.checkedOutTo) continue;
      if (!map.has(item.checkedOutTo.athleteId)) map.set(item.checkedOutTo.athleteId, new Map());
      const forAthlete = map.get(item.checkedOutTo.athleteId)!;
      if (!forAthlete.has(item.type)) forAthlete.set(item.type, item);
    }
    return map;
  }, [items]);

  // The three filters compose: a coach narrowing to the girls' varsity
  // group and then typing a name expects both to hold, not the last one
  // they touched to replace the others.
  const visibleRoster = useMemo(() => {
    const memberIds = groupFilter === ALL ? null : new Set(groupMembers.map((m) => m.athleteId));
    return roster.filter((a) => {
      if (memberIds && !memberIds.has(a.id)) return false;
      if (genderFilter !== ALL && a.gender !== genderFilter) return false;
      // Both names, so searching the name on the roster finds an athlete
      // the team calls something else, and vice versa.
      return matchesQuery(`${a.name} ${a.preferredName ?? ''}`, athleteQuery);
    });
  }, [roster, groupFilter, groupMembers, genderFilter, athleteQuery]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (roster.length === 0) {
    return <p className="text-sm text-muted-foreground">No athletes on the roster yet — add some from the Roster screen first.</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5" />
          Equipment checkout
        </CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AthleteFilters
            gender={genderFilter}
            onGenderChange={setGenderFilter}
            query={athleteQuery}
            onQueryChange={setAthleteQuery}
          />
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Every group</SelectItem>
              {groups.filter((g) => !g.archived).map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRoster.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-3">
            {athleteQuery.trim()
              ? `No athlete matching “${athleteQuery.trim()}” in this list.`
              : 'No athletes match those filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Athlete</TableHead>
                  {EQUIPMENT_TYPES.map((t) => (
                    <TableHead key={t} className="min-w-[210px]">{TYPE_LABEL[t]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRoster.map((athlete) => (
                  <TableRow key={athlete.id}>
                    <TableCell className="font-medium whitespace-nowrap">{athlete.preferredName || athlete.name}</TableCell>
                    {EQUIPMENT_TYPES.map((type) => (
                      <TableCell key={type} className="p-1.5">
                        <CheckoutCell
                          seasonId={seasonId}
                          athleteId={athlete.id}
                          athleteName={athlete.preferredName || athlete.name}
                          type={type}
                          item={byAthleteAndType.get(athlete.id)?.get(type) ?? null}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CheckoutCell: React.FC<{
  seasonId: string;
  athleteId: string;
  athleteName: string;
  type: EquipmentType;
  item: EquipmentItem | null;
}> = ({ seasonId, athleteId, athleteName, type, item }) => {
  const checkout = useCheckoutEquipment();
  const returnItem = useReturnEquipment();
  const updateEquipment = useUpdateEquipment();

  const [size, setSize] = useState(item?.size ?? '');
  const [identifier, setIdentifier] = useState(item?.identifier ?? '');

  // Re-sync local inputs when this cell's underlying item changes out from
  // under it (checked out/returned from this cell or elsewhere).
  useEffect(() => {
    setSize(item?.size ?? '');
    setIdentifier(item?.identifier ?? '');
  }, [item?.id, item?.size, item?.identifier]);

  const handleSizeChange = (value: string) => {
    setSize(value);
    if (item) {
      updateEquipment.mutate({ id: item.id, input: { size: value } });
    }
  };

  const handleCheckout = async () => {
    if (!identifier.trim()) {
      toast.error(`Enter a number for ${athleteName}'s ${TYPE_LABEL[type].toLowerCase()}.`);
      return;
    }
    try {
      await checkout.mutateAsync({ type, identifier: identifier.trim(), athleteId, seasonId, size: size.trim() || undefined });
      toast.success(`${TYPE_LABEL[type]} checked out to ${athleteName}.`);
    } catch (err) {
      const message = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not check out that item.';
      toast.error(message);
    }
  };

  const handleCheckin = async () => {
    if (!item?.checkedOutTo) return;
    try {
      await returnItem.mutateAsync({ assignmentId: item.checkedOutTo.assignmentId, input: {} });
      toast.success(`${TYPE_LABEL[type]} returned.`);
    } catch {
      toast.error('Could not mark that item returned.');
    }
  };

  const isPending = checkout.isPending || returnItem.isPending;

  return (
    <div className="flex items-center gap-1">
      <Select value={size || undefined} onValueChange={handleSizeChange}>
        <SelectTrigger className="h-8 w-[66px] px-2 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
        <SelectContent>
          {SIZE_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 w-14 px-2 text-xs"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="#"
        disabled={!!item}
      />
      {item ? (
        <Button size="sm" variant="outline" className="h-8 px-2 text-xs whitespace-nowrap" onClick={handleCheckin} disabled={isPending}>
          {returnItem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check in'}
        </Button>
      ) : (
        <Button size="sm" className="h-8 px-2 text-xs whitespace-nowrap" onClick={handleCheckout} disabled={isPending}>
          {checkout.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check out'}
        </Button>
      )}
    </div>
  );
};

const OutstandingReport: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const { data = [], isLoading } = useOutstandingEquipment(seasonId);
  const returnItem = useReturnEquipment();
  const [genderFilter, setGenderFilter] = useState(ALL);
  const [athleteQuery, setAthleteQuery] = useState('');

  const visible = useMemo(
    () =>
      data.filter((group) => {
        if (genderFilter !== ALL && group.gender !== genderFilter) return false;
        return matchesQuery(`${group.athleteName} ${group.fullName ?? ''}`, athleteQuery);
      }),
    [data, genderFilter, athleteQuery]
  );

  const handleReturn = async (assignmentId: string, identifier: string) => {
    try {
      await returnItem.mutateAsync({ assignmentId, input: {} });
      toast.success(`${identifier} marked returned.`);
    } catch {
      toast.error('Could not mark that item returned.');
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Nothing outstanding — everything's been returned.</p>;

  return (
    <div className="space-y-3">
      <AthleteFilters
        gender={genderFilter}
        onGenderChange={setGenderFilter}
        query={athleteQuery}
        onQueryChange={setAthleteQuery}
      />
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody outstanding matches those filters.</p>
      )}
      {visible.map((group) => (
        <Card key={group.athleteId}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{group.athleteName}</span>
              <Badge variant="secondary">{group.items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-1">
            {group.items.map((item) => (
              <div key={item.assignmentId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <div>
                  <span className="font-medium">{TYPE_LABEL[item.type]} {item.identifier}</span>
                  <span className="text-muted-foreground ml-2">
                    checked out {formatDateShort(item.checkedOutAt)}
                    {item.dueDate ? ` · due ${formatDateShort(item.dueDate)}` : ''}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleReturn(item.assignmentId, item.identifier)} disabled={returnItem.isPending}>
                  Mark returned
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const InventoryList: React.FC = () => {
  const { data = [], isLoading } = useEquipmentList();
  const updateEquipment = useUpdateEquipment();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No equipment yet — items are added the first time they're checked out.</p>;

  return (
    <div className="rounded-md border divide-y">
      {data.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div>
            <span className="font-medium">{TYPE_LABEL[item.type]} {item.identifier}</span>
            {item.checkedOutTo ? (
              <span className="text-muted-foreground ml-2">→ {item.checkedOutTo.athleteName}</span>
            ) : (
              <span className="text-muted-foreground ml-2">available</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={item.condition}
              onValueChange={(v) => updateEquipment.mutate({ id: item.id, input: { condition: v as EquipmentCondition } })}
            >
              <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateEquipment.mutate({ id: item.id, input: { retired: !item.retired } })}
            >
              {item.retired ? 'Un-retire' : 'Retire'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default EquipmentPage;
