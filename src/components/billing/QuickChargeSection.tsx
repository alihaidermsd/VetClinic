import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BillItemFormData, ItemType } from '@/types';
import type { QuickChargePreset } from '@/lib/services/billingService';
import { toast } from 'sonner';

type QuickChargeSectionProps = {
  presets: QuickChargePreset[];
  /** When this changes (e.g. token id), preset row quantities reset */
  resetKey?: string | number | null;
  visitLocked: boolean;
  onAddLine: (data: BillItemFormData) => void;
  /** Item type used for the optional custom row (operator rooms use their room type). */
  customItemType: ItemType;
  presetHint?: string;
};

function PresetRow({
  preset,
  visitLocked,
  resetKey,
  onAdd,
}: {
  preset: QuickChargePreset;
  visitLocked: boolean;
  resetKey?: string | number | null;
  onAdd: (unitPrice: number) => void;
}) {
  const [price, setPrice] = useState<string>(() => String(preset.unit_price ?? ''));

  useEffect(() => {
    setPrice(String(preset.unit_price ?? ''));
  }, [resetKey, preset.name]);

  const handleAdd = () => {
    const unit = parseFloat(String(price).replace(/,/g, '').trim());
    if (!Number.isFinite(unit) || unit <= 0) {
      toast.error('Enter a valid amount greater than zero');
      return;
    }
    onAdd(unit);
    setPrice(String(preset.unit_price ?? ''));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className="flex-1 min-w-[9rem] text-sm font-medium text-slate-800">{preset.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-500">Amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="w-24 h-8 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={visitLocked}
            aria-label={`Amount for ${preset.name}`}
          />
        </div>
        <Input
          type="text"
          readOnly
          value="× 1"
          className="w-10 h-8 text-[11px] text-center bg-transparent border-0 text-slate-500"
          aria-hidden="true"
        />
        <Button type="button" size="sm" variant="secondary" onClick={handleAdd} disabled={visitLocked}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function QuickChargeSection({
  presets,
  resetKey,
  visitLocked,
  onAddLine,
  customItemType,
  presetHint = 'Standard fees are set — enter quantity and tap Add.',
}: QuickChargeSectionProps) {
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState('1');

  useEffect(() => {
    setCustomName('');
    setCustomPrice('');
    setCustomQty('1');
  }, [resetKey]);

  const handleAddCustom = () => {
    const unit = parseFloat(String(customPrice).replace(/,/g, ''));
    const qty = parseInt(String(customQty).trim(), 10);
    onAddLine({
      item_name: customName.trim(),
      item_type: customItemType,
      quantity: qty,
      unit_price: unit,
      notes: '',
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-slate-800">Standard charges</Label>
        <p className="text-xs text-slate-500">{presetHint}</p>
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3">
          {presets.slice(0, 2).map((p) => (
            <PresetRow
              key={p.name}
              preset={p}
              visitLocked={visitLocked}
              resetKey={resetKey}
              onAdd={(unitPrice) =>
                onAddLine({
                  item_name: p.name,
                  item_type: p.item_type,
                  quantity: 1,
                  unit_price: unitPrice,
                  notes: '',
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-white/60 p-3">
        <Label className="text-slate-800">Custom (optional)</Label>
        <p className="text-xs text-slate-500">Other service name and price when it is not in the list above.</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[10rem] space-y-1">
            <Label className="text-xs text-slate-500">Name</Label>
            <Input
              placeholder="e.g. Extra dressing"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              disabled={visitLocked}
            />
          </div>
          <div className="w-28 space-y-1">
            <Label className="text-xs text-slate-500">Price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Rs."
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              disabled={visitLocked}
            />
          </div>
          <div className="w-20 space-y-1">
            <Label className="text-xs text-slate-500">Qty</Label>
            <Input
              type="number"
              min={1}
              value={customQty}
              onChange={(e) => setCustomQty(e.target.value)}
              disabled={visitLocked}
            />
          </div>
          <Button type="button" variant="outline" onClick={handleAddCustom} disabled={visitLocked}>
            Add custom
          </Button>
        </div>
      </div>
    </div>
  );
}
