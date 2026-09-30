import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Printer, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle,
  Tag,
  Grid,
  Filter,
  Zap,
  Cloud,
  RefreshCw,
  Eye,
  Utensils,
  CreditCard,
  Banknote,
  QrCode
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  CartItem, 
  Category, 
  MenuItem, 
  OrderType, 
  PriceType, 
  RestaurantSettings, 
  Bill, 
  BillItem 
} from '../../types';
import { safeStorage } from '../../utils/safeStorage';
import { BillingEngine } from '../../services/billingEngine';
import { PrinterService } from '../../services/printerService';
import { getBusinessDate, syncBusinessDaySequence } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { saveBillingDraft, getBillingDraft, clearBillingDraft } from '../../services/billingDraftService';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { 
  filterPosMenuItems, 
  getPosCategoryDishCount, 
  isDinnerCategory, 
  isTiffinCategory, 
  isLunchCategory, 
  isServicePeriodCategory, 
  isDosaItem, 
  isIdlyItem, 
  CONSOLIDATED_POS_CATEGORIES, 
  ServicePeriod 
} from '../../utils/menuItemHelpers';

interface PosScreenProps {
  settings?: RestaurantSettings;
}

export const PosScreen: React.FC<PosScreenProps> = ({ settings }) => {
  const { currentUser } = useAuth();

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const stored = localStorage.getItem('pos_local_categories');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_CATEGORIES;
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      const stored = localStorage.getItem('pos_local_menu_items');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_FALLBACK_MENU_ITEMS;
  });

  const [activeServicePeriod, setActiveServicePeriod] = useState<ServicePeriod>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);
  const autoSaveTimerRef = useRef<any>(null);
  const [lastPrintedBill, setLastPrintedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(null);
  const [fastRushMode, setFastRushMode] = useState<boolean>(() => safeStorage.getItem('pos_fast_rush_mode') !== 'false');
  const [mockPrintMode, setMockPrintMode] = useState<boolean>(() => PrinterService.isMockPrintMode());
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ index: number; name: string } | null>(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  // Saved receipt preview
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [savedBillItems, setSavedBillItems] = useState<BillItem[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Fetch Categories and Menu Items
  useEffect(() => {
    const bDate = getBusinessDate(settings?.businessDayStart || '04:00');
    syncBusinessDaySequence(bDate);

    const unsubCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((doc) => cats.push({ id: doc.id, ...doc.data() } as Category));
      const activeCats = cats.filter((c) => c.active !== false).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setCategories(activeCats);
      localStorage.setItem('pos_local_categories', JSON.stringify(activeCats));
    }, (err) => {
      console.warn('Categories Firestore notice:', err?.message || err);
    });

    const unsubItems = onSnapshot(
      query(collection(db, 'menu_items'), where('active', '==', true)),
      (snapshot) => {
        const items: MenuItem[] = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() } as MenuItem));
        setMenuItems(items);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(items));
      },
      (err) => {
        console.warn('Menu items Firestore notice:', err?.message || err);
      }
    );

    return () => {
      unsubCats();
      unsubItems();
    };
  }, [settings?.businessDayStart]);

  // Restore in-progress draft from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreDraft = async () => {
      try {
        const draft = await getBillingDraft('pos', currentUser?.uid);
        if (draft && isMounted && draft.items && draft.items.length > 0) {
          setCart(draft.items);
          if (draft.orderType) setOrderType(draft.orderType);
          if (draft.priceType) setPriceType(draft.priceType);
          if (draft.tableNumber) setTableNumber(draft.tableNumber);
          if (draft.discount !== undefined) setDiscount(draft.discount);
          setAutoSaveStatus('saved');
          setNotification({
            type: 'success',
            message: `Restored ${draft.items.length} bill-in-progress item${draft.items.length > 1 ? 's' : ''} from cloud auto-save draft.`
          });
          setTimeout(() => setNotification(null), 4000);
        }
      } catch (err) {
        console.warn('POS Draft restoration notice:', err);
      } finally {
        if (isMounted) {
          setTimeout(() => {
            isInitialMount.current = false;
          }, 400);
        }
      }
    };

    restoreDraft();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  const handleAddToCart = (item: MenuItem) => {
    const applicablePrice = BillingEngine.getApplicablePrice(item, priceType);
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.itemId === item.id && i.priceType === priceType);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          totalPrice: BillingEngine.calculateItemTotal(applicablePrice, newQty)
        };
        return updated;
      }
      const newItem: CartItem = {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        itemNameTamil: item.itemNameTamil,
        quantity: 1,
        unitPrice: applicablePrice,
        totalPrice: applicablePrice,
        priceType
      };
      return [...prev, newItem];
    });
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      const targetItem = cart[index];
      if (targetItem) {
        setDeleteConfirmItem({ index, name: targetItem.itemName });
      }
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: newQty,
        totalPrice: BillingEngine.calculateItemTotal(updated[index].unitPrice, newQty)
      };
      return updated;
    });
  };

  const handleRequestRemoveFromCart = (index: number) => {
    const targetItem = cart[index];
    if (targetItem) {
      setDeleteConfirmItem({ index, name: targetItem.itemName });
    }
  };

  const handleConfirmRemoveItem = () => {
    if (deleteConfirmItem !== null) {
      const idx = deleteConfirmItem.index;
      setCart((prev) => prev.filter((_, i) => i !== idx));
      setDeleteConfirmItem(null);
    }
  };

  const handleRequestClearCart = () => {
    if (cart.length > 0) {
      setShowClearCartConfirm(true);
    }
  };

  const handleConfirmClearCart = () => {
    setCart([]);
    setDiscount(0);
    setTableNumber('');
    setAutoSaveStatus('idle');
    clearBillingDraft('pos', currentUser?.uid);
    setShowClearCartConfirm(false);
  };

  const handleReprintLastBill = () => {
    if (!lastPrintedBill) return;
    PrinterService.printBill(lastPrintedBill.bill, lastPrintedBill.items, settings, true);
    setNotification({
      type: 'success',
      message: `Reprinted Bill #${lastPrintedBill.bill.billNumber} successfully.`
    });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveAndPrint = async (paymentMode: 'CASH' | 'CARD' | 'UPI' = 'CASH') => {
    if (cart.length === 0) {
      setNotification({ type: 'error', message: 'Cart is empty. Please add items first.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSaving(true);
    try {
      // 1. Prepare bill with local sequential counter & billing engine
      const prepared = await BillingEngine.prepareBill({
        items: cart,
        orderType,
        priceType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        discount,
        userId: currentUser?.uid || 'pos_user',
        userName: currentUser?.name || currentUser?.username || 'Staff Cashier',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      prepared.bill.paymentMethod = paymentMode;

      // 2. Clear in-progress draft immediately
      clearBillingDraft('pos', currentUser?.uid);
      setAutoSaveStatus('idle');

      // 3. Direct Thermal Print via Chrome Kiosk Printing
      PrinterService.printBill(prepared.bill, prepared.items, settings, true);

      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });
      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);

      setNotification({
        type: 'success',
        message: `Bill #${prepared.bill.billNumber} Saved & Printed (₹${prepared.bill.grandTotal})`
      });
      setTimeout(() => setNotification(null), 4000);

      // Reset cart for next customer
      setCart([]);
      setDiscount(0);
      setTableNumber('');
      setMobileTab('catalog');

      // 4. Persist to Firestore in background without blocking printer
      BillingEngine.persistBillAsync(
        prepared.bill,
        prepared.items,
        undefined,
        currentUser?.uid || 'pos_user'
      ).catch((err) => {
        console.warn('POS background persist notice:', err);
      });
    } catch (err: any) {
      console.error('POS Bill Error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to save bill' });
    } finally {
      setSaving(false);
    }
  };

  // Active category object and service period view detection
  const currentCategoryObj = useMemo(() => {
    return categories.find((c) => c.id === selectedCategory);
  }, [categories, selectedCategory]);

  const isCurrentServicePeriod = useMemo(() => {
    return isServicePeriodCategory(currentCategoryObj) || activeServicePeriod !== 'ALL';
  }, [currentCategoryObj, activeServicePeriod]);

  // Filtered menu items for POS: 'Dosa' and 'Idly' items are globally available across all service periods
  const filteredItems = useMemo(() => {
    return filterPosMenuItems(menuItems, selectedCategory, categories, searchQuery, activeServicePeriod);
  }, [menuItems, selectedCategory, categories, searchQuery, activeServicePeriod]);

  const subtotal = BillingEngine.calculateSubtotal(cart);
  const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);

  // Debounced Auto-save to Firestore & LocalStorage
  useEffect(() => {
    if (isInitialMount.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (cart.length === 0) {
      setAutoSaveStatus('idle');
      clearBillingDraft('pos', currentUser?.uid);
      return;
    }

    setAutoSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveBillingDraft({
          screen: 'pos',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount,
          subtotal,
          grandTotal
        });
        setAutoSaveStatus('saved');
      } catch (e) {
        console.warn('Auto-save draft note:', e);
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [cart, orderType, priceType, tableNumber, discount, subtotal, grandTotal, currentUser?.uid, currentUser?.name]);

  return (
    <div className="flex flex-col min-h-full bg-slate-100/90 text-slate-800 p-2 sm:p-3.5 gap-2.5 overflow-y-auto pb-24 md:pb-6 font-sans">
      
      {/* Top Banner & Header Bar */}
      <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2.5 gap-2 shadow-xs shrink-0">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-2xs shrink-0">
            <ShoppingBag className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-sm sm:text-base tracking-tight text-slate-900 uppercase leading-none">
                Touch POS Terminal
              </h2>
              {autoSaveStatus === 'saved' && cart.length > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Cloud className="w-3 h-3 text-emerald-600" />
                  Auto-saved
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Touch-optimized catalog billing and instant thermal printing
            </p>
          </div>
        </div>

        {lastPrintedBill && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSavedBill(lastPrintedBill.bill);
                setSavedBillItems(lastPrintedBill.items);
                setIsReceiptModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="View on-screen thermal receipt preview"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">View Receipt</span>
            </button>
            <button
              type="button"
              onClick={handleReprintLastBill}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Reprint #{lastPrintedBill.bill.billNumber}</span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs shrink-0 animate-in fade-in ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Mobile Tab Switcher (Catalog vs Cart) */}
      <div className="lg:hidden flex bg-white border border-slate-200 p-1 rounded-xl shrink-0 shadow-2xs">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Dishes Catalog ({filteredItems.length})</span>
        </button>

        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
            mobileTab === 'cart'
              ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
          {cart.length > 0 && (
            <span className="font-mono text-[11px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-black ml-1">
              ₹{grandTotal}
            </span>
          )}
        </button>
      </div>

      {/* Main Layout: 2 Columns on Desktop/Tablet, Tabbed on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
        
        {/* Left Area: Controls, Search, Categories & Product Grid */}
        <div className={`lg:col-span-7 xl:col-span-8 flex flex-col gap-2.5 ${
          mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Top Bar: Mode Selectors & Fast Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs shrink-0">
            
            {/* Shop Brand Logo */}
            <div className="w-8 h-8 rounded-full bg-white border border-amber-400 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden" title={settings?.restaurantName || 'SRI SARAVANA BHAVAN'}>
              <img 
                src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
                alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'} 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
                }}
              />
            </div>

            {/* Price Type Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPriceType('NON_AC')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  priceType === 'NON_AC'
                    ? 'bg-white text-amber-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                NON-AC
              </button>
              <button
                type="button"
                onClick={() => setPriceType('AC')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  priceType === 'AC'
                    ? 'bg-white text-amber-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AC
              </button>
            </div>

            {/* Order Type Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setOrderType('DINE_IN')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  orderType === 'DINE_IN'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                DINE IN
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderType('TAKE_AWAY');
                  setTableNumber('');
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  orderType === 'TAKE_AWAY'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                TAKE AWAY
              </button>
            </div>

            {/* Active Service Period Selector (All periods offer Dosa & Idly globally) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1.5 hidden md:inline">
                Period:
              </span>
              {(['ALL', 'TIFFIN', 'LUNCH', 'DINNER'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => {
                    setActiveServicePeriod(period);
                    // Persistent Dosa & Idly: if user is currently inspecting Dosa or Idly category, keep it selected!
                    if (selectedCategory === 'cat_dosa' || selectedCategory === 'cat_idly') {
                      return;
                    }
                    if (period === 'ALL') {
                      setSelectedCategory('all');
                    } else if (period === 'TIFFIN') {
                      const tCat = categories.find((c) => isTiffinCategory(c));
                      setSelectedCategory(tCat ? tCat.id : 'cat_tiffin');
                    } else if (period === 'LUNCH') {
                      const lCat = categories.find((c) => isLunchCategory(c));
                      setSelectedCategory(lCat ? lCat.id : 'cat_meals');
                    } else if (period === 'DINNER') {
                      const dCat = categories.find((c) => isDinnerCategory(c));
                      setSelectedCategory(dCat ? dCat.id : 'cat_dinner');
                    }
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    activeServicePeriod === period
                      ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={
                    period === 'ALL'
                      ? 'All Service Periods (Full Menu)'
                      : `${period} Service Period (Dosa & Idly globally available)`
                  }
                >
                  {period === 'ALL' ? 'ALL' : period}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex-1 min-w-[140px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Item Code or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Quick Table Selection Bar when DINE_IN */}
          {orderType === 'DINE_IN' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-thin bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                Table:
              </span>
              {['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10', 'T-11', 'T-12'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTableNumber(t)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 border ${
                    tableNumber === t
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Categories Horizontal Scrolling Pill List with Consolidated Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setActiveServicePeriod('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              All ({menuItems.length})
            </button>

            {/* Consolidated Quick Categories: Dosa & Idly */}
            {CONSOLIDATED_POS_CATEGORIES.map((cCat) => {
              const count = getPosCategoryDishCount(cCat, menuItems);
              return (
                <button
                  key={cCat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cCat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                    selectedCategory === cCat.id
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                  title={`${cCat.categoryName} (Globally available across Tiffin, Dinner, Lunch & all periods)`}
                >
                  <span>{cCat.categoryName}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      selectedCategory === cCat.id
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-200 text-amber-950'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Service Period & Menu Categories */}
            {categories.map((cat) => {
              const count = getPosCategoryDishCount(cat, menuItems);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    if (isTiffinCategory(cat)) setActiveServicePeriod('TIFFIN');
                    else if (isDinnerCategory(cat)) setActiveServicePeriod('DINNER');
                    else if (isLunchCategory(cat)) setActiveServicePeriod('LUNCH');
                    else setActiveServicePeriod('ALL');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{cat.categoryName}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      selectedCategory === cat.id
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Product Cards Grid with Smooth Scroll */}
          <div className="flex-1 overflow-y-auto">
            {menuItems.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center">
                <Utensils className="w-10 h-10 text-amber-500 mb-2" />
                <h4 className="font-extrabold text-sm text-slate-900">Menu is Empty</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Add your restaurant's dishes and categories in Menu Management to begin billing.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-xs">
                No dishes match query "{searchQuery}".
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {filteredItems.map((item) => {
                  const currentPrice = BillingEngine.getApplicablePrice(item, priceType);
                  const isGlobalDish = isDosaItem(item) || isIdlyItem(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddToCart(item)}
                      className="bg-white hover:bg-amber-50/50 border border-slate-200 hover:border-amber-400 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between text-left transition-all group shadow-2xs hover:shadow-xs cursor-pointer relative overflow-hidden active:scale-[0.98]"
                    >
                      <div className="w-full flex justify-between items-start gap-1.5 mb-1">
                        <span className="font-mono font-bold text-xs bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                          #{item.itemCode}
                        </span>
                        {isGlobalDish ? (
                          <span 
                            className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded truncate max-w-[105px]" 
                            title="Globally available across all service periods (Tiffin, Lunch, Dinner, etc.)"
                          >
                            All-Day Service
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 truncate max-w-[90px]">
                            {item.categoryName}
                          </span>
                        )}
                      </div>

                      <div className="my-1 min-w-0">
                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 line-clamp-2 leading-tight group-hover:text-amber-900">
                          {item.itemName}
                        </h4>
                        {item.itemNameTamil && (
                          <div className="text-[10px] text-slate-400 line-clamp-1 font-semibold mt-0.5">
                            {item.itemNameTamil}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between w-full">
                        <div>
                          <div className="font-mono text-sm sm:text-base font-black text-slate-900">
                            ₹{currentPrice}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">
                            {priceType === 'AC' ? `Non-AC: ₹${item.nonAcPrice}` : `AC: ₹${item.acPrice}`}
                          </div>
                        </div>

                        <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky Bottom Cart Indicator on Mobile in Catalog view */}
          {cart.length > 0 && mobileTab === 'catalog' && (
            <div className="lg:hidden sticky bottom-2 left-0 right-0 z-20">
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl shadow-lg flex items-center justify-between font-bold text-xs transition-all active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-100" />
                  <span>{cart.reduce((s, i) => s + i.quantity, 0)} Items in Cart</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-sm font-black">
                  <span>View & Settle (₹{grandTotal}) →</span>
                </div>
              </button>
            </div>
          )}

        </div>

        {/* Right Area: Order Cart & Billing Actions (4 or 5 cols) */}
        <div className={`lg:col-span-5 xl:col-span-4 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs ${
          mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Cart Header */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
              <span className="font-extrabold text-sm text-slate-900">Current Order Cart</span>
            </div>
            
            <div className="flex items-center gap-2">
              {orderType === 'DINE_IN' && (
                <input
                  type="text"
                  placeholder="Table #"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-bold"
                />
              )}
              <button
                type="button"
                onClick={handleRequestClearCart}
                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                title="Clear Cart"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 p-3 overflow-y-auto divide-y divide-slate-100 min-h-[220px]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6 space-y-2">
                <ShoppingBag className="w-10 h-10 text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Cart is empty</p>
                <p className="text-xs text-slate-400">Tap dishes on the catalog to add to order.</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-1 rounded">
                        #{item.itemCode}
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate">{item.itemName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      ₹{item.unitPrice} × {item.quantity} = <b className="text-slate-900">₹{item.totalPrice}</b>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, item.quantity - 1)}
                      className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-black text-slate-900 px-1.5 min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, item.quantity + 1)}
                      className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Delete Item */}
                  <button
                    type="button"
                    onClick={() => handleRequestRemoveFromCart(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Summary & Settlement Buttons */}
          <div className="bg-slate-50 border-t border-slate-200 p-3.5 space-y-2.5">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">₹{subtotal}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Discount (₹):</span>
                <input
                  type="number"
                  min={0}
                  value={discount === 0 ? '' : discount}
                  placeholder="0"
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-20 bg-white border border-slate-300 rounded px-2 py-0.5 text-right font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                <span className="font-black text-sm text-slate-900 uppercase">Grand Total:</span>
                <span className="font-mono text-xl font-black text-emerald-700">₹{grandTotal}</span>
              </div>
            </div>

            {/* Quick Settle Payment Buttons */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleSaveAndPrint('CASH')}
                disabled={saving || cart.length === 0}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Banknote className="w-4 h-4" />
                <span>Cash Bill</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveAndPrint('UPI')}
                disabled={saving || cart.length === 0}
                className="py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                <span>UPI / QR</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveAndPrint('CARD')}
                disabled={saving || cart.length === 0}
                className="py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                <span>Card Bill</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* On-screen Thermal Receipt Preview Modal */}
      {isReceiptModalOpen && savedBill && (
        <ThermalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          bill={savedBill}
          items={savedBillItems}
          settings={settings}
        />
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteConfirmItem !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Remove Item?</h3>
                <p className="text-xs text-slate-500">Confirm removing item from current order</p>
              </div>
            </div>
            <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              Are you sure you want to remove <span className="font-bold text-slate-900">"{deleteConfirmItem.name}"</span>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveItem}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {showClearCartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Clear Entire Cart?</h3>
                <p className="text-xs text-slate-500">Reset order and remove all items</p>
              </div>
            </div>
            <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              Are you sure you want to clear all <span className="font-bold text-slate-900">{cart.length} item(s)</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearCartConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCart}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Cart
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
