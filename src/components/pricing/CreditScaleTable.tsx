import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PRO_MONTHLY_CREDITS, TOP_UP_CREDITS, TOP_UP_PRICE_USD } from '@/lib/billing';
import { CREDIT_PRICE_LIST, scalingRows } from '@/lib/creditScaling';

const fmt = (n: number) => n.toLocaleString('en-GB');

export function CreditScaleTable() {
  const [open, setOpen] = useState(false);
  const rows = scalingRows();

  return (
    <section aria-labelledby="credit-scale-heading" className="mx-auto mt-12 max-w-4xl rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
      <h2 id="credit-scale-heading" className="font-display text-2xl tracking-tight md:text-3xl">What do {PRO_MONTHLY_CREDITS} credits get you?</h2>
      <p className="mt-3 text-white/65">Unlimited stories curated and published. Credits are only for pictures and extras.</p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Likely monthly cost when every story gets a standard illustration</caption>
          <thead>
            <tr className="border-b border-white/10 text-white/50">
              <th scope="col" className="py-3 pr-4 font-normal">Illustrated stories a day</th>
              <th scope="col" className="py-3 pr-4 font-normal">A month</th>
              <th scope="col" className="py-3 text-right font-normal">Monthly cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.perMonth} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 text-white/85">{row.firstRow ? `Up to ${row.perDay}` : `About ${row.perDay}`}</td>
                <td className="py-3 pr-4 text-white/65">{fmt(row.perMonth)}</td>
                <td className={`py-3 text-right font-medium ${row.firstRow ? 'text-emerald-300' : 'text-white'}`}>${row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-white/45">Based on a standard illustration on every story. Extra credits are ${TOP_UP_PRICE_USD} per {TOP_UP_CREDITS} and never expire.</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="credit-price-list"
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-emerald-300 hover:text-emerald-200"
      >
        See all credit costs
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div id="credit-price-list" className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Credit cost of each creative extra</caption>
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th scope="col" className="py-3 pr-4 font-normal">Use</th>
                <th scope="col" className="py-3 pr-4 font-normal">Credits each</th>
                <th scope="col" className="py-3 text-right font-normal">Per {PRO_MONTHLY_CREDITS} credits</th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_PRICE_LIST.map((row) => (
                <tr key={row.use} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 text-white/85">{row.use}</td>
                  <td className="py-3 pr-4 text-white/65">{row.credits}</td>
                  <td className="py-3 text-right text-white">{fmt(row.perAllowance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
