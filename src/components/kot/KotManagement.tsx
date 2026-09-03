import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChefHat, 
  Plus, 
  Trash2, 
  Printer, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  Search,
  Filter,
  Check,
  Sparkles,
  Utensils,
  PlusCircle,
  XCircle,
  Eye,
  ShoppingBag,
  Send,
  Flame,
  CheckCircle,
  CheckSquare,
  Square,
  ListChecks
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  Kot, 
  KotItem, 
  KotStatus, 
  MenuItem, 
  OrderType, 
  PriceType, 
  RestaurantSettings 
} from '../../types';
import { allocateNextKotNumber, getBusinessDate } from '../../services/billNumberEngine';
import { BillingEngine } from '../../services/billingEngine';
import { PrinterService } from '../../services/printerService';
import { 
  collection, 
  doc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  setDoc, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { ThermalKotModal } from '../common/ThermalKotModal';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';

interface KotManagementProps {
  settings?: RestaurantSettings;
}

interface DraftKotItem {
  item: MenuItem;
  quantity: number;
  notes?: string;
}

const COMMON_TABLES = [
  'T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 
  'T-7', 'T-8', 'T-9', 'T-10', 'T-11', 'T-12', 
  'Take Away', 'Room 101', 'Room 102'
];

const KITCHEN_NOTES_PRESETS = [
  'Less Spicy',
  'No Onion/Garlic',
  'Extra Crispy',
  'Separate Sambar',
  'Parcel / Pack',
  'Sugar Less',
  'Extra Hot',
  'Without Ghee'
];

export const KotManagement: React.FC<KotManagementProps> = ({ settings }) => {
  const { currentUser } = useAuth();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'running' | 'create'>('running');
  const [runningKots, setRunningKots] = useState<{ kot: Kot; items: KotItem[] }[]>([]);
  const [firestoreMenuItems, setFirestoreMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE'); // ACTIVE, ALL, OPEN, SENT, PREPARING, READY, COMPLETED, BILLED, CANCELLED

  // Multi-selection state for kitchen bulk operations
  const [selectedKotIds, setSelectedKotIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Create / Edit KOT Draft State
  const [tableNumber, setTableNumber] = useState('T-1');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<DraftKotItem[]>([]);
  const [searchItem, setSearchItem] = useState('');
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Append items to existing KOT state
  const [appendingKot, setAppendingKot] = useState<Kot | null>(null);

  // Modals for Printing & Receipts
  const [billedReceipt, setBilledReceipt] = useState<{ bill: any; items: any[] } | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [previewKotData, setPreviewKotData] = useState<{ kot: Kot; items: KotItem[] } | null>(null);
  const [isKotModalOpen, setIsKotModalOpen] = useState(false);

  // Quick item code input ref
  const itemCodeRef = useRef<HTMLInputElement>(null);

  // Real-time listener for KOTs + Local Storage synchronization
  useEffect(() => {
    // Load local storage cache first for instant responsiveness
    try {
      const cached = localStorage.getItem('pos_local_kots');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRunningKots(parsed);
          setLoading(false);
        }
      }
    } catch (e) {
      console.warn('Local cache load note:', e);
    }

    const qKots = query(collection(db, 'kots'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qKots, async (snapshot) => {
      const kotList: Kot[] = [];
      snapshot.forEach((d) => kotList.push({ id: d.id, ...d.data() } as Kot));

      // Attempt to load kot_items
      let allKotItems: KotItem[] = [];
      try {
        const itemsSnapshot = await getDocs(collection(db, 'kot_items'));
        itemsSnapshot.forEach((d) => allKotItems.push({ id: d.id, ...d.data() } as KotItem));
      } catch (err) {
        console.warn('kot_items snapshot note:', err);
      }

      const combined = kotList.map((kot) => {
        // Prefer embedded items if present, otherwise matched kot_items
        const matchedItems = (kot.items && kot.items.length > 0) 
          ? kot.items 
          : allKotItems.filter((i) => i.kotId === kot.id);
        return {
          kot,
          items: matchedItems
        };
      });

      setRunningKots(combined);
      setLoading(false);
      localStorage.setItem('pos_local_kots', JSON.stringify(combined));
    }, (err) => {
      console.warn('KOT snapshot error:', err);
      setLoading(false);
    });

    // Menu items listener
    const unsubMenu = onSnapshot(
      collection(db, 'menu_items'),
      (snapshot) => {
        const list: MenuItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.active !== false) {
            list.push({ id: d.id, ...data } as MenuItem);
          }
        });
        setFirestoreMenuItems(list);
      },
      (err) => {
        console.warn('Menu listener error:', err);
      }
    );

    return () => {
      unsub();
      unsubMenu();
    };
  }, []);

  // Effective Menu items
  const menuItems = useMemo(() => {
    return firestoreMenuItems.length > 0 ? firestoreMenuItems : DEFAULT_FALLBACK_MENU_ITEMS;
  }, [firestoreMenuItems]);

  // Active occupied tables calculation
  const occupiedTables = useMemo(() => {
    const map = new Set<string>();
    runningKots.forEach(({ kot }) => {
      if (kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && kot.tableNumber) {
        map.add(kot.tableNumber.trim());
      }
    });
    return map;
  }, [runningKots]);

  // Categories list
  const categories = useMemo(() => {
    const distinct = new Map<string, string>();
    menuItems.forEach((m) => {
      if (m.categoryId && m.categoryName) {
        distinct.set(m.categoryId, m.categoryName);
      }
    });

    if (distinct.size === 0) {
      return DEFAULT_CATEGORIES.map(c => ({ id: c.id, name: c.categoryName }));
    }

    return Array.from(distinct.entries()).map(([id, name]) => ({ id, name }));
  }, [menuItems]);

  // Filtered menu items for creating KOT
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCat = selectedCategory === 'all' || item.categoryId === selectedCategory;
      const q = searchItem.trim().toLowerCase();
      const matchesSearch = 
        !q || 
        item.itemCode.toLowerCase().includes(q) || 
        item.itemName.toLowerCase().includes(q) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchItem]);

  // Add Item to Draft KOT
  const handleAddItemToKot = (item: MenuItem, notes?: string) => {
    setSelectedItems((prev) => {
      const existingIdx = prev.findIndex((p) => p.item.id === item.id && (p.notes || '') === (notes || ''));
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [...prev, { item, quantity: 1, notes: notes || '' }];
    });
  };

  // Fast code input (e.g. type '101' and press Enter to add)
  const handleCodeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = itemCodeInput.trim().toUpperCase();
      if (!code) return;

      const found = menuItems.find(
        (m) => m.itemCode.toUpperCase() === code || m.itemName.toUpperCase() === code
      );

      if (found) {
        handleAddItemToKot(found);
        setItemCodeInput('');
      } else {
        setNotification({ type: 'error', message: `Item code "${code}" not found.` });
        setTimeout(() => setNotification(null), 3000);
      }
    }
  };

  const handleUpdateItemQty = (index: number, delta: number) => {
    setSelectedItems((prev) => {
      const updated = [...prev];
      const next = updated[index].quantity + delta;
      if (next <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...updated[index], quantity: next };
      return updated;
    });
  };

  const handleUpdateItemNote = (index: number, note: string) => {
    setSelectedItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], notes: note };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Start appending to an existing KOT
  const handleStartAppendToKot = (kot: Kot) => {
    setAppendingKot(kot);
    setTableNumber(kot.tableNumber);
    setOrderType(kot.orderType);
    setSelectedItems([]);
    setActiveTab('create');
  };

  // Cancel appending mode
  const handleCancelAppend = () => {
    setAppendingKot(null);
    setSelectedItems([]);
  };

  // Create or Append KOT
  const handleCreateKot = async (printSlip = true) => {
    if (selectedItems.length === 0) {
      setNotification({ type: 'error', message: 'Please add at least one item to create KOT.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSubmitting(true);
    try {
      const businessDate = getBusinessDate(settings?.businessDayStart || '04:00');
      const now = Date.now();

      // If appending to an existing KOT
      if (appendingKot) {
        const newKotItems: KotItem[] = selectedItems.map((sel, idx) => ({
          id: `${appendingKot.id}_item_app_${now}_${idx + 1}`,
          kotId: appendingKot.id,
          itemId: sel.item.id,
          itemCode: sel.item.itemCode,
          itemName: sel.item.itemName,
          quantity: sel.quantity,
          priceType,
          unitPrice: BillingEngine.getApplicablePrice(sel.item, priceType),
          notes: sel.notes,
          createdAt: now,
          updatedAt: now
        }));

        const existingItems = appendingKot.items || [];
        const combinedItems = [...existingItems, ...newKotItems];

        const updatedKot: Kot = {
          ...appendingKot,
          items: combinedItems,
          itemsCount: combinedItems.reduce((sum, i) => sum + i.quantity, 0),
          updatedAt: now
        };

        // Firestore Update
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'kots', appendingKot.id), sanitizeForFirestore({
            items: combinedItems,
            itemsCount: updatedKot.itemsCount,
            updatedAt: now
          }));
          newKotItems.forEach((ki) => {
            batch.set(doc(db, 'kot_items', ki.id), sanitizeForFirestore(ki));
          });
          await batch.commit();
        } catch (dbErr) {
          console.warn('Firestore update warning, saved locally:', dbErr);
        }

        // Local state update
        setRunningKots((prev) => 
          prev.map((k) => k.kot.id === appendingKot.id ? { kot: updatedKot, items: combinedItems } : k)
        );

        if (printSlip) {
          PrinterService.printKot(updatedKot, newKotItems);
        }

        setNotification({
          type: 'success',
          message: `Added ${selectedItems.length} items to ${appendingKot.kotNumber} (${appendingKot.tableNumber})!`
        });

        setAppendingKot(null);
        setSelectedItems([]);
        setActiveTab('running');
        setTimeout(() => setNotification(null), 3500);
        return;
      }

      // Brand New KOT
      const { kotNumber } = await allocateNextKotNumber(businessDate);
      const kotId = `kot_${now}_${Math.random().toString(36).substring(2, 6)}`;

      const kotItems: KotItem[] = selectedItems.map((sel, idx) => ({
        id: `${kotId}_item_${idx + 1}`,
        kotId,
        itemId: sel.item.id,
        itemCode: sel.item.itemCode,
        itemName: sel.item.itemName,
        quantity: sel.quantity,
        priceType,
        unitPrice: BillingEngine.getApplicablePrice(sel.item, priceType),
        notes: sel.notes || '',
        createdAt: now,
        updatedAt: now
      }));

      const newKot: Kot = {
        id: kotId,
        kotNumber,
        businessDate,
        orderType,
        tableNumber: orderType === 'DINE_IN' ? (tableNumber.trim() || 'T-1') : 'Take Away',
        waiterId: currentUser?.uid || 'staff',
        waiterName: currentUser?.name || 'Waiter',
        status: 'OPEN',
        items: kotItems,
        itemsCount: kotItems.reduce((sum, i) => sum + i.quantity, 0),
        createdBy: currentUser?.name || 'Staff',
        createdAt: now,
        updatedAt: now
      };

      // Update Local State Optimistically & print IMMEDIATELY (0ms latency)
      setRunningKots((prev) => [{ kot: newKot, items: kotItems }, ...prev]);

      if (printSlip) {
        PrinterService.printKot(newKot, kotItems);
      }

      setNotification({ type: 'success', message: `KOT ${kotNumber} generated for ${newKot.tableNumber}!` });
      setSelectedItems([]);
      setActiveTab('running');
      setTimeout(() => setNotification(null), 3500);

      // Write to Firestore in background
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'kots', kotId), sanitizeForFirestore(newKot));
        kotItems.forEach((ki) => {
          batch.set(doc(db, 'kot_items', ki.id), sanitizeForFirestore(ki));
        });
        batch.commit().catch((err) => console.warn('Background KOT batch sync notice:', err));
      } catch (err) {
        console.warn('Offline KOT creation notice:', err);
      }
    } catch (e: any) {
      console.error('Error creating KOT:', e);
      setNotification({ type: 'error', message: e.message || 'Failed to create KOT.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Status progression
  const handleUpdateKotStatus = async (kotId: string, newStatus: KotStatus) => {
    try {
      try {
        await updateDoc(doc(db, 'kots', kotId), {
          status: newStatus,
          updatedAt: Date.now()
        });
      } catch (err) {
        console.warn('Offline status update:', err);
      }

      // Update local state
      setRunningKots((prev) => 
        prev.map((k) => k.kot.id === kotId ? { ...k, kot: { ...k.kot, status: newStatus, updatedAt: Date.now() } } : k)
      );

      setNotification({ type: 'success', message: `KOT status updated to ${newStatus}` });
      setTimeout(() => setNotification(null), 2500);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to update KOT status' });
    }
  };

  // Push Running KOT to finalized Bill
  const handlePushKotToBilling = async (kot: Kot, items: KotItem[]) => {
    try {
      setSubmitting(true);
      const effectiveItems = (items && items.length > 0) ? items : (kot.items || []);

      if (effectiveItems.length === 0) {
        setNotification({ type: 'error', message: 'Cannot bill an empty KOT.' });
        return;
      }

      const result = await BillingEngine.convertKotToBill(
        kot,
        effectiveItems,
        effectiveItems[0]?.priceType || priceType,
        currentUser?.uid || 'cashier_1',
        currentUser?.name || 'Cashier'
      );

      // Local state update
      setRunningKots((prev) => 
        prev.map((k) => k.kot.id === kot.id ? { ...k, kot: { ...k.kot, status: 'BILLED', updatedAt: Date.now() } } : k)
      );

      setBilledReceipt(result);
      PrinterService.printBill(result.bill, result.items, settings);

      setNotification({
        type: 'success',
        message: `KOT ${kot.kotNumber} converted to Bill #${result.bill.billNumber} (Total: ₹${result.bill.grandTotal})!`
      });
      setTimeout(() => setNotification(null), 4500);
    } catch (e: any) {
      console.error('Push to billing error:', e);
      setNotification({ type: 'error', message: e.message || 'Failed to convert KOT to Bill' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filter running KOTs
  const filteredKots = useMemo(() => {
    return runningKots.filter(({ kot }) => {
      if (statusFilter === 'ACTIVE') {
        return kot.status !== 'BILLED' && kot.status !== 'CANCELLED';
      }
      if (statusFilter === 'ALL') return true;
      return kot.status === statusFilter;
    });
  }, [runningKots, statusFilter]);

  // KOTs in current view that can be marked as Completed (active and not already completed)
  const eligibleVisibleKots = useMemo(() => {
    return filteredKots.filter(({ kot }) => 
      kot.status !== 'BILLED' && 
      kot.status !== 'CANCELLED' && 
      kot.status !== 'COMPLETED'
    );
  }, [filteredKots]);

  const isAllEligibleSelected = 
    eligibleVisibleKots.length > 0 && 
    eligibleVisibleKots.every(({ kot }) => selectedKotIds.includes(kot.id));

  const handleToggleSelectKot = (kotId: string) => {
    setSelectedKotIds((prev) => 
      prev.includes(kotId) ? prev.filter((id) => id !== kotId) : [...prev, kotId]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllEligibleSelected) {
      setSelectedKotIds([]);
    } else {
      setSelectedKotIds(eligibleVisibleKots.map(({ kot }) => kot.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedKotIds([]);
  };

  // Bulk mark selected KOTs as Completed simultaneously
  const handleBulkMarkCompleted = async () => {
    if (selectedKotIds.length === 0) return;

    setBulkUpdating(true);
    const now = Date.now();
    const count = selectedKotIds.length;
    const targetIds = [...selectedKotIds];

    try {
      // 1. Batch update in Firestore
      try {
        const batch = writeBatch(db);
        targetIds.forEach((kotId) => {
          batch.update(doc(db, 'kots', kotId), {
            status: 'COMPLETED',
            updatedAt: now
          });
        });
        await batch.commit();
      } catch (dbErr) {
        console.warn('Firestore bulk status update notice:', dbErr);
      }

      // 2. Optimistic local state update
      setRunningKots((prev) =>
        prev.map((k) =>
          targetIds.includes(k.kot.id)
            ? { ...k, kot: { ...k.kot, status: 'COMPLETED', updatedAt: now } }
            : k
        )
      );

      // 3. Clear selection
      setSelectedKotIds([]);

      setNotification({
        type: 'success',
        message: `Marked ${count} Kitchen Order Ticket${count > 1 ? 's' : ''} as Completed!`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (e: any) {
      console.error('Error bulk completing KOTs:', e);
      setNotification({
        type: 'error',
        message: 'Failed to update selected KOTs'
      });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setBulkUpdating(false);
    }
  };

  const getStatusBadge = (status: KotStatus) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'SENT':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'PREPARING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'READY':
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'BILLED':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'CANCELLED':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  const getElapsedTime = (createdAt: number) => {
    const diffMin = Math.floor((Date.now() - createdAt) / (1000 * 60));
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ${diffMin % 60}m ago`;
  };

  return (
    <div className="flex flex-col min-h-full lg:h-full bg-slate-950 text-slate-100 p-2.5 sm:p-4 gap-3 overflow-y-auto lg:overflow-hidden">
      
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-sm">
        <div className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100 leading-none">
              Kitchen Order Tickets (KOT)
            </h2>
            <span className="text-[11px] text-slate-400">
              Live Kitchen Dispatch & Table Order Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setAppendingKot(null);
              setActiveTab('running');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'running'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Running KOTs ({runningKots.filter(k => k.kot.status !== 'BILLED' && k.kot.status !== 'CANCELLED').length})
          </button>

          <button
            onClick={() => {
              setAppendingKot(null);
              setSelectedItems([]);
              setActiveTab('create');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'create' && !appendingKot
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            New KOT
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 shadow-md animate-in fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-200'
            : 'bg-red-950/90 border border-red-500/40 text-red-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* TAB 1: RUNNING KOTS VIEW */}
      {activeTab === 'running' && (
        <div className="flex flex-col flex-1 gap-3 overflow-hidden">
          
          {/* Status Filter Bar & Select All Control */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              <span className="text-slate-400 font-bold px-2 flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5 text-amber-400" /> Filter:
              </span>
              {[
                { id: 'ACTIVE', label: 'Active Kitchen' },
                { id: 'ALL', label: 'All KOTs' },
                { id: 'OPEN', label: 'Open' },
                { id: 'SENT', label: 'Sent' },
                { id: 'PREPARING', label: 'Preparing' },
                { id: 'READY', label: 'Ready' },
                { id: 'COMPLETED', label: 'Completed' },
                { id: 'BILLED', label: 'Billed' },
                { id: 'CANCELLED', label: 'Cancelled' }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 ${
                    statusFilter === st.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Select All Toggle for active KOTs */}
            {eligibleVisibleKots.length > 0 && (
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isAllEligibleSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                  }`}
                  title="Select or deselect all active kitchen orders in view"
                >
                  {isAllEligibleSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span>{isAllEligibleSelected ? 'Deselect All' : `Select All (${eligibleVisibleKots.length})`}</span>
                </button>
              </div>
            )}
          </div>

          {/* Multi-Select Bulk Action Bar for Kitchen Staff */}
          {selectedKotIds.length > 0 && (
            <div className="bg-emerald-950/90 border-2 border-emerald-500/80 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xl shadow-emerald-950/50 animate-in fade-in slide-in-from-top-2 duration-150 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-black text-sm shadow-xs">
                  {selectedKotIds.length}
                </span>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-emerald-400" />
                    <span>{selectedKotIds.length} {selectedKotIds.length === 1 ? 'KOT' : 'KOTs'} Selected</span>
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    Kitchen staff bulk dispatch: mark multiple orders as Completed simultaneously
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  Cancel Selection
                </button>
                <button
                  type="button"
                  onClick={handleBulkMarkCompleted}
                  disabled={bulkUpdating}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>{bulkUpdating ? 'Marking Completed...' : `Mark Completed (${selectedKotIds.length})`}</span>
                </button>
              </div>
            </div>
          )}

          {/* Running KOTs Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredKots.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 text-center p-8 space-y-3 bg-slate-900/40 rounded-xl border border-slate-800">
                <ChefHat className="w-14 h-14 text-slate-700 stroke-1" />
                <div>
                  <p className="font-bold text-sm text-slate-400">No Kitchen Orders Found</p>
                  <p className="text-xs text-slate-600 max-w-sm mt-1">
                    Click <b className="text-emerald-400">"New KOT"</b> in the top bar to dispatch an order ticket directly to the kitchen.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Create First KOT
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredKots.map(({ kot, items }) => {
                  const effectiveItems = (items && items.length > 0) ? items : (kot.items || []);
                  const totalItemCount = effectiveItems.reduce((acc, i) => acc + i.quantity, 0);
                  const isSelected = selectedKotIds.includes(kot.id);

                  return (
                    <div
                      key={kot.id}
                      className={`bg-slate-900 border rounded-xl p-3.5 flex flex-col justify-between shadow-md space-y-3 transition-all ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/80 bg-slate-900/95 shadow-emerald-950/40'
                          : kot.status === 'READY' || kot.status === 'COMPLETED'
                          ? 'border-emerald-500/60 shadow-emerald-950/20' 
                          : kot.status === 'PREPARING'
                          ? 'border-amber-500/50'
                          : kot.status === 'BILLED'
                          ? 'border-slate-800 opacity-75'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-2.5">
                          {/* Kitchen multi-select checkbox */}
                          {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectKot(kot.id);
                              }}
                              className={`mt-0.5 p-1 rounded-md border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-xs'
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                              }`}
                              title={isSelected ? "Deselect this KOT" : "Select this KOT for bulk completion"}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base font-black text-amber-400">
                                {kot.kotNumber}
                              </span>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(kot.status)}`}>
                                {kot.status}
                              </span>
                            </div>

                            <div className="text-xs text-slate-300 font-medium mt-1 flex items-center gap-2">
                              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-700 font-bold text-amber-300">
                                {kot.tableNumber || 'Take Away'}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {kot.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400 font-mono space-y-0.5">
                          <div className="text-slate-300 font-medium flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            {getElapsedTime(kot.createdAt)}
                          </div>
                          <div>By: {kot.waiterName || 'Staff'}</div>
                        </div>
                      </div>

                      {/* Items List Table */}
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-2 text-xs font-mono max-h-44 overflow-y-auto">
                        <div className="flex justify-between text-[10px] text-slate-500 font-sans uppercase font-bold border-b border-slate-800 pb-1">
                          <span>Items ({totalItemCount})</span>
                          <span>Qty</span>
                        </div>
                        {effectiveItems.map((itm, idx) => (
                          <div key={idx} className="flex justify-between items-start text-slate-200 border-b border-slate-900/60 pb-1 last:border-0 last:pb-0">
                            <div>
                              <span className="font-semibold text-slate-200">{idx + 1}. {itm.itemName}</span>
                              {itm.notes && (
                                <span className="text-[10px] text-amber-400 block font-sans italic pl-3">
                                  ⚡ {itm.notes}
                                </span>
                              )}
                            </div>
                            <span className="font-black text-amber-400 text-sm pl-2 shrink-0">
                              × {itm.quantity}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Status Workflow Progress Controls */}
                      {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                        <div className="flex items-center gap-1.5 pt-1">
                          {kot.status === 'OPEN' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateKotStatus(kot.id, 'PREPARING')}
                                className="flex-1 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Flame className="w-3.5 h-3.5" /> Start Preparing
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateKotStatus(kot.id, 'COMPLETED')}
                                className="py-1.5 px-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                title="Directly mark this KOT as Completed"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Done
                              </button>
                            </>
                          )}

                          {(kot.status === 'PREPARING' || kot.status === 'SENT') && (
                            <button
                              type="button"
                              onClick={() => handleUpdateKotStatus(kot.id, 'COMPLETED')}
                              className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
                            </button>
                          )}

                          {(kot.status === 'READY' || kot.status === 'COMPLETED') && (
                            <div className="flex-1 py-1 px-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded text-center text-[11px] font-bold flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>✓ Completed / Ready</span>
                            </div>
                          )}

                          {/* Append Items Button */}
                          <button
                            type="button"
                            onClick={() => handleStartAppendToKot(kot)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 flex items-center gap-1 cursor-pointer"
                            title="Add more items to this running table KOT"
                          >
                            <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
                            <span>+ Items</span>
                          </button>
                        </div>
                      )}

                      {/* Action Footer Bar */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                        
                        {/* Status Select dropdown */}
                        {kot.status !== 'BILLED' && (
                          <select
                            value={kot.status}
                            onChange={(e) => handleUpdateKotStatus(kot.id, e.target.value as KotStatus)}
                            className="bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700 rounded px-2 py-1 focus:outline-none"
                          >
                            <option value="OPEN">Status: OPEN</option>
                            <option value="SENT">Status: SENT</option>
                            <option value="PREPARING">Status: PREPARING</option>
                            <option value="READY">Status: READY</option>
                            <option value="COMPLETED">Status: COMPLETED</option>
                            <option value="CANCELLED">CANCEL KOT</option>
                          </select>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          
                          {/* Preview / Print Slip */}
                          <button
                            onClick={() => {
                              setPreviewKotData({ kot, items: effectiveItems });
                              setIsKotModalOpen(true);
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
                            title="Preview / Print Kitchen Ticket"
                          >
                            <Printer className="w-4 h-4 text-amber-400" />
                          </button>

                          {/* Direct Convert to Bill Button */}
                          {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handlePushKotToBilling(kot, effectiveItems)}
                              disabled={submitting}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center gap-1 shadow-md shadow-emerald-600/20 transition-colors cursor-pointer"
                              title="Settle order and convert to finalized Bill"
                            >
                              <span>Bill Now</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: CREATE / APPEND KOT FORM */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden">
          
          {/* Left Column: Menu Catalog & Search (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 gap-3 overflow-hidden">
            
            {/* Quick Code & Search Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              
              {/* Direct Code Input Box */}
              <div className="relative">
                <input
                  ref={itemCodeRef}
                  type="text"
                  placeholder="Type Code (e.g. 101, 201) + Enter"
                  value={itemCodeInput}
                  onChange={(e) => setItemCodeInput(e.target.value)}
                  onKeyDown={handleCodeInputKeyDown}
                  className="w-full bg-slate-950 border-2 border-amber-400 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-300"
                />
              </div>

              {/* Text Search Bar */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                <input
                  type="text"
                  placeholder="Search dish name (e.g. Dosa, Idly, Coffee)..."
                  value={searchItem}
                  onChange={(e) => setSearchItem(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Menu ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 cursor-pointer transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pr-1">
              {filteredMenuItems.map((item) => {
                const price = BillingEngine.getApplicablePrice(item, priceType);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItemToKot(item)}
                    className="p-3 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 text-left transition-all flex flex-col justify-between cursor-pointer group shadow-sm active:scale-98"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.itemCode}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {item.categoryName?.split(' ')[0]}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-slate-100 mt-1.5 line-clamp-2 leading-tight group-hover:text-amber-200">
                        {item.itemName}
                      </h4>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between pt-1.5 border-t border-slate-900">
                      <span className="text-xs font-mono text-emerald-400 font-extrabold">
                        ₹{price}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded flex items-center gap-1 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                        <Plus className="w-3 h-3" /> Add
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Right Column: New KOT Ticket Draft & Controls (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 gap-3 overflow-hidden shadow-xl">
            
            {/* Header / Mode Indicator */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-amber-400" />
                <h3 className="font-black text-sm text-slate-100">
                  {appendingKot ? `Append to ${appendingKot.kotNumber}` : 'New KOT Ticket'}
                </h3>
              </div>

              {appendingKot ? (
                <button
                  onClick={handleCancelAppend}
                  className="text-xs text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel Append
                </button>
              ) : (
                <button
                  onClick={() => setSelectedItems([])}
                  disabled={selectedItems.length === 0}
                  className="text-xs text-slate-400 hover:text-red-400 disabled:opacity-30 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Step 1: Table & Order Type Selection */}
            {!appendingKot && (
              <div className="space-y-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Select Table / Order Type
                  </label>
                  
                  {/* Price Type Toggle */}
                  <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-700 text-[10px]">
                    <button
                      onClick={() => setPriceType('NON_AC')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        priceType === 'NON_AC' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      NON-AC
                    </button>
                    <button
                      onClick={() => setPriceType('AC')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        priceType === 'AC' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      AC
                    </button>
                  </div>
                </div>

                {/* Quick Table Selection Pills */}
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {COMMON_TABLES.map((t) => {
                    const isOccupied = occupiedTables.has(t);
                    const isSelected = tableNumber === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTableNumber(t);
                          if (t === 'Take Away') setOrderType('TAKE_AWAY');
                          else setOrderType('DINE_IN');
                        }}
                        className={`px-2 py-1 rounded text-xs font-mono font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                            : isOccupied
                            ? 'bg-amber-950/60 text-amber-300 border-amber-600/50 hover:bg-amber-900/60'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {isOccupied && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>}
                        <span>{t}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Table Input */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="Custom Table / Location"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as OrderType)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="DINE_IN">Dine In</option>
                    <option value="TAKE_AWAY">Take Away</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Selected KOT Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800 bg-slate-950 p-2.5 rounded-xl border border-slate-800 min-h-[160px] space-y-2">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6 space-y-2">
                  <Utensils className="w-8 h-8 text-slate-700 stroke-1" />
                  <p className="font-semibold text-slate-400">KOT Draft is Empty</p>
                  <p className="text-slate-600 max-w-xs">
                    Select dishes from the left menu or type code above to build kitchen ticket.
                  </p>
                </div>
              ) : (
                selectedItems.map((sel, idx) => (
                  <div key={idx} className="py-2 space-y-1.5 text-xs first:pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          <span className="font-mono text-amber-400 text-[11px] bg-slate-900 px-1 py-0.5 rounded border border-slate-800">
                            {sel.item.itemCode}
                          </span>
                          {sel.item.itemName}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, -1)}
                            className="px-1.5 text-slate-400 hover:text-white font-bold"
                          >
                            -
                          </button>
                          <span className="font-black text-white px-1">{sel.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, 1)}
                            className="px-1.5 text-slate-400 hover:text-white font-bold"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Kitchen Cooking Instruction Chips */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {KITCHEN_NOTES_PRESETS.slice(0, 4).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const newNote = sel.notes ? `${sel.notes}, ${preset}` : preset;
                            handleUpdateItemNote(idx, newNote);
                          }}
                          className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 px-1.5 py-0.5 rounded border border-slate-800 cursor-pointer"
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>

                    {/* Custom Note input */}
                    <input
                      type="text"
                      placeholder="Kitchen instruction (e.g. less oil, extra chutney)..."
                      value={sel.notes || ''}
                      onChange={(e) => handleUpdateItemNote(idx, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-amber-200 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Total Items Summary & Dispatch Buttons */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">TOTAL DISHES TO DISPATCH:</span>
                <span className="font-mono text-sm font-black text-amber-400">
                  {selectedItems.reduce((sum, i) => sum + i.quantity, 0)} Items
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCreateKot(false)}
                  disabled={selectedItems.length === 0 || submitting}
                  className="py-2.5 px-3 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Send className="w-3.5 h-3.5 text-blue-400" />
                  <span>Send KOT Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateKot(true)}
                  disabled={selectedItems.length === 0 || submitting}
                  className="py-2.5 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Send & Print KOT</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Printable Thermal KOT Slip Modal */}
      <ThermalKotModal
        kot={previewKotData?.kot || null}
        items={previewKotData?.items || []}
        settings={settings}
        isOpen={isKotModalOpen}
        onClose={() => setIsKotModalOpen(false)}
      />

      {/* Printable Thermal Receipt Modal (when KOT converted to bill) */}
      <ThermalReceiptModal
        bill={billedReceipt?.bill}
        items={billedReceipt?.items || []}
        settings={settings}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />

    </div>
  );
};
