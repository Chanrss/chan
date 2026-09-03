import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  Printer, 
  Calendar, 
  TrendingUp, 
  Layers, 
  FileSpreadsheet, 
  Ban, 
  Boxes, 
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ReportEngine, ItemWiseReportRow, CategoryWiseReportRow } from '../../services/reportEngine';
import { Bill, RestaurantSettings, Category } from '../../types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { MonthlyCalendarPicker } from '../common/MonthlyCalendarPicker';

interface ReportsViewProps {
  settings?: RestaurantSettings;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ settings }) => {
  const { isOwner, hasPermission } = useAuth();
  const hasFinancialPermission = isOwner || hasPermission('reports.financial');

  const [reportType, setReportType] = useState<'item-wise' | 'category-wise' | 'daily' | 'cancelled' | 'inventory'>('item-wise');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [itemData, setItemData] = useState<ItemWiseReportRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryWiseReportRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cancelledBills, setCancelledBills] = useState<Bill[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any[]>([]);

  useEffect(() => {
    // Load categories for categorization
    getDocs(collection(db, 'categories')).then((snap) => {
      const list: Category[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
      setCategories(list);
    });
  }, []);

  const loadReportData = async () => {
    setLoading(true);
    try {
      if (reportType === 'item-wise' || reportType === 'daily') {
        const data = await ReportEngine.generateItemWiseReport(startDate, endDate, hasFinancialPermission);
        setItemData(data);
      } else if (reportType === 'category-wise') {
        const data = await ReportEngine.generateCategoryWiseReport(startDate, endDate, categories, hasFinancialPermission);
        setCategoryData(data);
      } else if (reportType === 'cancelled') {
        const q = query(
          collection(db, 'bills'),
          where('status', '==', 'CANCELLED')
        );
        const snap = await getDocs(q);
        const list: Bill[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Bill));
        setCancelledBills(list);
      } else if (reportType === 'inventory') {
        const snap = await getDocs(collection(db, 'inventory_items'));
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setInventorySummary(list);
      }
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [reportType, startDate, endDate, categories.length]);

  const handleExportXLSX = () => {
    if (reportType === 'item-wise' || reportType === 'daily') {
      const rows = itemData.map((i) => ({
        'Item Code': i.itemCode,
        'Item Name': i.itemName,
        'Quantity Sold': i.quantitySold,
        'Orders Count': i.orderCount,
        'Sales Value': i.salesValue !== undefined ? `₹${i.salesValue}` : 'N/A'
      }));
      ReportEngine.exportToExcel(rows, `Item_Sales_${startDate}_to_${endDate}`, 'Item Sales');
    } else if (reportType === 'category-wise') {
      const rows = categoryData.map((c) => ({
        'Category Name': c.categoryName,
        'Total Quantity': c.totalQuantity,
        'Order Count': c.orderCount,
        'Sales Value': c.totalSalesValue !== undefined ? `₹${c.totalSalesValue}` : 'N/A'
      }));
      ReportEngine.exportToExcel(rows, `Category_Sales_${startDate}_to_${endDate}`, 'Category Sales');
    } else if (reportType === 'cancelled') {
      const rows = cancelledBills.map((b) => ({
        'Bill No': b.billNumber,
        'Date': b.businessDate,
        'Grand Total': b.grandTotal,
        'Reason': b.cancelReason || '',
        'Cancelled By': b.cancelledBy || ''
      }));
      ReportEngine.exportToExcel(rows, 'Cancelled_Bills', 'Cancelled Bills');
    } else if (reportType === 'inventory') {
      const rows = inventorySummary.map((i) => ({
        'Item Code': i.itemCode,
        'Item Name': i.itemName,
        'Current Stock': i.currentStock,
        'Unit': i.unit || 'Units',
        'Minimum Stock': i.minimumStock || 5
      }));
      ReportEngine.exportToExcel(rows, 'Inventory_Stock_Balance', 'Stock Balance');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalRevenue = itemData.reduce((s, i) => s + (i.salesValue || 0), 0);
  const totalQuantity = itemData.reduce((s, i) => s + i.quantitySold, 0);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-3 sm:p-4 gap-3 overflow-hidden">
      
      {/* Report Header & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100">
              Sales & Operational Analytics
            </h2>
            <p className="text-[11px] text-slate-400">Pure operational billing metrics (Tax & payment gateways excluded)</p>
          </div>
        </div>

        {/* Date Range & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          
          <MonthlyCalendarPicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />

          <button
            onClick={loadReportData}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportXLSX}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel (.xlsx)</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

        </div>

      </div>

      {/* Report Types Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto bg-slate-900 p-2 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => setReportType('item-wise')}
          className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            reportType === 'item-wise' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Item-Wise Sales
        </button>

        <button
          onClick={() => setReportType('category-wise')}
          className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            reportType === 'category-wise' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Category-Wise Sales
        </button>

        <button
          onClick={() => setReportType('cancelled')}
          className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            reportType === 'cancelled' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Ban className="w-3.5 h-3.5" /> Cancelled Bills
        </button>

        <button
          onClick={() => setReportType('inventory')}
          className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            reportType === 'inventory' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" /> Inventory Balances
        </button>
      </div>

      {/* Summary KPI Cards */}
      {(reportType === 'item-wise' || reportType === 'category-wise') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {hasFinancialPermission && (
            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold">Total Sales Revenue</span>
              <div className="text-xl sm:text-2xl font-mono font-extrabold text-emerald-400 mt-1">
                ₹{totalRevenue.toLocaleString()}
              </div>
            </div>
          )}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Total Items Sold</span>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-amber-400 mt-1">
              {totalQuantity} qty
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Unique Menu Products</span>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-blue-400 mt-1">
              {itemData.length} items
            </div>
          </div>
        </div>
      )}

      {/* Report Tables Container */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col">
        
        <div className="flex-1 overflow-y-auto">
          
          {/* 1. Item-Wise Sales Table */}
          {reportType === 'item-wise' && (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Item Code</th>
                  <th className="py-3">Item Name</th>
                  <th className="py-3 text-center">Qty Sold</th>
                  <th className="py-3 text-center">Order Count</th>
                  {hasFinancialPermission && <th className="py-3 text-right">Revenue (₹)</th>}
                  {hasFinancialPermission && <th className="py-3 text-right pr-4">% Share</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {itemData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                      No sales recorded in this date range.
                    </td>
                  </tr>
                ) : (
                  itemData.map((item, idx) => {
                    const pct = totalRevenue > 0 && item.salesValue ? ((item.salesValue / totalRevenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2.5 pl-4 font-bold text-amber-400">{item.itemCode}</td>
                        <td className="py-2.5 font-sans font-medium text-slate-200">{item.itemName}</td>
                        <td className="py-2.5 text-center font-bold text-white">{item.quantitySold}</td>
                        <td className="py-2.5 text-center text-slate-400">{item.orderCount}</td>
                        {hasFinancialPermission && (
                          <td className="py-2.5 text-right font-extrabold text-emerald-400">
                            ₹{item.salesValue || 0}
                          </td>
                        )}
                        {hasFinancialPermission && (
                          <td className="py-2.5 text-right pr-4 text-slate-400">{pct}%</td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* 2. Category-Wise Sales Table */}
          {reportType === 'category-wise' && (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Category Name</th>
                  <th className="py-3 text-center">Total Quantity</th>
                  <th className="py-3 text-center">Order Count</th>
                  {hasFinancialPermission && <th className="py-3 text-right pr-4">Total Revenue (₹)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {categoryData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 font-sans">
                      No sales data in this date range.
                    </td>
                  </tr>
                ) : (
                  categoryData.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-3 pl-4 font-sans font-bold text-slate-200">{cat.categoryName}</td>
                      <td className="py-3 text-center font-bold text-amber-400">{cat.totalQuantity}</td>
                      <td className="py-3 text-center text-slate-400">{cat.orderCount}</td>
                      {hasFinancialPermission && (
                        <td className="py-3 text-right pr-4 font-extrabold text-emerald-400 text-sm">
                          ₹{cat.totalSalesValue || 0}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 3. Cancelled Bills Table */}
          {reportType === 'cancelled' && (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Bill Number</th>
                  <th className="py-3">Date</th>
                  <th className="py-3 text-right">Grand Total</th>
                  <th className="py-3">Cancellation Reason</th>
                  <th className="py-3 text-right pr-4">Cancelled By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {cancelledBills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      No cancelled bills recorded.
                    </td>
                  </tr>
                ) : (
                  cancelledBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 pl-4 font-bold text-red-400">{b.billNumber}</td>
                      <td className="py-2.5 text-slate-300 font-sans">{b.businessDate}</td>
                      <td className="py-2.5 text-right font-bold text-slate-200">₹{b.grandTotal}</td>
                      <td className="py-2.5 text-red-300 font-sans">{b.cancelReason || 'No reason provided'}</td>
                      <td className="py-2.5 text-right pr-4 text-slate-400 font-sans">{b.cancelledBy || 'Staff'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 4. Inventory Balances Table */}
          {reportType === 'inventory' && (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Item Code</th>
                  <th className="py-3">Item Name</th>
                  <th className="py-3">Unit</th>
                  <th className="py-3 text-right">Current Stock</th>
                  <th className="py-3 text-right pr-4">Low Stock Warning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {inventorySummary.map((item) => {
                  const isLow = (item.currentStock || 0) <= (item.minimumStock || 5);
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 pl-4 font-mono font-bold text-amber-400">{item.itemCode}</td>
                      <td className="py-2.5 font-sans font-bold text-slate-200">{item.itemName}</td>
                      <td className="py-2.5 text-slate-400">{item.unit || 'Units'}</td>
                      <td className={`py-2.5 text-right font-extrabold ${isLow ? 'text-red-400' : 'text-emerald-400'}`}>
                        {item.currentStock || 0}
                      </td>
                      <td className="py-2.5 text-right pr-4">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          isLow ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {isLow ? 'CRITICAL' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

        </div>

      </div>

    </div>
  );
};
