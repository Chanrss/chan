import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw
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
import { BillingEngine } from '../../services/billingEngine';
import { PrinterService } from '../../services/printerService';
import { getBusinessDate, syncBusinessDaySequence } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { saveBillingDraft, getBillingDraft, clearBillingDraft } from '../../services/billingDraftService';

interface PosScreenProps {
  settings?: RestaurantSettings;
}

export const PosScreen: React.FC<PosScreenProps> = ({ settings }) => {
  const { currentUser } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
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
  const [fastRushMode, setFastRushMode] = useState<boolean>(() => localStorage.getItem('pos_fast_rush_mode') !== 'false');
  const [mockPrintMode, setMockPrintMode] = useState<boolean>(() => PrinterService.isMockPrintMode());
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setCategories(cats.filter((c) => c.active !== false));
    });

    const unsubItems = onSnapshot(
      query(collection(db, 'menu_items'), where('active', '==', true)),
      (snapshot) => {
        const items: MenuItem[] = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() } as MenuItem));
        setMenuItems(items);
      }
    );

    return () => {
      unsubCats();
      unsubItems();
    };
  }, []);

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
    const unitPrice = BillingEngine.getApplicablePrice(item, priceType);
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.itemId === item.id && i.priceType === priceType);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          totalPrice: BillingEngine.calculateItemTotal(unitPrice, newQty)
        };
        return updated;
      }
      return [
        ...prev,
        {
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.itemName,
          itemNameTamil: item.itemNameTamil,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
          priceType
        }
      ];
    });
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
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

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setDiscount(0);
    setTableNumber('');
    setAutoSaveStatus('idle');
    clearBillingDraft('pos', currentUser?.uid);
  };

  const handleReprintLastBill = () => {
    if (!lastPrintedBill) return;
    PrinterService.printBill(lastPrintedBill.bill, lastPrintedBill.items, settings, true);
    setSavedBill(lastPrintedBill.bill);
    setSavedBillItems(lastPrintedBill.items);
    setIsReceiptModalOpen(true);
    setNotification({
      type: 'success',
      message: `Reprinting Bill #${lastPrintedBill.bill.billNumber}...`
    });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveBill = async (shouldPrint = true) => {
    if (cart.length === 0) {
      setNotification({ type: 'error', message: 'Cart is empty. Please add items.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSaving(true);
    try {
      // 1. Prepare bill & allocate sequence immediately in < 1ms
      const prepared = await BillingEngine.prepareBill({
        orderType,
        priceType,
        items: cart,
        discount,
        tableNumber: tableNumber.trim() || undefined,
        userId: currentUser?.uid || 'pos_user',
        userName: currentUser?.name || 'Staff',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);
      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });
      try {
        localStorage.setItem('pos_last_printed_bill', JSON.stringify({
          bill: prepared.bill,
          items: prepared.items
        }));
      } catch (e) {}

      // 2. Trigger print dialog immediately within active user gesture
      const isAutoPrintEnabled = settings?.autoPrintOnSave !== false;
      const shouldTriggerPrint = shouldPrint || isAutoPrintEnabled;

      if (shouldTriggerPrint) {
        PrinterService.printBill(prepared.bill, prepared.items, settings, true);
      }

      setNotification({ 
        type: 'success', 
        message: `Bill #${prepared.bill.billNumber} saved & printed (₹${prepared.bill.grandTotal})! Ready for next customer.` 
      });

      // 3. Clear cart immediately
      handleClearCart();
      setTimeout(() => setNotification(null), 4000);

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

  // Fallback menu items & categories if firestore is unseeded
  const effectiveMenuItems = menuItems.length > 0 ? menuItems : DEFAULT_FALLBACK_MENU_ITEMS;
  const effectiveCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  // Filtered menu items
  const filteredItems = effectiveMenuItems.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      !q || 
      item.itemCode.toLowerCase().includes(q) || 
      item.itemName.toLowerCase().includes(q) ||
      (item.categoryName && item.categoryName.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const subtotal = BillingEngine.calculateSubtotal(cart);
  const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);

  // Debounced Auto-save to Firestore & LocalStorage whenever bill-in-progress state changes
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
      } catch (err) {
        console.warn('POS Auto-save error:', err);
        setAutoSaveStatus('idle');
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    cart,
    orderType,
    priceType,
    tableNumber,
    discount,
    subtotal,
    grandTotal,
    currentUser?.uid,
    currentUser?.name
  ]);

  // Synchronous emergency backup on beforeunload (browser refresh or session close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (cart.length > 0) {
        saveBillingDraft({
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
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [
    cart,
    orderType,
    priceType,
    tableNumber,
    discount,
    subtotal,
    grandTotal,
    currentUser?.uid,
    currentUser?.name
  ]);

  return (
    <div className="flex flex-col min-h-full lg:h-full bg-slate-950 text-slate-100 overflow-y-auto lg:overflow-hidden">
      
      {/* Top Banner & Notification */}
      {notification && (
        <div className={`px-4 py-2.5 text-sm flex items-center justify-between shadow-md ${
          notification.type === 'success' 
            ? 'bg-emerald-950/95 text-emerald-200 border-b border-emerald-700/60' 
            : 'bg-red-950/95 text-red-200 border-b border-red-700/60'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span className="font-medium">{notification.message}</span>
          </div>

          {lastPrintedBill && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReprintLastBill}
                className="px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reprint #{lastPrintedBill.bill.billNumber}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Tab Switcher (Catalog vs Cart) */}
      <div className="lg:hidden flex bg-slate-900 border border-slate-800 p-1 rounded-xl shrink-0">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Menu Catalog ({filteredItems.length})</span>
        </button>

        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
            mobileTab === 'cart'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
          {cart.length > 0 && (
            <span className="font-mono text-[11px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-black ml-1">
              ₹{grandTotal}
            </span>
          )}
        </button>
      </div>

      {/* Main Layout: 2 Columns on Desktop, Tabbed on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden relative">
        
        {/* Left Area: Controls, Search, Categories & Product Grid */}
        <div className={`lg:col-span-8 flex flex-col border-r border-slate-800 p-2.5 sm:p-4 gap-2.5 sm:gap-3 overflow-hidden ${
          mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Top Bar: Mode Selectors & Fast Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-slate-800 shrink-0">
            
            {/* Price Type Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setPriceType('NON_AC')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  priceType === 'NON_AC'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                NON-AC
              </button>
              <button
                onClick={() => setPriceType('AC')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  priceType === 'AC'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                AC
              </button>
            </div>

            {/* Order Type Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setOrderType('DINE_IN')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  orderType === 'DINE_IN'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                DINE IN
              </button>
              <button
                onClick={() => {
                  setOrderType('TAKE_AWAY');
                  setTableNumber('');
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  orderType === 'TAKE_AWAY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                TAKE AWAY
              </button>
            </div>

            {/* Search Input */}
            <div className="flex-1 min-w-[140px] relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Item Code or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Categories Horizontal Scrolling Pill List */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
            >
              All ({effectiveMenuItems.length})
            </button>
            {effectiveCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {cat.categoryName}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1 pb-16 lg:pb-0">
            {filteredItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center">
                <Tag className="w-10 h-10 text-slate-700 mb-2" />
                <p className="text-sm font-medium">No menu items found</p>
                <p className="text-xs text-slate-600">Try adjusting your search query or category filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredItems.map((item) => {
                  const currentPrice = BillingEngine.getApplicablePrice(item, priceType);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAddToCart(item)}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between text-left transition-all group shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden active:scale-[0.98]"
                    >
                      {/* Top Code Badge & Image */}
                      <div className="w-full flex justify-between items-start gap-2 mb-1.5">
                        <span className="font-mono font-bold text-xs bg-slate-950 text-amber-400 px-2 py-0.5 rounded border border-slate-800 group-hover:border-amber-500/40">
                          #{item.itemCode}
                        </span>
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.itemName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover border border-slate-800"
                          />
                        )}
                      </div>

                      {/* Item Title */}
                      <div className="my-1">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-100 line-clamp-2 leading-tight group-hover:text-amber-300">
                          {item.itemName}
                        </h4>
                        {item.categoryName && (
                          <span className="text-[10px] text-slate-500 line-clamp-1">
                            {item.categoryName}
                          </span>
                        )}
                      </div>

                      {/* Prices & Add indicator */}
                      <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between w-full">
                        <div>
                          <div className="font-mono text-sm sm:text-base font-extrabold text-emerald-400 leading-tight">
                            ₹{currentPrice}
                          </div>
                          <div className="text-[9.5px] text-slate-500 font-mono">
                            {priceType === 'AC' ? `Non-AC: ₹${item.nonAcPrice}` : `AC: ₹${item.acPrice}`}
                          </div>
                        </div>

                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 group-hover:bg-amber-500 text-amber-400 group-hover:text-slate-950 flex items-center justify-center transition-colors">
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
            <div className="lg:hidden absolute bottom-2 left-3 right-3 z-20">
              <button
                onClick={() => setMobileTab('cart')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl shadow-xl flex items-center justify-between font-bold text-xs transition-all active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-200" />
                  <span>{cart.reduce((s, i) => s + i.quantity, 0)} Items in Cart</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-sm">
                  <span>View Cart & Settle (₹{grandTotal})</span>
                  <span>→</span>
                </div>
              </button>
            </div>
          )}

        </div>

        {/* Right Area: Order Cart & Billing Actions (4 cols) */}
        <div className={`lg:col-span-4 flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden shadow-2xl ${
          mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Cart Header */}
          <div className="p-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-sm text-slate-100">Order Cart</span>
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-blue-300 bg-blue-950/80 border border-blue-800 px-1.5 py-0.5 rounded-full animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                  <span>Saving draft...</span>
                </span>
              )}
              {autoSaveStatus === 'saved' && cart.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded-full" title="Current bill-in-progress is auto-saved to Firestore">
                  <Cloud className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Cloud auto-saved</span>
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {orderType === 'DINE_IN' && (
                <input
                  type="text"
                  placeholder="Table #"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              )}
              <button
                onClick={handleClearCart}
                className="p-1 text-slate-400 hover:text-red-400 rounded"
                title="Clear Cart"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 p-3 overflow-y-auto divide-y divide-slate-800">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-6 space-y-2">
                <ShoppingBag className="w-10 h-10 text-slate-700" />
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs text-slate-600">Select product cards on the left to add to bill.</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-amber-400 bg-slate-950 px-1 rounded">
                        {item.itemCode}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 truncate">{item.itemName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      ₹{item.unitPrice} × {item.quantity} = <b className="text-slate-100">₹{item.totalPrice}</b>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1 bg-slate-950 rounded-lg p-1 border border-slate-800">
                    <button
                      onClick={() => handleUpdateQty(idx, item.quantity - 1)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-bold text-white px-1.5 min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQty(idx, item.quantity + 1)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Delete Item */}
                  <button
                    onClick={() => handleRemoveFromCart(idx)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Summary & POS Actions */}
          <div className="bg-slate-950 border-t border-slate-800 p-4 space-y-3">
            
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-200">₹{subtotal}</span>
              </div>

              <div className="flex justify-between items-center text-slate-400 font-sans">
                <span>Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline font-sans">
                <span className="font-bold text-sm text-slate-200">GRAND TOTAL:</span>
                <span className="font-mono text-2xl font-black text-emerald-400">₹{grandTotal}</span>
              </div>
            </div>

            {/* Action Buttons: Auto-Save & Print */}
            <div className="pt-1">
              <button
                onClick={() => handleSaveBill(true)}
                disabled={cart.length === 0 || saving}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25 cursor-pointer active:scale-[0.99]"
              >
                <Printer className="w-4 h-4" />
                <span>{saving ? 'Saving & Printing...' : 'Print & Settle Bill (Auto Save)'}</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* 80mm Thermal Receipt Preview Modal */}
      <ThermalReceiptModal
        bill={savedBill}
        items={savedBillItems}
        settings={settings}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />

    </div>
  );
};
