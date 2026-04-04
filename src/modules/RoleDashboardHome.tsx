import { useCallback, useEffect, useState, type ElementType } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ArrowRight,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  Calendar,
  TrendingUp,
  Users,
  Package,
  Stethoscope,
  Shield,
} from 'lucide-react';
import type { UserRole } from '@/types';
import {
  getRoleDashboardPayload,
  type ActivityTotals,
  type RoleDashboardPayload,
} from '@/lib/services/roleDashboardService';
import { toast } from 'sonner';

export type RoleDashboardLink = {
  id: string;
  label: string;
  href: string;
  icon: ElementType;
};

type RoleDashboardHomeProps = {
  userId: number;
  role: UserRole;
  userName?: string;
  roleLabel: string;
  links: RoleDashboardLink[];
};

function formatInr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function StatCard({
  title,
  icon: Icon,
  totals,
  countLabel,
  billsLabel,
  accent,
}: {
  title: string;
  icon: ElementType;
  totals: ActivityTotals;
  countLabel: string;
  billsLabel: string;
  accent: string;
}) {
  return (
    <Card className={`overflow-hidden border-slate-200 shadow-sm ${accent}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{totals.count}</p>
        <p className="text-xs text-slate-500 mt-1">{countLabel}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-emerald-700 font-semibold">{formatInr(totals.totalAmount)}</span>
          <span className="text-slate-500">
            {billsLabel}: <strong className="text-slate-800">{totals.uniqueBills}</strong>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityBars({ day, week, month }: { day: number; week: number; month: number }) {
  const max = Math.max(day, week, month, 1);
  const rows = [
    { label: 'Today', value: day, className: 'bg-blue-500' },
    { label: 'This week', value: week, className: 'bg-indigo-500' },
    { label: 'This month', value: month, className: 'bg-violet-500' },
  ];
  return (
    <div className="space-y-2 mt-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Volume comparison</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-600 w-24 shrink-0">{r.label}</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${r.className}`}
              style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-8 text-right tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RoleDashboardHome({ userId, role, userName, roleLabel, links }: RoleDashboardHomeProps) {
  const [payload, setPayload] = useState<RoleDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      setPayload(getRoleDashboardPayload(userId, role));
    } catch (e) {
      console.error(e);
      toast.error('Could not load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, [userId, role]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 45000);
    return () => clearInterval(t);
  }, [refresh]);

  const onManualRefresh = () => {
    setLoading(true);
    refresh();
    toast.success('Updated');
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Hello{userName ? `, ${userName}` : ''}
              </h1>
              <p className="text-blue-100/90 text-sm mt-1">{roleLabel}</p>
              {payload && (
                <p className="text-slate-300 text-sm mt-3 max-w-xl leading-relaxed">{payload.subtext}</p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 bg-white/15 text-white border-0 hover:bg-white/25"
            onClick={onManualRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!payload && loading && (
        <p className="text-sm text-slate-500">Loading your dashboard…</p>
      )}

      {payload?.mode === 'admin' && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-blue-600" />
              {payload.headline}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Stethoscope className="w-3.5 h-3.5" /> Today&apos;s tokens
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{payload.today_tokens}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Waiting now</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{payload.waiting_patients}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Low stock SKUs
                  </p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{payload.low_stock_items}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Active users
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{payload.active_users}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 lg:col-span-1 col-span-2">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">Active rooms</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{payload.active_rooms}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {(payload?.mode === 'bill_lines' || payload?.mode === 'payments') && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              {payload.headline}
            </h2>
            <p className="text-sm text-slate-500 mb-4">Daily, weekly, and monthly totals (your sign-in only).</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Today"
                icon={Calendar}
                totals={payload.day}
                countLabel={payload.countLabel}
                billsLabel={payload.mode === 'payments' ? 'Bills paid' : 'Bills'}
                accent="border-l-4 border-l-blue-500"
              />
              <StatCard
                title="This week"
                icon={CalendarDays}
                totals={payload.week}
                countLabel={payload.countLabel}
                billsLabel={payload.mode === 'payments' ? 'Bills paid' : 'Bills'}
                accent="border-l-4 border-l-indigo-500"
              />
              <StatCard
                title="This month"
                icon={CalendarRange}
                totals={payload.month}
                countLabel={payload.countLabel}
                billsLabel={payload.mode === 'payments' ? 'Bills paid' : 'Bills'}
                accent="border-l-4 border-l-violet-500"
              />
            </div>

            <Card className="mt-4 border-slate-200">
              <CardContent className="p-4">
                <ActivityBars
                  day={payload.day.count}
                  week={payload.week.count}
                  month={payload.month.count}
                />
              </CardContent>
            </Card>
          </div>

          {payload.mode === 'bill_lines' && payload.topThisMonth.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base">Top services this month</CardTitle>
                <p className="text-sm text-slate-500 font-normal">By line items you added</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-600">
                        <th className="py-2 px-3 font-medium">Service</th>
                        <th className="py-2 px-3 font-medium text-right">Lines</th>
                        <th className="py-2 px-3 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.topThisMonth.map((row) => (
                        <tr key={row.name} className="border-t border-slate-100">
                          <td className="py-2.5 px-3 text-slate-900">{row.name}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{row.count}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-700 tabular-nums">
                            {formatInr(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div>
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Your sections</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {links.map(({ id, label, href, icon: Icon }) => (
            <li key={id}>
              <a
                href={href}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 no-underline transition-colors hover:border-blue-300 hover:bg-blue-50/50 group shadow-sm"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-blue-100">
                  <Icon className="w-5 h-5 text-slate-700 group-hover:text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Open</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-blue-600" />
              </a>
            </li>
          ))}
        </ul>
        {links.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
            No sections are assigned for your account. Ask an administrator to check your role and permissions.
          </p>
        )}
      </div>
    </div>
  );
}
