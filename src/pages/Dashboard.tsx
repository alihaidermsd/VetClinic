import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Users, 
  Pill, 
  CreditCard, 
  BarChart3, 
  Settings,
  LogOut,
  Stethoscope,
  UserCircle,
  Package
} from 'lucide-react';
import { ReceptionModule } from '@/modules/ReceptionModule';
import { DoctorModule } from '@/modules/DoctorModule';
import { BillingModule } from '@/modules/BillingModule';
import { PharmacyModule } from '@/modules/PharmacyModule';
import { InventoryModule } from '@/modules/InventoryModule';
import { ReportsModule } from '@/modules/ReportsModule';
import { AdminModule } from '@/modules/AdminModule';
import { DashboardHome } from '@/modules/DashboardHome';
import { getDashboardStats } from '@/lib/services/reportService';
import { toast } from 'sonner';

type ModuleType = 'dashboard' | 'reception' | 'doctor' | 'billing' | 'pharmacy' | 'inventory' | 'reports' | 'admin';

const EMPTY_DASHBOARD_STATS = {
  today_tokens: 0,
  today_revenue: 0,
  pending_tokens: 0,
  low_stock_items: 0,
  waiting_patients: 0,
  recent_bills: [] as any[],
  room_stats: [] as any[],
};

export function Dashboard() {
  const { user, signOut, checkPermission } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleType>('dashboard');
  const [stats, setStats] = useState<any>(() => {
    try {
      return getDashboardStats();
    } catch {
      return { ...EMPTY_DASHBOARD_STATS };
    }
  });

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStats = () => {
    try {
      const data = getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats({ ...EMPTY_DASHBOARD_STATS });
    }
  };

  const handleSignOut = () => {
    signOut();
    toast.success('Signed out successfully');
  };

  const navigationItems: { id: ModuleType; label: string; icon: React.ElementType; permission: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: '*' },
    { id: 'reception', label: 'Reception', icon: Users, permission: 'reception' },
    { id: 'doctor', label: 'Doctor Room', icon: Stethoscope, permission: 'doctor_room' },
    { id: 'billing', label: 'Billing', icon: CreditCard, permission: 'billing' },
    { id: 'pharmacy', label: 'Pharmacy', icon: Pill, permission: 'pharmacy' },
    { id: 'inventory', label: 'Inventory', icon: Package, permission: 'inventory' },
    { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports' },
    { id: 'admin', label: 'Admin', icon: Settings, permission: '*' },
  ];

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardHome stats={stats} onRefresh={loadStats} />;
      case 'reception':
        return <ReceptionModule />;
      case 'doctor':
        return <DoctorModule />;
      case 'billing':
        return <BillingModule />;
      case 'pharmacy':
        return <PharmacyModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'reports':
        return <ReportsModule />;
      case 'admin':
        return <AdminModule />;
      default:
        return <DashboardHome stats={stats} onRefresh={loadStats} />;
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrator',
      reception: 'Receptionist',
      doctor: 'Doctor',
      lab_operator: 'Lab Operator',
      xray_operator: 'X-Ray Operator',
      pharmacy: 'Pharmacist',
      accountant: 'Accountant',
    };
    return labels[role] || role;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">VetClinic Pro</h1>
              <p className="text-xs text-slate-500">Management System</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigationItems.map((item) => {
            const hasAccess = item.permission === '*' || checkPermission(item.permission);
            if (!hasAccess) return null;

            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeModule === item.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-slate-200">
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {navigationItems.find(item => item.id === activeModule)?.label}
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-slate-500">Today's Tokens</p>
                  <p className="font-semibold text-slate-900">{stats?.today_tokens ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-500">Revenue</p>
                  <p className="font-semibold text-green-600">
                    ₹{Number(stats?.today_revenue ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-slate-500">Waiting</p>
                  <p className="font-semibold text-orange-600">{stats?.waiting_patients ?? 0}</p>
                </div>
              </div>
            </div>
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
