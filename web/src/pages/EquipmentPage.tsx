import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Package } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useRosterWithRaces } from '@/hooks/useGroups';
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

const EquipmentPage: React.FC = () => {
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;
  const [equipmentTab, setEquipmentTab] = useState('checkout');

  if (!activeYear || !seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Equipment</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Equipment</h1>
        <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.year} value={String(s.year)}>{s.year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
// column per category. An empty cell is a dashed "+" — click it to check
// an item out (size + number, one action, matching how a coach fills in a
// sign-out sheet). A filled cell shows what's out and opens the same
// dialog to return it or correct the size.
const CheckoutGrid: React.FC<{ seasonId: string; year: number }> = ({ seasonId, year }) => {
  const { data: roster = [] } = useRosterWithRaces(year);
  const { data: items = [], isLoading } = useEquipmentList();

  const [activeCell, setActiveCell] = useState<{ athleteId: string; athleteName: string; type: EquipmentType } | null>(null);

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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (roster.length === 0) {
    return <p className="text-sm text-muted-foreground">No athletes on the roster yet — add some from the Roster screen first.</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Equipment checkout
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Athlete</TableHead>
                {EQUIPMENT_TYPES.map((t) => (
                  <TableHead key={t}>{TYPE_LABEL[t]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((athlete) => (
                <TableRow key={athlete.id}>
                  <TableCell className="font-medium">{athlete.name}</TableCell>
                  {EQUIPMENT_TYPES.map((type) => {
                    const item = byAthleteAndType.get(athlete.id)?.get(type);
                    return (
                      <TableCell key={type}>
                        <button
                          type="button"
                          onClick={() => setActiveCell({ athleteId: athlete.id, athleteName: athlete.name, type })}
                          className={
                            item
                              ? 'rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium hover:bg-accent transition-colors whitespace-nowrap'
                              : 'rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-colors'
                          }
                        >
                          {item ? `#${item.identifier}${item.size ? ` (${item.size})` : ''}` : '+'}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {activeCell && (
        <EquipmentCellDialog
          seasonId={seasonId}
          athleteId={activeCell.athleteId}
          athleteName={activeCell.athleteName}
          type={activeCell.type}
          item={byAthleteAndType.get(activeCell.athleteId)?.get(activeCell.type) ?? null}
          onClose={() => setActiveCell(null)}
        />
      )}
    </>
  );
};

const EquipmentCellDialog: React.FC<{
  seasonId: string;
  athleteId: string;
  athleteName: string;
  type: EquipmentType;
  item: EquipmentItem | null;
  onClose: () => void;
}> = ({ seasonId, athleteId, athleteName, type, item, onClose }) => {
  const checkout = useCheckoutEquipment();
  const returnItem = useReturnEquipment();
  const updateEquipment = useUpdateEquipment();

  const [size, setSize] = useState(item?.size ?? '');
  const [identifier, setIdentifier] = useState(item?.identifier ?? '');

  const handleCheckout = async () => {
    if (!identifier.trim()) {
      toast.error('Enter a number (jersey #, asset tag).');
      return;
    }
    try {
      await checkout.mutateAsync({ type, identifier: identifier.trim(), athleteId, seasonId, size: size.trim() || undefined });
      toast.success(`${TYPE_LABEL[type]} checked out to ${athleteName}.`);
      onClose();
    } catch (err) {
      const message = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not check out that item.';
      toast.error(message);
    }
  };

  const handleSaveSize = async () => {
    if (!item) return;
    try {
      await updateEquipment.mutateAsync({ id: item.id, input: { size: size.trim() } });
      toast.success('Size updated.');
    } catch {
      toast.error('Could not update size.');
    }
  };

  const handleReturn = async () => {
    if (!item?.checkedOutTo) return;
    try {
      await returnItem.mutateAsync({ assignmentId: item.checkedOutTo.assignmentId, input: {} });
      toast.success(`${TYPE_LABEL[type]} returned.`);
      onClose();
    } catch {
      toast.error('Could not mark that item returned.');
    }
  };

  const isPending = checkout.isPending || returnItem.isPending || updateEquipment.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{athleteName} — {TYPE_LABEL[type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Number (jersey #, asset tag)</Label>
            <Input
              className="mt-1"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="14"
              disabled={!!item}
              autoFocus={!item}
            />
          </div>
          <div>
            <Label>Size</Label>
            <Input className="mt-1" value={size} onChange={(e) => setSize(e.target.value)} placeholder="M" autoFocus={!!item} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {item ? (
            <>
              <Button variant="outline" onClick={handleSaveSize} disabled={isPending || size.trim() === (item.size ?? '')}>
                {updateEquipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save size
              </Button>
              <Button variant="destructive" onClick={handleReturn} disabled={isPending}>
                {returnItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Return
              </Button>
            </>
          ) : (
            <Button onClick={handleCheckout} disabled={isPending}>
              {checkout.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Check out
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const OutstandingReport: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const { data = [], isLoading } = useOutstandingEquipment(seasonId);
  const returnItem = useReturnEquipment();

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
      {data.map((group) => (
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
