import React, { useRef, useState } from 'react';
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
} from '@/api/equipmentService';
import { formatDateShort } from '@/lib/formatUtils';

// T6 (Team Management handoff): "fully separable, build whenever there's
// a gap." Type-and-enter checkout (not a modal per item), a season-end
// outstanding report (the feature that justifies the whole build, per
// the doc), and a minimal inventory list. HEAD_COACH/COACH only,
// matching routes/equipment.js.

const TYPE_LABEL: Record<EquipmentType, string> = {
  UNIFORM_TOP: 'Uniform top',
  UNIFORM_BOTTOM: 'Uniform bottom',
  WARMUP_TOP: 'Warmup top',
  WARMUP_BOTTOM: 'Warmup bottom',
  SPIKES: 'Spikes',
  BAG: 'Bag',
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
          <CheckoutForm seasonId={seasonId} year={activeYear} />
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

const CheckoutForm: React.FC<{ seasonId: string; year: number }> = ({ seasonId, year }) => {
  const { data: roster = [] } = useRosterWithRaces(year);
  const checkout = useCheckoutEquipment();

  const [type, setType] = useState<EquipmentType>('UNIFORM_TOP');
  const [athleteId, setAthleteId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const identifierRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !athleteId) {
      toast.error('Pick an athlete and enter an identifier.');
      return;
    }
    try {
      await checkout.mutateAsync({ type, identifier: identifier.trim(), athleteId, seasonId });
      const athleteName = roster.find((a) => a.id === athleteId)?.name ?? 'athlete';
      toast.success(`${identifier.trim()} checked out to ${athleteName}.`);
      setIdentifier('');
      setAthleteId('');
      identifierRef.current?.focus();
    } catch (err) {
      const message = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not check out that item.';
      toast.error(message);
      setIdentifier('');
      identifierRef.current?.focus();
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5" />
          Check out an item
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EquipmentType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Athlete</Label>
            <Select value={athleteId} onValueChange={setAthleteId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an athlete…" /></SelectTrigger>
              <SelectContent>
                {roster.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Identifier (jersey #, asset tag)</Label>
            <Input
              ref={identifierRef}
              className="mt-1"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="14"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={checkout.isPending}>
            {checkout.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Check out
          </Button>
        </form>
      </CardContent>
    </Card>
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
