import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  Boxes, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  BarChart3,
  CalendarDays,
  Award
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { Bill, Kot, RestaurantSettings } from '../../types';
import { getBusinessDate } from '../../services/billNumberEngine';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { NavTab } from '../common/Sidebar';

interface DashboardProps {
  settings?: RestaurantSettings;
  onNavigate: (tab: NavTab) => void;
}

interface DailySalesData {
  date: string;
  dayLabel: string;
  shortDate: string;
  fullDateLabel: string;
  sales: number;
  orders: number;
  isToday: boolean;
  isFuture: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ settings, onNavigate }) => {
  const { currentUser, isOwner, isManager, isWaiter, hasPermission } = useAuth();

  const [todayBills, setTodayBills] = useState<Bill[]>([]);
  const [weeklyBills, setWeeklyBills] = useState<Bill[]>([]);
  const [runningKots, setRunningKots] = useState<Kot[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalMenuItems, setTotalMenuItems] = useState(0);
  const [loading, setLoading] = useState(true);

  const businessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');

  // Compute the 7 days of the current week (Monday to Sunday)
  const currentWeekDays = useMemo(() => {
    const [yearStr, monthStr, dayStr] = businessDate.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    const day = parseInt(dayStr, 10) || new Date().getDate();

    const curDate = new Date(year, month - 1, day);
    const dayOfWeek = curDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const distanceToMonday = (dayOfWeek + 6) % 7;

    const monday = new Date(curDate);
    monday.setDate(curDate.getDate() - distanceToMonday);

    const days: { date: string; dayLabel: string; shortDate: string; fullDateLabel: string; isToday: boolean; isFuture: boolean }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayLabel = dayNames[i];
      const shortDate = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
      const fullDateLabel = `${dayNames[i]}, ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
      
      days.push({
        date: dateStr,
        dayLabel,
        shortDate,
        fullDateLabel,
        isToday: dateStr === businessDate,
        isFuture: dateStr > businessDate
      });
    }
    return days;
  }, [businessDate]);

  const weekStartDate = currentWeekDays[0]?.date || businessDate;
  const weekEndDate = currentWeekDays[6]?.date || businessDate;

  useEffect(() => {
    // Today's bills
    const qBills = query(
      collection(db, 'bills'),
      where('businessDate', '==', businessDate)
    );
    const unsubBills = onSnapshot(qBills, (snap) => {
      const list: Bill[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Bill));
      setTodayBills(list);
      setLoading(false);
    });

    // Current Week's bills for the Bar Chart
    const qWeeklyBills = query(
      collection(db, 'bills'),
      where('businessDate', '>=', weekStartDate),
      where('businessDate', '<=', weekEndDate)
    );
    const unsubWeeklyBills = onSnapshot(qWeeklyBills, (snap) => {
      const list: Bill[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Bill));
      setWeeklyBills(list);
    }, (err) => {
      console.warn('Weekly bills query subscription notice:', err);
    });

    // Running KOTs
    const qKots = query(
      collection(db, 'kots'),
      where('status', 'in', ['OPEN', 'SENT', 'PREPARING', 'READY', 'COMPLETED'])
    );
    const unsubKots = onSnapshot(qKots, (snap) => {
      const list: Kot[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Kot));
      setRunningKots(list);
    });

    // Menu count
    const unsubMenu = onSnapshot(collection(db, 'menu_items'), (snap) => {
      setTotalMenuItems(snap.size);
    });

    // Low stock
    const unsubInv = onSnapshot(collection(db, 'inventory_items'), (snap) => {
      let low = 0;
      snap.forEach((d) => {
        const item = d.data();
        if (item.currentStock <= (item.minimumStock || item.lowStockThreshold || 5)) low++;
      });
      setLowStockCount(low);
    });

    return () => {
      unsubBills();
      unsubWeeklyBills();
      unsubMenu();
      unsubInv();
    };
  }, [businessDate, weekStartDate, weekEndDate]);

  const completedBills = todayBills.filter((b) => b.status === 'COMPLETED');
  const todayRevenue = completedBills.reduce((s, b) => s + b.grandTotal, 0);

  // RBAC Permission checks for revenue display
  const canViewRevenue = hasPermission('reports.view') || isOwner;

  // Process Weekly Sales Data for Recharts Bar Chart
  const weeklyChartData: DailySalesData[] = useMemo(() => {
    const completedWeekly = weeklyBills.filter((b) => b.status === 'COMPLETED');
    
    // Group bills by businessDate
    const salesMap: { [date: string]: { totalSales: number; ordersCount: number } } = {};
    completedWeekly.forEach((b) => {
      const d = b.businessDate;
      if (!salesMap[d]) {
        salesMap[d] = { totalSales: 0, ordersCount: 0 };
      }
      salesMap[d].totalSales += b.grandTotal;
      salesMap[d].ordersCount += 1;
    });

    return currentWeekDays.map((day) => {
      const dayStats = salesMap[day.date] || { totalSales: 0, ordersCount: 0 };
      return {
        date: day.date,
        dayLabel: day.dayLabel,
        shortDate: day.shortDate,
        fullDateLabel: day.fullDateLabel,
        sales: dayStats.totalSales,
        orders: dayStats.ordersCount,
        isToday: day.isToday,
        isFuture: day.isFuture
      };
    });
  }, [weeklyBills, currentWeekDays]);

  // Aggregate weekly metrics
  const weeklyTotalRevenue = useMemo(() => {
    return weeklyChartData.reduce((acc, d) => acc + d.sales, 0);
  }, [weeklyChartData]);

  const weeklyTotalOrders = useMemo(() => {
    return weeklyChartData.reduce((acc, d) => acc + d.orders, 0);
  }, [weeklyChartData]);

  const bestDay = useMemo(() => {
    return weeklyChartData.reduce((best, cur) => (cur.sales > best.sales ? cur : best), weeklyChartData[0]);
  }, [weeklyChartData]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: DailySalesData = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs min-w-[170px]">
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
            <span className="font-bold text-slate-200">{data.fullDateLabel}</span>
            {data.isToday && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                Today
              </span>
            )}
          </div>
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Sales:</span>
              <span className="font-mono font-black text-emerald-400 text-sm">
                ₹{data.sales.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Completed Orders:</span>
              <span className="font-mono font-bold text-slate-200">{data.orders} bills</span>
            </div>
            {data.orders > 0 && (
              <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Avg Bill:</span>
                <span className="font-mono text-amber-300">
                  ₹{Math.round(data.sales / data.orders).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 text-slate-800 p-4 sm:p-6 gap-5 overflow-y-auto font-sans">
      
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
              BUSINESS DATE: {businessDate}
            </span>
            <span className="text-xs text-slate-500">
              Role: <b className="text-slate-800 uppercase">{currentUser?.roleId}</b>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {settings?.restaurantName || 'Hotel & Restaurant POS'}
          </h2>
        </div>

        {/* Quick Direct Launch Action */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('direct-billing')}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-102"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>Fast Direct Billing (F2)</span>
          </button>
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-102"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Touch POS</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Today's Sales Revenue (Role-gated) */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Sales</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {canViewRevenue ? (
              <div className="text-2xl sm:text-3xl font-mono font-black text-slate-900">
                ₹{todayRevenue.toLocaleString()}
              </div>
            ) : (
              <div className="text-lg font-mono font-bold text-slate-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>Restricted Role</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              {completedBills.length} completed bills today
            </p>
          </div>
        </div>

        {/* Running KOTs */}
        <div 
          onClick={() => onNavigate('kot')}
          className="bg-white hover:bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col justify-between cursor-pointer transition-all group"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-700">
              Running KOTs
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-mono font-black text-amber-600">
              {runningKots.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Active in kitchen</span>
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform text-slate-400" />
            </p>
          </div>
        </div>

        {/* Menu Items */}
        <div 
          onClick={() => onNavigate('menu')}
          className="bg-white hover:bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col justify-between cursor-pointer transition-all group"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-700">
              Menu Items
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-mono font-black text-blue-600">
              {totalMenuItems}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Dual Pricing (AC / Non-AC)
            </p>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-white hover:bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col justify-between cursor-pointer transition-all group"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-red-700">
              Inventory Alerts
            </span>
            <div className={`p-2 rounded-xl ${lowStockCount > 0 ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl sm:text-3xl font-mono font-black ${lowStockCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {lowStockCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {lowStockCount > 0 ? 'Items below threshold' : 'All stock optimal'}
            </p>
          </div>
        </div>

      </div>

      {/* Weekly Daily Sales Bar Chart (Recharts) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
        
        {/* Chart Header & Summary Metrics */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                  Daily Sales (Current Week)
                </h3>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-full">
                  {currentWeekDays[0]?.shortDate} – {currentWeekDays[6]?.shortDate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Real-time visual breakdown of revenue & order volume across Monday – Sunday
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          {canViewRevenue && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Week Total:</div>
                <div className="font-mono font-black text-xs sm:text-sm text-emerald-600">
                  ₹{weeklyTotalRevenue.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Orders:</div>
                <div className="font-mono font-bold text-xs sm:text-sm text-slate-800">
                  {weeklyTotalOrders} bills
                </div>
              </div>
              {bestDay && bestDay.sales > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-amber-800">
                  <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div className="text-[10px] font-bold">
                    Peak: <span className="font-mono">{bestDay.dayLabel}</span> (₹{bestDay.sales.toLocaleString()})
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bar Chart Canvas */}
        <div className="w-full">
          {canViewRevenue ? (
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeklyChartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="dayLabel" 
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={({ x, y, payload }) => {
                      const dayObj = weeklyChartData.find(d => d.dayLabel === payload.value);
                      const isToday = dayObj?.isToday;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text 
                            x={0} 
                            y={0} 
                            dy={12} 
                            textAnchor="middle" 
                            fill={isToday ? '#b45309' : '#64748b'}
                            fontWeight={isToday ? 800 : 600}
                            fontSize={11}
                          >
                            {payload.value}
                          </text>
                          {dayObj && (
                            <text 
                              x={0} 
                              y={0} 
                              dy={24} 
                              textAnchor="middle" 
                              fill={isToday ? '#d97706' : '#94a3b8'}
                              fontSize={9}
                              fontFamily="monospace"
                            >
                              {dayObj.shortDate}
                            </text>
                          )}
                        </g>
                      );
                    }}
                    height={40}
                  />
                  <YAxis 
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar 
                    dataKey="sales" 
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  >
                    {weeklyChartData.map((entry, index) => {
                      let fillColor = '#3b82f6'; // Default passed days (blue)
                      if (entry.isToday) {
                        fillColor = '#f59e0b'; // Today's highlight (amber)
                      } else if (entry.sales === 0) {
                        fillColor = entry.isFuture ? '#e2e8f0' : '#cbd5e1'; // Future or zero sales
                      } else if (bestDay && entry.date === bestDay.date && bestDay.sales > 0) {
                        fillColor = '#10b981'; // Peak sales day (emerald)
                      }
                      return <Cell key={`cell-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-4 border border-dashed border-slate-200 rounded-xl">
              <ShieldAlert className="w-8 h-8 text-amber-500 mb-2" />
              <p className="text-xs font-bold text-slate-700">Financial Visualizations Restricted</p>
              <p className="text-[11px] text-slate-500">Your role does not have access to view weekly revenue metrics.</p>
            </div>
          )}
        </div>

        {/* Legend */}
        {canViewRevenue && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block"></span>
                <span className="font-semibold text-slate-700">Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span>
                <span className="font-semibold text-slate-700">Peak Day</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block"></span>
                <span className="font-semibold text-slate-700">Daily Sales</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 font-mono">
              Hover over any bar to view detailed order statistics & average ticket size
            </div>
          </div>
        )}

      </div>

      {/* 2-Column Split: Active Operations on Left, Fast Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        
        {/* Left Column: Recent Activity (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <span className="font-bold text-sm text-slate-800">Today's Recent Bills</span>
            <button
              onClick={() => onNavigate('reprint')}
              className="text-xs text-amber-600 hover:text-amber-700 font-bold cursor-pointer"
            >
              View All Bills →
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto">
            {todayBills.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                <Clock className="w-8 h-8 text-slate-300 mb-1.5" />
                <p className="text-xs font-medium text-slate-700">No bills created yet today</p>
                <p className="text-[11px] text-slate-500">Start with Direct Billing or POS to process orders.</p>
              </div>
            ) : (
              <table className="w-full text-xs text-left font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px]">
                    <th className="pb-2 pl-2">Bill #</th>
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todayBills.slice(0, 8).map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pl-2 font-bold text-amber-700">{b.billNumber}</td>
                      <td className="py-2.5 text-slate-500 font-sans">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 text-slate-700 font-sans text-[11px]">
                        {b.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} ({b.priceType})
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">₹{b.grandTotal}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Quick Navigation (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Quick Launch Navigation Cards */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
            <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Fast Navigation</h3>
            
            <button
              onClick={() => onNavigate('kot')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                  <ChefHat className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800">Kitchen Orders (KOT)</div>
                  <div className="text-[10px] text-slate-500">Live order status & kitchen tickets</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800">Sales Reports & Excel</div>
                  <div className="text-[10px] text-slate-500">Item-wise breakdown & .xlsx export</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800">Restaurant Settings</div>
                  <div className="text-[10px] text-slate-500">Receipt headers, timing & data seeder</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
