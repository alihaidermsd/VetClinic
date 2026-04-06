import { useState, useEffect, type ElementType } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  Pill,
  CreditCard,
  BarChart3,
  Receipt,
  Settings,
  LogOut,
  Stethoscope,
  UserCircle,
  Package,
  FlaskConical,
  Scan,
  Scissors,
  FileText,
  Users2,
} from 'lucide-react';
import { ReceptionModule } from '@/modules/ReceptionModule';
import { DoctorModule } from '@/modules/DoctorModule';
import { BillingModule } from '@/modules/BillingModule';
import { PharmacyModule } from '@/modules/PharmacyModule';
import { InventoryModule } from '@/modules/InventoryModule';
import { ReportsModule } from '@/modules/ReportsModule';
import { AdminModule } from '@/modules/AdminModule';
import { StaffModule } from '@/modules/StaffModule';
import { ExpenseModule } from '@/modules/ExpenseModule';
import { PatientRecordsModule } from '@/modules/PatientRecordsModule';
import { LabModule, XRayModule, SurgeryModule } from '@/modules/RoomOperatorModule';
import { DashboardHome } from '@/modules/DashboardHome';
import { RoleDashboardHome, type RoleDashboardLink } from '@/modules/RoleDashboardHome';
import { getDashboardStats } from '@/lib/services/reportService';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/BrandLogo';

type ModuleType =
  | 'dashboard'
  | 'reception'
  | 'doctor'
  | 'lab'
  | 'xray'
  | 'surgery'
  | 'billing'
  | 'pharmacy'
  | 'inventory'
  | 'reports'
  | 'patient_records'
  | 'staff'
  | 'expense'
  | 'admin';

const MODULE_IDS: ModuleType[] = [
  'dashboard',
  'reception',
  'doctor',
  'lab',
  'xray',
  'surgery',
  'billing',
  'pharmacy',
  'inventory',
  'reports',
  'expense',
  'patient_records',
  'staff',
  'admin',
];

/** Read active section from `#/billing`-style hash (refresh-safe; works with `base: './'`). */
function moduleFromHash(): ModuleType {
  const seg = window.location.hash.replace(/^#\/?/, '').split('/')[0]?.toLowerCase() || '';
  if (!seg) return 'dashboard';
  return (MODULE_IDS.includes(seg as ModuleType) ? seg : 'dashboard') as ModuleType;
}

function hashHrefForModule(id: ModuleType): string {
  return `#/${id}`;
}

type NavItem = {
  id: ModuleType;
  label: string;
  icon: ElementType;
  permission: string;
  access: 'all' | 'permission' | 'admin_only';
};

const MODULE_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'reception', access: 'all' },
  { id: 'reception', label: 'Reception', icon: Users, permission: 'reception', access: 'permission' },
  { id: 'doctor', label: 'Doctor Room', icon: Stethoscope, permission: 'doctor_room', access: 'permission' },
  { id: 'lab', label: 'Laboratory', icon: FlaskConical, permission: 'lab', access: 'permission' },
  { id: 'xray', label: 'X-Ray Room', icon: Scan, permission: 'xray', access: 'permission' },
  { id: 'surgery', label: 'Surgery Room', icon: Scissors, permission: 'surgery', access: 'permission' },
  { id: 'billing', label: 'Billing', icon: CreditCard, permission: 'billing', access: 'permission' },
  { id: 'pharmacy', label: 'Pharmacy', icon: Pill, permission: 'pharmacy', access: 'permission' },
  { id: 'inventory', label: 'Inventory', icon: Package, permission: 'inventory', access: 'permission' },
  { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports', access: 'permission' },
  { id: 'expense', label: 'Expenses', icon: Receipt, permission: 'reports', access: 'permission' },
  {
    id: 'patient_records',
    label: 'Patient records',
    icon: FileText,
    permission: 'patient_records',
    access: 'permission',
  },
  {
    id: 'staff',
    label: 'Staff',
    icon: Users2,
    permission: 'staff',
    access: 'permission',
  },
  { id: 'admin', label: 'Admin', icon: Settings, permission: '*', access: 'admin_only' },
];

const EMPTY_DASHBOARD_STATS = {
  today_tokens: 0,
  today_revenue: 0,
  today_salary_paid: 0,
  today_expenses_paid: 0,
  today_net_income: 0,
  month_salary_paid: 0,
  month_expenses_paid: 0,
  pending_tokens: 0,
  low_stock_items: 0,
  waiting_patients: 0,
  recent_bills: [] as any[],
  room_stats: [] as any[],
};

function navItemHasAccess(
  item: NavItem,
  userRole: string | undefined,
  checkPermission: (p: string) => boolean
): boolean {
  return (
    item.access === 'all' ||
    (item.access === 'admin_only' && userRole === 'admin') ||
    (item.access === 'permission' && checkPermission(item.permission))
  );
}

/** Full front-desk dashboard — Reception only. Other roles get a personalized activity dashboard. */
function showExecutiveDashboard(role: string | undefined): boolean {
  return role === 'reception';
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: 'Administrator',
    reception: 'Receptionist',
    doctor: 'Doctor',
    lab_operator: 'Lab Operator',
    xray_operator: 'X-Ray Operator',
    surgery_operator: 'Surgery Operator',
    pharmacy: 'Pharmacist',
    accountant: 'Accountant',
  };
  return labels[role] || role;
}

export function Dashboard() {
  const { user, signOut, checkPermission } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleType>(() => moduleFromHash());
  const [stats, setStats] = useState<any>(() => {
    try {
      if (!showExecutiveDashboard(user?.role)) {
        return { ...EMPTY_DASHBOARD_STATS };
      }
      return getDashboardStats();
    } catch {
      return { ...EMPTY_DASHBOARD_STATS };
    }
  });

  useEffect(() => {
    if (!showExecutiveDashboard(user?.role)) {
      setStats({ ...EMPTY_DASHBOARD_STATS });
      return;
    }
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [user?.role]);

  // Normalize empty hash so the URL always reflects the home section (bookmark / refresh).
  useEffect(() => {
    const h = window.location.hash;
    if (!h || h === '#' || h === '#/') {
      window.history.replaceState(null, '', '#/dashboard');
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setActiveModule(moduleFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // If the hash points to a module this user cannot open, fall back to dashboard.
  useEffect(() => {
    const item = MODULE_NAV_ITEMS.find((i) => i.id === activeModule);
    if (!item) return;
    if (navItemHasAccess(item, user?.role, checkPermission)) return;
    setActiveModule('dashboard');
    if (window.location.hash !== '#/dashboard') {
      window.location.hash = '#/dashboard';
    }
  }, [activeModule, user?.role, checkPermission]);

  const loadStats = () => {
    try {
      const data = getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats({ ...EMPTY_DASHBOARD_STATS });
    }
  };

  const roleDashboardLinks = (): RoleDashboardLink[] =>
    MODULE_NAV_ITEMS.filter(
      (i) => i.id !== 'dashboard' && navItemHasAccess(i, user?.role, checkPermission)
    ).map((i) => ({
      id: i.id,
      label: i.label,
      href: hashHrefForModule(i.id),
      icon: i.icon,
    }));

  const renderDashboardHome = () => {
    if (showExecutiveDashboard(user?.role)) {
      return <DashboardHome stats={stats} onRefresh={loadStats} />;
    }
    if (!user?.id) {
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600 text-sm">
          Loading your profile…
        </div>
      );
    }
    return (
      <RoleDashboardHome
        userId={user.id}
        role={user.role}
        userName={user.name}
        roleLabel={getRoleLabel(user.role)}
        links={roleDashboardLinks()}
      />
    );
  };

  const handleSignOut = () => {
    try {
      const { pathname, search } = window.location;
      window.history.replaceState(null, '', `${pathname}${search}`);
    } catch {
      /* ignore */
    }
    signOut();
    toast.success('Signed out successfully');
  };

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return renderDashboardHome();
      case 'reception':
        return <ReceptionModule />;
      case 'doctor':
        return <DoctorModule />;
      case 'lab':
        return <LabModule />;
      case 'xray':
        return <XRayModule />;
      case 'surgery':
        return <SurgeryModule />;
      case 'billing':
        return <BillingModule />;
      case 'pharmacy':
        return <PharmacyModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'reports':
        return <ReportsModule />;
      case 'expense':
        return checkPermission('reports') && user?.id ? (
          <ExpenseModule currentUserId={user.id} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <p className="font-medium">Access restricted</p>
            <p className="text-sm mt-1 text-amber-800">You do not have permission to open Expenses.</p>
          </div>
        );
      case 'patient_records':
        return <PatientRecordsModule />;
      case 'staff':
        return checkPermission('staff') && user?.id ? (
          <StaffModule currentUserId={user.id} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <p className="font-medium">Access restricted</p>
            <p className="text-sm mt-1 text-amber-800">
              You do not have permission to open Staff &amp; payroll.
            </p>
          </div>
        );
      case 'admin':
        return user?.role === 'admin' ? (
          <AdminModule />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <p className="font-medium">Access restricted</p>
            <p className="text-sm mt-1 text-amber-800">
              Only administrators can open this section.
            </p>
          </div>
        );
      default:
        return renderDashboardHome();
    }
  };

  return (
    <div className="dashboard-root flex h-screen min-h-0 overflow-hidden bg-background">
      <div className="print-only print-page-brand w-full max-w-[220px] mx-auto py-3">
        <BrandLogo variant="print" alt="" />
      </div>

      {/* Sidebar: logo + user fixed; nav scrolls on its own */}
      <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-border bg-card no-print shadow-[1px_0_0_rgba(94,48,85,0.04)]">
        {/* Logo — full card, links to dashboard */}
        <div className="shrink-0 border-b border-border bg-muted/20 p-4">
          <a
            href={hashHrefForModule('dashboard')}
            className="group flex flex-col gap-3 rounded-xl no-underline text-inherit outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <BrandLogo variant="dashboard" alt="Animal Care Hospital — go to dashboard" />
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Management system
            </p>
          </a>
        </div>

        {/* Navigation — independent scroll */}
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain p-4">
          {MODULE_NAV_ITEMS.map((item) => {
            if (!navItemHasAccess(item, user?.role, checkPermission)) return null;

            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={hashHrefForModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                  activeModule === item.id
                    ? 'bg-secondary/60 text-primary'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="shrink-0 border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500">{getRoleLabel(user?.role || '')}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 no-print">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {MODULE_NAV_ITEMS.find((item) => item.id === activeModule)?.label}
              </h2>
              <p className="text-sm text-slate-500">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            {showExecutiveDashboard(user?.role) && (
              <div className="flex items-center gap-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div className="text-center">
                    <p className="text-slate-500">Today's Tokens</p>
                    <p className="font-semibold text-slate-900">{stats?.today_tokens ?? 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Revenue (gross)</p>
                    <p className="font-semibold text-green-600">
                      Rs. {Number(stats?.today_revenue ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Salary paid today</p>
                    <p className="font-semibold text-rose-600">
                      Rs. {Number(stats?.today_salary_paid ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Expenses today</p>
                    <p className="font-semibold text-amber-800">
                      Rs. {Number(stats?.today_expenses_paid ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Net today</p>
                    <p
                      className={`font-semibold ${
                        Number(stats?.today_net_income ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      Rs. {Number(stats?.today_net_income ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Waiting</p>
                    <p className="font-semibold text-orange-600">{stats?.waiting_patients ?? 0}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Module Content */}
        <div className="flex-1 overflow-auto p-6">
          {renderModule()}
        </div>
      </main>
    </div>
  );
}
