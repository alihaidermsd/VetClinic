import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  CreditCard, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Calendar,
  Stethoscope,
  Package
} from 'lucide-react';
import { getLowStockItems } from '@/lib/services/inventoryService';
import { getTodayTokensForDashboard } from '@/lib/services/tokenService';
import { toast } from 'sonner';

interface DashboardHomeProps {
  stats: any;
  onRefresh: () => void;
}

export function DashboardHome({ stats, onRefresh }: DashboardHomeProps) {
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [recentTokens, setRecentTokens] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadAdditionalData();
  }, [stats]);

  const loadAdditionalData = () => {
    try {
      const lowStockItems = getLowStockItems();
      setLowStock(lowStockItems.slice(0, 5));

      const tokens = getTodayTokensForDashboard();
      setRecentTokens(tokens.slice(0, 5));
    } catch (error) {
      console.error('Failed to load additional data:', error);
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    onRefresh();
    loadAdditionalData();
    setTimeout(() => setIsLoading(false), 500);
    toast.success('Dashboard refreshed');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-orange-100 text-orange-800',
      paid: 'bg-green-100 text-green-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Today's Tokens</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.today_tokens || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Today's Revenue</p>
                <p className="text-2xl font-bold text-green-600">₹{(stats?.today_revenue || 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Waiting Patients</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.waiting_patients || 0}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Low Stock Items</p>
                <p className="text-2xl font-bold text-red-600">{stats?.low_stock_items || 0}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tokens */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Recent Tokens
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {recentTokens.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Token</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Patient</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Animal</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTokens.map((token) => (
                      <tr key={token.id} className="border-b border-slate-100">
                        <td className="py-3 font-medium">#{token.token_number}</td>
                        <td className="py-3 text-sm">{token.patient_name}</td>
                        <td className="py-3 text-sm">{token.animal_name}</td>
                        <td className="py-3">
                          <Badge className={getStatusBadge(token.status)}>
                            {token.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No tokens generated today</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length > 0 ? (
              <div className="space-y-3">
                {lowStock.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">{item.stock_quantity} left</p>
                      <p className="text-xs text-slate-500">Min: {item.min_stock_level}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>All items are well stocked</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Room Statistics */}
      {stats?.room_stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Stethoscope className="w-5 h-5" />
              Room Activity Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stats.room_stats.map((room: any) => (
                <div key={room.room_name} className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700">{room.room_name}</p>
                  <p className="text-2xl font-bold text-slate-900">{room.token_count}</p>
                  <p className="text-xs text-slate-500">patients</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.location.href = 'reception'}>
              <Users className="w-4 h-4 mr-2" />
              New Patient
            </Button>
            <Button variant="outline" onClick={() => window.location.href = 'billing'}>
              <CreditCard className="w-4 h-4 mr-2" />
              Process Payment
            </Button>
            <Button variant="outline" onClick={() => window.location.href = 'inventory'}>
              <Package className="w-4 h-4 mr-2" />
              Check Inventory
            </Button>
            <Button variant="outline" onClick={() => window.location.href = 'reports'}>
              <TrendingUp className="w-4 h-4 mr-2" />
              View Reports
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
