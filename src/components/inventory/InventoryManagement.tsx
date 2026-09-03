import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Plus, 
  ArrowDownRight, 
  ArrowUpRight, 
  AlertTriangle, 
  History, 
  PackageCheck, 
  Search, 
  CheckCircle, 
  AlertCircle,
  FileSpreadsheet,
  X,
  Save
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, StockMovement, MenuItem } from '../../types';
import { InventoryEngine } from '../../services/inventoryEngine';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';

export const InventoryManagement: React.FC = () => {
  const { currentUser } = useAuth();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
  const [searchQuery, setSearchQuery] = useState('');

  // Stock In / Adjustment Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'PURCHASE' | 'ADJUSTMENT' | 'WASTAGE'>('PURCHASE');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // Inventory listener
    const unsubInv = onSnapshot(collection(db, 'inventory_items'), (snap) => {
      const list: InventoryItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as InventoryItem));
      setInventory(list);
    });

    // Movements listener
    const qMov = query(collection(db, 'inventory_movements'), orderBy('createdAt', 'desc'), limit(100));
    const unsubMov = onSnapshot(qMov, (snap) => {
      const list: StockMovement[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StockMovement));
      setMovements(list);
    });

    // Menu items listener
    const unsubMenu = onSnapshot(collection(db, 'menu_items'), (snap) => {
      const list: MenuItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MenuItem));
      setMenuItems(list);
    });

    return () => {
      unsubInv();
      unsubMov();
      unsubMenu();
    };
  }, []);

  const openStockModal = (type: 'PURCHASE' | 'ADJUSTMENT' | 'WASTAGE', defaultItemId?: string) => {
    setModalType(type);
    setSelectedItemId(defaultItemId || menuItems[0]?.id || '');
    setQuantityInput('');
    setUnitCostInput('');
    setReasonInput('');
    setReferenceInput('');
    setModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantityInput);
    if (!selectedItemId || isNaN(qty) || qty <= 0) {
      setNotification({ type: 'error', message: 'Please specify a valid quantity.' });
      return;
    }

    setSaving(true);
    try {
      const targetMenu = menuItems.find((m) => m.id === selectedItemId);
      const itemName = targetMenu?.itemName || 'Item';

      const itemCode = targetMenu?.itemCode || 'CODE';

      if (modalType === 'PURCHASE') {
        await InventoryEngine.addPurchase(
          {
            purchaseNumber: `PO_${Date.now()}`,
            invoiceNumber: referenceInput.trim() || `INV_${Date.now()}`,
            supplierName: 'Vendor Supplier',
            date: new Date().toISOString().split('T')[0],
            totalAmount: qty * (parseFloat(unitCostInput) || 0),
            createdBy: currentUser?.name || 'Staff'
          },
          [
            {
              itemId: selectedItemId,
              itemCode,
              itemName,
              quantity: qty,
              unitPrice: parseFloat(unitCostInput) || 0,
              totalPrice: qty * (parseFloat(unitCostInput) || 0)
            }
          ]
        );
        setNotification({ type: 'success', message: `Stock purchase of ${qty} units recorded for ${itemName}.` });
      } else if (modalType === 'ADJUSTMENT') {
        await InventoryEngine.addAdjustment({
          itemId: selectedItemId,
          itemCode,
          itemName,
          adjustmentType: 'INCREASE',
          quantity: qty,
          reason: reasonInput.trim() || 'Physical count adjustment',
          createdBy: currentUser?.name || 'Staff'
        });
        setNotification({ type: 'success', message: `Stock adjusted by ${qty} units for ${itemName}.` });
      } else if (modalType === 'WASTAGE') {
        await InventoryEngine.addWastage({
          itemId: selectedItemId,
          itemCode,
          itemName,
          quantity: qty,
          reason: reasonInput.trim() || 'Kitchen spoilage / wastage',
          createdBy: currentUser?.name || 'Staff'
        });
        setNotification({ type: 'success', message: `Recorded ${qty} units wastage for ${itemName}.` });
      }

      setModalOpen(false);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to record inventory change.' });
    } finally {
      setSaving(false);
    }
  };

  const filteredInventory = inventory.filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return inv.itemName.toLowerCase().includes(q) || inv.id.toLowerCase().includes(q);
  });

  const lowStockCount = inventory.filter((i) => i.currentStock <= (i.lowStockThreshold || 5)).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-3 sm:p-4 gap-3 overflow-hidden">
      
      {/* Header & Quick Action Buttons */}
      <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100">
              Inventory & Stock Management
            </h2>
            <p className="text-[11px] text-slate-400">Real-time stock tracking with auto-deduction on bill save</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub-tabs */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'stock' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Stock Balances ({inventory.length})
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'movements' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Movement Log ({movements.length})
            </button>
          </div>

          {/* Quick Action buttons */}
          <button
            onClick={() => openStockModal('PURCHASE')}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Purchase
          </button>
          <button
            onClick={() => openStockModal('WASTAGE')}
            className="px-3 py-1.5 bg-red-800/80 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Log Wastage
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 ${
          notification.type === 'success'
            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
            : 'bg-red-950 border border-red-500/40 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Low stock notice if any */}
      {lowStockCount > 0 && (
        <div className="bg-amber-950/60 border border-amber-500/40 px-3.5 py-2 rounded-lg text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span><b>{lowStockCount} items</b> are below their minimum threshold stock level.</span>
        </div>
      )}

      {/* VIEW 1: CURRENT STOCK BALANCES */}
      {activeTab === 'stock' && (
        <div className="flex flex-col flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
          
          <div className="p-3 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search stock item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredInventory.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center">
                <Boxes className="w-10 h-10 text-slate-700 mb-2" />
                <p className="font-semibold text-sm">No inventory items tracked yet</p>
                <p className="text-xs text-slate-600">Click "Add Purchase" to register opening stock.</p>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="py-3 pl-4">Item Name</th>
                    <th className="py-3">Unit</th>
                    <th className="py-3 text-right">Current Stock</th>
                    <th className="py-3 text-right">Min Threshold</th>
                    <th className="py-3 text-center">Status</th>
                    <th className="py-3 text-center pr-4">Quick Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {filteredInventory.map((item) => {
                    const isLow = item.currentStock <= (item.lowStockThreshold || 5);
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 pl-4 font-sans font-bold text-slate-200">{item.itemName}</td>
                        <td className="py-3 text-slate-400">{item.unit || 'Units'}</td>
                        <td className={`py-3 text-right text-base font-extrabold ${
                          isLow ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                          {item.currentStock}
                        </td>
                        <td className="py-3 text-right text-slate-400">{item.lowStockThreshold || 5}</td>
                        <td className="py-3 text-center">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            isLow
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {isLow ? 'Low Stock' : 'Optimal'}
                          </span>
                        </td>
                        <td className="py-3 text-center pr-4">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openStockModal('PURCHASE', item.id)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-[10px] font-sans font-bold"
                            >
                              + Stock
                            </button>
                            <button
                              onClick={() => openStockModal('ADJUSTMENT', item.id)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded text-[10px] font-sans font-bold"
                            >
                              Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}

      {/* VIEW 2: AUDIT MOVEMENT LOG */}
      {activeTab === 'movements' && (
        <div className="flex flex-col flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Timestamp</th>
                  <th className="py-3">Item</th>
                  <th className="py-3">Type</th>
                  <th className="py-3 text-right">Quantity</th>
                  <th className="py-3">Reference / Reason</th>
                  <th className="py-3 text-right pr-4">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {movements.map((mov) => {
                  const isPositive = mov.type === 'PURCHASE' || (mov.type === 'ADJUSTMENT' && mov.quantity > 0);
                  return (
                    <tr key={mov.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 pl-4 text-slate-400 text-[11px]">
                        {new Date(mov.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2.5 font-sans font-medium text-slate-200">{mov.itemName}</td>
                      <td className="py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          mov.type === 'PURCHASE'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : mov.type === 'SALE'
                            ? 'bg-blue-500/20 text-blue-400'
                            : mov.type === 'WASTAGE'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {mov.type}
                        </span>
                      </td>
                      <td className={`py-2.5 text-right font-bold ${
                        isPositive ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {isPositive ? `+${mov.quantity}` : `${mov.quantity}`}
                      </td>
                      <td className="py-2.5 text-slate-400 font-sans text-[11px] truncate max-w-xs">
                        {mov.reference || mov.reason || '-'}
                      </td>
                      <td className="py-2.5 text-right pr-4 text-slate-400 font-sans">{mov.userName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: STOCK IN / ADJUSTMENT / WASTAGE */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-400" />
                {modalType === 'PURCHASE' ? 'Log Purchase Invoice' : modalType === 'ADJUSTMENT' ? 'Physical Stock Adjustment' : 'Log Wastage'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">SELECT ITEM *</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.itemCode}] {m.itemName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">QUANTITY *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="e.g. 50"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>

                {modalType === 'PURCHASE' && (
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">UNIT COST (₹)</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 25"
                      value={unitCostInput}
                      onChange={(e) => setUnitCostInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}
              </div>

              {modalType === 'PURCHASE' && (
                <div>
                  <label className="block font-bold text-slate-400 mb-1">SUPPLIER / INVOICE NUMBER</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-9042 / Metro Dairy"
                    value={referenceInput}
                    onChange={(e) => setReferenceInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {(modalType === 'ADJUSTMENT' || modalType === 'WASTAGE') && (
                <div>
                  <label className="block font-bold text-slate-400 mb-1">REASON / NOTES</label>
                  <input
                    type="text"
                    placeholder={modalType === 'WASTAGE' ? 'e.g. Burned, spilled, expired...' : 'e.g. Weekly physical audit variance'}
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
