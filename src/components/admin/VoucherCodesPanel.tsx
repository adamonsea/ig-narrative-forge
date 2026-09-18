import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';

interface Voucher {
  id: string;
  code: string;
  kind: 'free_access' | 'discount';
  plan: string | null;
  free_months: number | null;
  percent_off: number | null;
  amount_off_cents: number | null;
  duration_months: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  is_active: boolean;
  notes: string | null;
}

const describe = (v: Voucher) => {
  if (v.kind === 'free_access') {
    const plan = v.plan ? v.plan[0].toUpperCase() + v.plan.slice(1) : 'Pro';
    return `${plan} free for ${v.free_months ?? 1} month${(v.free_months ?? 1) === 1 ? '' : 's'}`;
  }
  const off = v.percent_off
    ? `${v.percent_off}% off`
    : `$${((v.amount_off_cents ?? 0) / 100).toFixed(2)} off`;
  return v.duration_months && v.duration_months > 1
    ? `${off} for ${v.duration_months} months`
    : `${off} on the first payment`;
};

export const VoucherCodesPanel = () => {
  const { isProductOwner } = useAuth();
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'free_access' | 'discount'>('free_access');
  const [plan, setPlan] = useState('pro');
  const [freeMonths, setFreeMonths] = useState('3');
  const [percentOff, setPercentOff] = useState('50');
  const [amountOff, setAmountOff] = useState('');
  const [durationMonths, setDurationMonths] = useState('3');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-vouchers', { body });
    if (error) throw new Error('Could not reach voucher codes.');
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: 'list' });
      setVouchers(data.vouchers ?? []);
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => {
    if (isProductOwner) load();
  }, [isProductOwner, load]);

  if (!isProductOwner) return null;

  const create = async () => {
    setSaving(true);
    try {
      await call({
        action: 'create',
        code,
        kind,
        plan: kind === 'free_access' ? plan : plan || null,
        freeMonths: kind === 'free_access' ? Number(freeMonths) : undefined,
        percentOff: kind === 'discount' && percentOff ? Number(percentOff) : undefined,
        amountOffCents:
          kind === 'discount' && !percentOff && amountOff
            ? Math.round(Number(amountOff) * 100)
            : undefined,
        durationMonths: kind === 'discount' && durationMonths ? Number(durationMonths) : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        expiresAt: expiresAt || null,
        notes: notes || null,
      });
      toast({ title: `Code ${code.toUpperCase()} created` });
      setCode('');
      setNotes('');
      await load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (v: Voucher) => {
    try {
      await call({ action: 'toggle', id: v.id, isActive: !v.is_active });
      await load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' });
    }
  };

  const remove = async (v: Voucher) => {
    if (!confirm(`Delete ${v.code}? People who already used it keep their access.`)) return;
    try {
      await call({ action: 'delete', id: v.id });
      await load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="voucher-code">Code</Label>
            <Input
              id="voucher-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FOUNDER50"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free_access">Free access</SelectItem>
                <SelectItem value="discount">Money off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === 'free_access' ? (
            <div className="space-y-2">
              <Label htmlFor="free-months">Months free</Label>
              <Input
                id="free-months"
                type="number"
                min={1}
                value={freeMonths}
                onChange={(e) => setFreeMonths(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="percent-off">Percent off</Label>
                <Input
                  id="percent-off"
                  type="number"
                  min={1}
                  max={100}
                  value={percentOff}
                  onChange={(e) => setPercentOff(e.target.value)}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount-off">Or amount off ($)</Label>
                <Input
                  id="amount-off"
                  type="number"
                  min={1}
                  value={amountOff}
                  onChange={(e) => setAmountOff(e.target.value)}
                  placeholder="10"
                  disabled={!!percentOff}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration-months">Months the discount lasts</Label>
                <Input
                  id="duration-months"
                  type="number"
                  min={1}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="max-redemptions">Times it can be used</Label>
            <Input
              id="max-redemptions"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires-at">Expires</Label>
            <Input
              id="expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="voucher-notes">Note to self</Label>
          <Textarea
            id="voucher-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who this is for"
            rows={2}
          />
        </div>

        <Button onClick={create} disabled={saving || code.trim().length < 3}>
          {saving ? 'Creating…' : 'Create code'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : vouchers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No codes yet.</p>
      ) : (
        <div className="space-y-2">
          {vouchers.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="font-mono text-sm font-medium">{v.code}</span>
              <span className="text-sm text-muted-foreground">{describe(v)}</span>
              <span className="text-xs text-muted-foreground">
                used {v.redeemed_count}
                {v.max_redemptions ? ` of ${v.max_redemptions}` : ''}
                {v.expires_at ? ` · expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <Switch checked={v.is_active} onCheckedChange={() => toggle(v)} />
                <Button variant="ghost" size="icon" onClick={() => remove(v)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
