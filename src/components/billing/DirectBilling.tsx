import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Zap, 
  Plus, 
  Trash2, 
  Printer, 
  RotateCcw, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  ArrowRight, 
  Keyboard, 
  Utensils, 
  Check, 
  Sparkles, 
  Database,
  RefreshCw,
  Clock,
  Banknote,
  Percent,
  SlidersHorizontal,
  Leaf,
  Beef,
  Coffee,
  Receipt,
  X,
  Cloud
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CartItem, MenuItem, OrderType, PriceType, RestaurantSettings, Bill, BillItem } from '../../types';
import { BillingEngine } from '../../services/billingEngine';
import { PrinterService } from '../../services/printerService';
import { getBusinessDate, syncBusinessDaySequence } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { collection, onSnapshot, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { useMenuSearch } from '../../hooks/useMenuSearch';
import { saveBillingDraft, getBillingDraft, clearBillingDraft } from '../../services/billingDraftService';
import { ReprintEngine } from '../../services/reprintEngine';

interface DirectBillingProps {
  settings?: RestaurantSettings;
}

interface EnhancedCartItem extends CartItem {
  notes?: string;
}

const QUICK_MODIFIERS = [
  'Less Spicy 🌶️',
  'Extra Spicy 🔥',
  'No Onion/Garlic 🧅',
  'Extra Cheese 🧀',
  'Pack Separately 📦',
  'Crispy / Well Done ✨'
];

export const DirectBilling: React.FC<DirectBillingProps> = ({ settings }) => {
  const { currentUser, bootstrapSystem } = useAuth();

  // Menu items cache
  const [firestoreMenuItems, setFirestoreMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // High-Speed Rush Mode (Default: ON for instant printing and immediate next-customer reset)
  const [fastRushMode, setFastRushMode] = useState<boolean>(() => {
    return localStorage.getItem('pos_fast_rush_mode') !== 'false';
  });
  
  // Hardware vs Mock Print Mode
  const [mockPrintMode, setMockPrintMode] = useState<boolean>(() => {
    return PrinterService.isMockPrintMode();
  });
  const [lastPrintedBill, setLastPrintedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(() => {
    try {
      const cached = localStorage.getItem('pos_last_printed_bill');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });
  const isSavingRef = useRef(false);

  // Prefetch latest completed bill from Firestore if not in local storage so Reprint is immediately ready
  useEffect(() => {
    if (lastPrintedBill) return;
    const fetchLatest = async () => {
      try {
        const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const b = snap.docs[0].data() as Bill;
          const items = await ReprintEngine.getBillItems(b.id);
          setLastPrintedBill({ bill: b, items });
        }
      } catch (err) {
        console.warn('Could not prefetch latest bill for reprint:', err);
      }
    };
    fetchLatest();
  }, []);

  // Billing Flow State
  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [priceTypeChoice, setPriceTypeChoice] = useState<'1' | '2'>('1');
  const [orderTypeChoice, setOrderTypeChoice] = useState<'1' | '2'>('1');
  const [tableNumber, setTableNumber] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [cart, setCart] = useState<EnhancedCartItem[]>([]);
  const [heldBills, setHeldBills] = useState<{ id: string; name: string; items: EnhancedCartItem[]; orderType: OrderType; priceType: PriceType; tableNumber: string }[]>([]);

  // Fast Cash Tender / Return Change
  const [cashTendered, setCashTendered] = useState<string>('');
  
  // Category filter for Quick Dish Grid
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Current Item Entry state
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [quantityInput, setQuantityInput] = useState('1');
  const [inputError, setInputError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; billNumber?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);
  const autoSaveTimerRef = useRef<any>(null);

  // Live Auto-complete & Suggestions State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Modals
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [savedBillItems, setSavedBillItems] = useState<BillItem[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeItemNoteIdx, setActiveItemNoteIdx] = useState<number | null>(null);

  // Active Focused Step Tracker for visual clarity
  const [focusedStep, setFocusedStep] = useState<'PRICE_TYPE' | 'ORDER_TYPE' | 'ITEM_CODE' | 'QUANTITY'>('PRICE_TYPE');

  // Refs for keyboard focus flow
  const priceTypeRef = useRef<HTMLInputElement>(null);
  const orderTypeRef = useRef<HTMLInputElement>(null);
  const itemCodeRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to Menu Items with real-time snapshot and sync sequence
  useEffect(() => {
    const bDate = getBusinessDate(settings?.businessDayStart || '04:00');
    syncBusinessDaySequence(bDate);

    const unsubscribe = onSnapshot(collection(db, 'menu_items'), (snapshot) => {
      const items: MenuItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.active !== false) {
          items.push({ id: doc.id, ...data } as MenuItem);
        }
      });
      setFirestoreMenuItems(items);
      setLoadingMenu(false);
    }, (err) => {
      console.warn('Menu load error:', err);
      setLoadingMenu(false);
    });

    return () => unsubscribe();
  }, [settings?.businessDayStart]);

  // Restore in-progress draft from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreDraft = async () => {
      try {
        const draft = await getBillingDraft('direct_billing', currentUser?.uid);
        if (draft && isMounted && draft.items && draft.items.length > 0) {
          setCart(draft.items);
          if (draft.orderType) {
            setOrderType(draft.orderType);
            setOrderTypeChoice(draft.orderType === 'TAKE_AWAY' ? '2' : '1');
          }
          if (draft.priceType) {
            setPriceType(draft.priceType);
            setPriceTypeChoice(draft.priceType === 'AC' ? '2' : '1');
          }
          if (draft.tableNumber) {
            setTableNumber(draft.tableNumber);
          }
          if (draft.discountPercent !== undefined && draft.discountPercent !== null) {
            setDiscountPercent(draft.discountPercent);
          }
          if (draft.customDiscount !== undefined) {
            setCustomDiscount(draft.customDiscount);
          }
          if (draft.cashTendered) {
            setCashTendered(draft.cashTendered);
          }
          setAutoSaveStatus('saved');
          setNotification({
            type: 'success',
            message: `Restored ${draft.items.length} bill-in-progress item${draft.items.length > 1 ? 's' : ''} from cloud auto-save draft.`
          });
          setTimeout(() => setNotification(null), 4500);
        }
      } catch (err) {
        console.warn('Draft restoration notice:', err);
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

  // Effective Menu Items
  const menuItems = useMemo(() => {
    return firestoreMenuItems.length > 0 ? firestoreMenuItems : DEFAULT_FALLBACK_MENU_ITEMS;
  }, [firestoreMenuItems]);

  // Available categories
  const categories = useMemo(() => {
    const set = new Map<string, string>();
    menuItems.forEach((m) => {
      if (m.categoryId && m.categoryName) {
        set.set(m.categoryId, m.categoryName);
      }
    });
    if (set.size === 0) {
      DEFAULT_CATEGORIES.forEach((c) => set.set(c.id, c.categoryName));
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [menuItems]);

  // Filtered quick dishes
  const filteredQuickDishes = useMemo(() => {
    if (selectedCategory === 'ALL') return menuItems.slice(0, 16);
    return menuItems.filter((m) => m.categoryId === selectedCategory);
  }, [menuItems, selectedCategory]);

  // Memoized debounced local search hook
  const {
    matchingSuggestions,
    exactMatch,
    topMatch
  } = useMenuSearch(menuItems, itemCodeInput, priceType, { debounceMs: 30, maxResults: 8 });

  // Memoized search hook for F4 modal search
  const modalSearchResults = useMenuSearch(menuItems, searchQuery, priceType, { debounceMs: 30, maxResults: 100 });

  // Live exact or close item match update as user types
  useEffect(() => {
    const trimmed = itemCodeInput.trim().toUpperCase();
    if (!trimmed) {
      setSelectedMenuItem(null);
      setInputError(null);
      setShowSuggestions(false);
      return;
    }

    if (exactMatch) {
      setSelectedMenuItem(exactMatch);
      setInputError(null);
    } else if (
      topMatch &&
      (topMatch.itemCode?.toUpperCase().startsWith(trimmed) ||
       topMatch.itemName?.toUpperCase().startsWith(trimmed))
    ) {
      setSelectedMenuItem(topMatch);
      setInputError(null);
    } else {
      setSelectedMenuItem(null);
    }
  }, [itemCodeInput, exactMatch, topMatch]);

  // Autofocus Price Type or Item Code on initial mount
  useEffect(() => {
    if (!loadingMenu) {
      if (priceTypeRef.current) {
        priceTypeRef.current.focus();
        priceTypeRef.current.select();
        setFocusedStep('PRICE_TYPE');
      } else if (itemCodeRef.current) {
        itemCodeRef.current.focus();
        setFocusedStep('ITEM_CODE');
      }
    }
  }, [loadingMenu]);

  // Global Keyboard shortcuts (Ctrl, Ctrl+Enter, Cmd+Enter, F2, F4, F8, F9, F10, ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Step 14: Single [CTRL] press OR [CTRL + ENTER] / [CMD + ENTER] / [CTRL + P] -> Validate, Save, Print & Start New Bill
      const isCtrlKey = e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight';
      const isCtrlEnter = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P');

      if (isCtrlKey || isCtrlEnter) {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          setInputError('Cart is empty. Please add at least 1 item before saving (Ctrl).');
          setTimeout(() => setInputError(null), 3000);
          return;
        }
        handleSaveBill(true, 'CASH');
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        handleNewBill();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setSearchModalOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else if (e.key === 'F7' || (e.altKey && (e.key === 'r' || e.key === 'R'))) {
        // Instant Reprint Shortcut
        e.preventDefault();
        e.stopPropagation();
        handleReprintLastBill();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F9' || e.key === 'F10') {
        e.preventDefault();
        handleSaveBill(true, 'CASH');
      } else if (e.key === 'Escape') {
        if (showSuggestions) {
          setShowSuggestions(false);
        } else if (searchModalOpen) {
          setSearchModalOpen(false);
        } else if (isReceiptModalOpen) {
          setIsReceiptModalOpen(false);
        } else if (activeItemNoteIdx !== null) {
          setActiveItemNoteIdx(null);
        } else if (selectedMenuItem || itemCodeInput) {
          setItemCodeInput('');
          setSelectedMenuItem(null);
          setInputError(null);
          itemCodeRef.current?.focus();
          setFocusedStep('ITEM_CODE');
        } else if (focusedStep === 'QUANTITY') {
          itemCodeRef.current?.focus();
          setFocusedStep('ITEM_CODE');
        } else if (focusedStep === 'ITEM_CODE' && cart.length === 0) {
          orderTypeRef.current?.focus();
          orderTypeRef.current?.select();
          setFocusedStep('ORDER_TYPE');
        } else if (focusedStep === 'ORDER_TYPE') {
          priceTypeRef.current?.focus();
          priceTypeRef.current?.select();
          setFocusedStep('PRICE_TYPE');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, priceType, orderType, tableNumber, customDiscount, discountPercent, searchModalOpen, isReceiptModalOpen, showSuggestions, activeItemNoteIdx, selectedMenuItem, itemCodeInput, focusedStep]);

  // STEP 2: Handle Price Type Input (1 = Non-AC, 2 = AC) -> Press Enter -> Moves to Order Type
  const handlePriceTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl / Ctrl+Enter save trigger
    if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P'))) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving.');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === '1') {
      setPriceTypeChoice('1');
      setPriceType('NON_AC');
    } else if (e.key === '2') {
      setPriceTypeChoice('2');
      setPriceType('AC');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextChoice = priceTypeChoice === '1' ? '2' : '1';
      setPriceTypeChoice(nextChoice);
      setPriceType(nextChoice === '1' ? 'NON_AC' : 'AC');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      const current = priceTypeChoice === '2' ? 'AC' : 'NON_AC';
      setPriceType(current);
      setFocusedStep('ORDER_TYPE');
      setTimeout(() => {
        orderTypeRef.current?.focus();
        orderTypeRef.current?.select();
      }, 30);
    }
  };

  // STEP 3: Handle Order Type Input (1 = Dine In, 2 = Take Away) -> Press Enter -> Moves to Item Code
  const handleOrderTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl / Ctrl+Enter save trigger
    if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P'))) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving.');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === '1') {
      setOrderTypeChoice('1');
      setOrderType('DINE_IN');
    } else if (e.key === '2') {
      setOrderTypeChoice('2');
      setOrderType('TAKE_AWAY');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextChoice = orderTypeChoice === '1' ? '2' : '1';
      setOrderTypeChoice(nextChoice);
      setOrderType(nextChoice === '1' ? 'DINE_IN' : 'TAKE_AWAY');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      const current = orderTypeChoice === '2' ? 'TAKE_AWAY' : 'DINE_IN';
      setOrderType(current);
      setFocusedStep('ITEM_CODE');
      setTimeout(() => {
        itemCodeRef.current?.focus();
      }, 30);
    } else if (e.key === 'Backspace' && !orderTypeChoice) {
      priceTypeRef.current?.focus();
      priceTypeRef.current?.select();
      setFocusedStep('PRICE_TYPE');
    }
  };

  // Select an item from suggestions or direct search and move cursor to Quantity (STEP 8)
  const selectItemAndFocusQty = (item: MenuItem) => {
    setItemCodeInput(item.itemCode);
    setSelectedMenuItem(item);
    setShowSuggestions(false);
    setInputError(null);
    setQuantityInput('1');
    setFocusedStep('QUANTITY');
    setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }, 40);
  };

  // STEP 5: Handle Item Code Input KeyDown -> Enter -> Finds Item & Moves to Quantity (STEP 8)
  const handleItemCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl / Ctrl+Enter save trigger
    if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P'))) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving (Ctrl).');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (matchingSuggestions.length > 0) {
        e.preventDefault();
        setShowSuggestions(true);
        setSelectedSuggestionIndex((prev) => 
          prev < matchingSuggestions.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (matchingSuggestions.length > 0) {
        e.preventDefault();
        setShowSuggestions(true);
        setSelectedSuggestionIndex((prev) => 
          prev > 0 ? prev - 1 : matchingSuggestions.length - 1
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const code = itemCodeInput.trim().toUpperCase();
      if (!code) {
        // If code is empty and cart has items, trigger save or quick notification
        if (cart.length > 0) {
          handleSaveBill(true, 'CASH');
        } else {
          setInputError('Enter an item code or press Ctrl after adding items.');
          setTimeout(() => setInputError(null), 3000);
        }
        return;
      }

      // 1. If suggestions are open and index is valid, pick it
      if (showSuggestions && matchingSuggestions[selectedSuggestionIndex]) {
        selectItemAndFocusQty(matchingSuggestions[selectedSuggestionIndex]);
        return;
      }

      // 2. Look for exact match by code or name
      const found = menuItems.find(
        (m) => m.itemCode?.toUpperCase() === code || m.itemName?.toUpperCase() === code
      );

      if (found) {
        selectItemAndFocusQty(found);
        return;
      }

      // 3. If there's at least one matching suggestion, pick the first one
      if (matchingSuggestions.length > 0) {
        selectItemAndFocusQty(matchingSuggestions[0]);
        return;
      }

      setInputError(`Item code "${code}" not found. Enter a valid code or pick from dishes below.`);
      setSelectedMenuItem(null);
    }
  };

  // STEP 9 & 10: Handle Quantity Enter -> Add to Cart -> Return Focus to Item Code (STEP 12)
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl / Ctrl+Enter save trigger
    if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P'))) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving.');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!selectedMenuItem) {
        itemCodeRef.current?.focus();
        setFocusedStep('ITEM_CODE');
        return;
      }

      const qty = parseInt(quantityInput, 10);
      if (isNaN(qty) || qty <= 0) {
        setInputError('Please enter a valid quantity (1 or more).');
        return;
      }

      const unitPrice = BillingEngine.getApplicablePrice(selectedMenuItem, priceType);
      const newItem: EnhancedCartItem = {
        itemId: selectedMenuItem.id,
        itemCode: selectedMenuItem.itemCode,
        itemName: selectedMenuItem.itemName,
        itemNameTamil: selectedMenuItem.itemNameTamil,
        quantity: qty,
        unitPrice,
        totalPrice: BillingEngine.calculateItemTotal(unitPrice, qty),
        priceType
      };

      // Check if already in cart with same priceType -> update qty
      setCart((prev) => {
        const existingIdx = prev.findIndex((i) => i.itemId === newItem.itemId && i.priceType === newItem.priceType);
        if (existingIdx >= 0) {
          const updated = [...prev];
          const combinedQty = updated[existingIdx].quantity + qty;
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: combinedQty,
            totalPrice: BillingEngine.calculateItemTotal(unitPrice, combinedQty)
          };
          return updated;
        }
        return [...prev, newItem];
      });

      // Clear current item entry and immediately return focus to Item Code (STEP 12)
      setItemCodeInput('');
      setSelectedMenuItem(null);
      setQuantityInput('1');
      setInputError(null);
      setShowSuggestions(false);
      setFocusedStep('ITEM_CODE');
      
      setTimeout(() => {
        itemCodeRef.current?.focus();
      }, 40);
    } else if (e.key === 'Escape' || (e.key === 'Backspace' && !quantityInput)) {
      itemCodeRef.current?.focus();
      itemCodeRef.current?.select();
      setFocusedStep('ITEM_CODE');
    }
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    itemCodeRef.current?.focus();
    setFocusedStep('ITEM_CODE');
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(index);
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

  const handleNewBill = () => {
    setCart([]);
    setItemCodeInput('');
    setSelectedMenuItem(null);
    setQuantityInput('1');
    setDiscountPercent(null);
    setCustomDiscount(0);
    setCashTendered('');
    setTableNumber('');
    setInputError(null);
    setShowSuggestions(false);
    setFocusedStep('PRICE_TYPE');
    setAutoSaveStatus('idle');
    clearBillingDraft('direct_billing', currentUser?.uid);
    setTimeout(() => {
      priceTypeRef.current?.focus();
      priceTypeRef.current?.select();
    }, 40);
  };

  const handleHoldBill = () => {
    if (cart.length === 0) {
      setInputError('Cart is empty. Nothing to hold.');
      return;
    }

    const holdId = `hold_${Date.now()}`;
    const holdName = tableNumber ? `Table ${tableNumber}` : `${orderType} (${cart.length} items)`;
    setHeldBills((prev) => [...prev, { id: holdId, name: holdName, items: [...cart], orderType, priceType, tableNumber }]);
    
    setNotification({ type: 'success', message: `Bill held successfully (${holdName}).` });
    handleNewBill();
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRestoreHeldBill = (holdId: string) => {
    const target = heldBills.find((b) => b.id === holdId);
    if (!target) return;

    setCart(target.items);
    setOrderType(target.orderType);
    setPriceType(target.priceType);
    setTableNumber(target.tableNumber);
    setHeldBills((prev) => prev.filter((b) => b.id !== holdId));
    itemCodeRef.current?.focus();
  };

  const handleSeedMenu = async () => {
    setSeeding(true);
    try {
      await bootstrapSystem();
      setNotification({ type: 'success', message: 'Sample menu items seeded successfully into database!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error('Seeding error:', err);
      setInputError('Failed to seed menu. Please check settings.');
    } finally {
      setSeeding(false);
    }
  };

  const handleReprintLastBill = async () => {
    let billToPrint = lastPrintedBill?.bill;
    let itemsToPrint = lastPrintedBill?.items;

    if (!billToPrint || !itemsToPrint || itemsToPrint.length === 0) {
      try {
        const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          billToPrint = snap.docs[0].data() as Bill;
          itemsToPrint = await ReprintEngine.getBillItems(billToPrint.id);
          setLastPrintedBill({ bill: billToPrint, items: itemsToPrint });
        }
      } catch (err) {
        console.warn('Failed to fetch last bill for reprint:', err);
      }
    }

    if (!billToPrint || !itemsToPrint || itemsToPrint.length === 0) {
      setInputError('No recent bills found to reprint. Please generate a bill first.');
      setTimeout(() => setInputError(null), 3000);
      return;
    }

    const nextCount = (billToPrint.reprintCount || 0) + 1;
    const updatedBill: Bill = { ...billToPrint, reprintCount: nextCount };

    // Record audit reprint in Firestore in background
    ReprintEngine.recordReprint(billToPrint.id, currentUser?.name || 'Cashier').catch((err) => {
      console.warn('Reprint audit log notice:', err);
    });

    setSavedBill(updatedBill);
    setSavedBillItems(itemsToPrint);
    setLastPrintedBill({ bill: updatedBill, items: itemsToPrint });
    try {
      localStorage.setItem('pos_last_printed_bill', JSON.stringify({ bill: updatedBill, items: itemsToPrint }));
    } catch (e) {}

    // Trigger physical hardware print with forceHardware=true
    PrinterService.printBill(updatedBill, itemsToPrint, settings, true);

    // Open on-screen modal preview
    setIsReceiptModalOpen(true);

    setNotification({
      type: 'success',
      message: `Reprinted Bill #${updatedBill.billNumber} (Duplicate #${nextCount})!`,
      billNumber: updatedBill.billNumber
    });
    setTimeout(() => setNotification(null), 4000);
  };

  // Calculations
  const subtotal = useMemo(() => BillingEngine.calculateSubtotal(cart), [cart]);
  
  const effectiveDiscount = useMemo(() => {
    if (discountPercent !== null) {
      return Math.round((subtotal * discountPercent) / 100);
    }
    return customDiscount;
  }, [subtotal, discountPercent, customDiscount]);

  const grandTotal = useMemo(() => BillingEngine.calculateGrandTotal(subtotal, effectiveDiscount), [subtotal, effectiveDiscount]);
  
  const tenderedNum = parseFloat(cashTendered) || 0;
  const returnChange = tenderedNum >= grandTotal ? tenderedNum - grandTotal : 0;
  const currentItemPrice = selectedMenuItem ? BillingEngine.getApplicablePrice(selectedMenuItem, priceType) : 0;

  // Debounced Auto-save to Firestore & LocalStorage whenever bill-in-progress state changes
  useEffect(() => {
    if (isInitialMount.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (cart.length === 0) {
      setAutoSaveStatus('idle');
      clearBillingDraft('direct_billing', currentUser?.uid);
      return;
    }

    setAutoSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveBillingDraft({
          screen: 'direct_billing',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount: effectiveDiscount,
          discountPercent,
          customDiscount,
          cashTendered,
          subtotal,
          grandTotal
        });
        setAutoSaveStatus('saved');
      } catch (err) {
        console.warn('Auto-save error:', err);
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
    effectiveDiscount,
    discountPercent,
    customDiscount,
    cashTendered,
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
          screen: 'direct_billing',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount: effectiveDiscount,
          discountPercent,
          customDiscount,
          cashTendered,
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
    effectiveDiscount,
    discountPercent,
    customDiscount,
    cashTendered,
    subtotal,
    grandTotal,
    currentUser?.uid,
    currentUser?.name
  ]);

  const handleSaveBill = async (andPrint = true, paymentMode: 'CASH' | 'UPI' | 'CARD' = 'CASH') => {
    if (isSavingRef.current) return;
    if (cart.length === 0) {
      setInputError('Cart is empty. Please add items before saving (Ctrl).');
      setTimeout(() => setInputError(null), 3000);
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    setInputError(null);

    try {
      // 1. Prepare bill & sequential numbering immediately
      const prepared = await BillingEngine.prepareBill({
        items: cart.map(c => ({
          ...c,
          itemName: c.notes ? `${c.itemName} (${c.notes})` : c.itemName
        })),
        orderType,
        priceType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        discount: effectiveDiscount,
        userId: currentUser?.uid || 'cashier_1',
        userName: currentUser?.name || 'Cashier',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      if (paymentMode === 'UPI') {
        prepared.bill.transactionId = `UPI-${Date.now().toString().slice(-6)}`;
      }

      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);
      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });

      // Cache in localStorage for instant reprint even across tab reload
      try {
        localStorage.setItem('pos_last_printed_bill', JSON.stringify({
          bill: prepared.bill,
          items: prepared.items
        }));
      } catch (e) {}

      // 2. Trigger browser print immediately within the active user gesture
      const isAutoPrintEnabled = settings?.autoPrintOnSave !== false;
      const shouldTriggerPrint = andPrint || isAutoPrintEnabled;

      if (shouldTriggerPrint) {
        PrinterService.printBill(prepared.bill, prepared.items, settings, true);
      }

      setNotification({ 
        type: 'success', 
        message: `Bill #${prepared.bill.billNumber} saved & printed (₹${prepared.bill.grandTotal} via ${paymentMode})!`,
        billNumber: prepared.bill.billNumber
      });

      // 3. Reset cart and refocus for next customer
      handleNewBill();
      setTimeout(() => setNotification(null), 4000);

      // 4. Persist bill & items asynchronously to Firestore without blocking the printer
      BillingEngine.persistBillAsync(
        prepared.bill, 
        prepared.items, 
        undefined, 
        currentUser?.uid || 'cashier_1'
      ).catch((persistErr) => {
        console.warn('Background Firestore persist notice (queued in offline cache):', persistErr);
      });

    } catch (err: any) {
      console.error('Failed to prepare or save bill:', err);
      setInputError(err.message || 'Failed to save bill. Please try again.');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  const toggleRushMode = () => {
    const next = !fastRushMode;
    setFastRushMode(next);
    localStorage.setItem('pos_fast_rush_mode', String(next));
  };

  const toggleMockPrintMode = () => {
    const next = !mockPrintMode;
    setMockPrintMode(next);
    PrinterService.setMockPrintMode(next);
    setNotification({
      type: 'success',
      message: next 
        ? 'Printer Testing Mode: Silent Dev Print active.' 
        : 'Hardware Printer Mode: Physical thermal printer active.'
    });
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="flex flex-col min-h-full lg:h-full bg-slate-100/90 text-slate-800 p-2 sm:p-3.5 gap-2.5 overflow-y-auto lg:overflow-hidden font-sans">
      
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 gap-2 text-xs shadow-2xs shrink-0">
        
        {/* Left: App Title */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-2xs">
            <Zap className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-xs sm:text-sm tracking-tight text-slate-900 uppercase leading-none block">Direct Billing</span>
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-600" />
                  <span>Auto-saving draft...</span>
                </span>
              )}
              {autoSaveStatus === 'saved' && cart.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" title="Current bill-in-progress is auto-saved to Firestore">
                  <Cloud className="w-3 h-3 text-emerald-600" />
                  <span>Cloud auto-saved</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {heldBills.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                Held: {heldBills.length}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleReprintLastBill}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Reprint last customer receipt (Shortcut: F7 or Alt+R)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
            <span>
              {lastPrintedBill 
                ? `Reprint #${lastPrintedBill.bill.billNumber} (₹${lastPrintedBill.bill.grandTotal})` 
                : 'Reprint Last Bill [F7]'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleNewBill}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Start new customer bill"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notification.message}</span>
          </div>
          {lastPrintedBill && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleReprintLastBill}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
              >
                Reprint
              </button>
            </div>
          )}
        </div>
      )}

      {inputError && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold shadow-xs animate-in shake shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{inputError}</span>
        </div>
      )}

      {/* Held Bills Bar */}
      {heldBills.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-2 rounded-xl overflow-x-auto text-xs shrink-0">
          <span className="font-bold text-amber-800 shrink-0">Held Bills:</span>
          {heldBills.map((hb) => (
            <button
              key={hb.id}
              onClick={() => handleRestoreHeldBill(hb.id)}
              className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-medium shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{hb.name}</span>
              <span className="text-[10px] bg-amber-200 px-1 rounded font-bold">Restore</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Layout: Top Direct Input Controls + Bottom Live Cart & Settlement */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-0 lg:overflow-hidden">
        
        {/* TOP SECTION: DIRECT BILLING CONTROLS */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-3 shrink-0">
          
          {/* Full-Width Flexbox Billing Input Controls */}
          <div className="flex flex-col md:flex-row flex-wrap xl:flex-nowrap items-stretch md:items-end gap-2.5 w-full">
            
            {/* 1. Price Mode */}
            <div className="w-full sm:w-auto md:w-44 lg:w-48 shrink-0">
              <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                Price Mode
              </label>
              <div className="h-10 flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 gap-1 w-full">
                <input
                  ref={priceTypeRef}
                  type="text"
                  maxLength={1}
                  value={priceTypeChoice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '1' || val === '2') {
                      setPriceTypeChoice(val);
                      setPriceType(val === '1' ? 'NON_AC' : 'AC');
                    }
                  }}
                  onFocus={() => {
                    setFocusedStep('PRICE_TYPE');
                    priceTypeRef.current?.select();
                  }}
                  onKeyDown={handlePriceTypeKeyDown}
                  className="w-7 h-8 bg-white border border-slate-300 rounded text-center font-mono font-bold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shrink-0"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPriceTypeChoice('1');
                    setPriceType('NON_AC');
                    setFocusedStep('ORDER_TYPE');
                    orderTypeRef.current?.focus();
                    orderTypeRef.current?.select();
                  }}
                  className={`flex-1 h-8 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    priceType === 'NON_AC'
                      ? 'bg-white text-amber-700 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non-AC
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPriceTypeChoice('2');
                    setPriceType('AC');
                    setFocusedStep('ORDER_TYPE');
                    orderTypeRef.current?.focus();
                    orderTypeRef.current?.select();
                  }}
                  className={`flex-1 h-8 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    priceType === 'AC'
                      ? 'bg-white text-amber-700 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AC
                </button>
              </div>
            </div>

            {/* 2. Order Type */}
            <div className="w-full sm:w-auto md:w-56 lg:w-60 shrink-0">
              <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                Order Type
              </label>
              <div className="h-10 flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 gap-1 w-full">
                <input
                  ref={orderTypeRef}
                  type="text"
                  maxLength={1}
                  value={orderTypeChoice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '1' || val === '2') {
                      setOrderTypeChoice(val);
                      setOrderType(val === '1' ? 'DINE_IN' : 'TAKE_AWAY');
                    }
                  }}
                  onFocus={() => {
                    setFocusedStep('ORDER_TYPE');
                    orderTypeRef.current?.select();
                  }}
                  onKeyDown={handleOrderTypeKeyDown}
                  className="w-7 h-8 bg-white border border-slate-300 rounded text-center font-mono font-bold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeChoice('1');
                    setOrderType('DINE_IN');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`flex-1 h-8 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    orderType === 'DINE_IN'
                      ? 'bg-white text-blue-700 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Utensils className="w-3 h-3" /> Dine In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeChoice('2');
                    setOrderType('TAKE_AWAY');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`flex-1 h-8 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    orderType === 'TAKE_AWAY'
                      ? 'bg-white text-blue-700 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3 h-3" /> Take Away
                </button>
              </div>
            </div>

            {/* 3. Item Code Input */}
            <div className="w-full sm:w-auto md:w-44 lg:w-48 shrink-0 relative">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-bold text-slate-700">
                  Item Code
                </label>
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-0.5 font-bold cursor-pointer"
                  title="Search Items"
                >
                  <Search className="w-2.5 h-2.5" /> Search
                </button>
              </div>

              <div className="relative h-10 w-full">
                <input
                  ref={itemCodeRef}
                  type="text"
                  value={itemCodeInput}
                  onChange={(e) => {
                    setItemCodeInput(e.target.value);
                    setShowSuggestions(true);
                    setSelectedSuggestionIndex(0);
                  }}
                  onFocus={() => {
                    setFocusedStep('ITEM_CODE');
                    if (itemCodeInput.trim()) setShowSuggestions(true);
                  }}
                  onKeyDown={handleItemCodeKeyDown}
                  placeholder="Code (e.g. 101)"
                  className={`w-full h-10 bg-slate-50 border rounded-lg px-3 text-sm font-mono font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-center tracking-wider ${
                    focusedStep === 'ITEM_CODE' ? 'border-amber-500 ring-2 ring-amber-400/20' : 'border-slate-300'
                  }`}
                  autoComplete="off"
                />

                {itemCodeInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemCodeInput('');
                      setSelectedMenuItem(null);
                      setShowSuggestions(false);
                      itemCodeRef.current?.focus();
                      setFocusedStep('ITEM_CODE');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown Popup */}
              {showSuggestions && matchingSuggestions.length > 0 && (
                <div 
                  ref={suggestionsContainerRef}
                  className="absolute left-0 w-72 sm:w-80 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in"
                >
                  <div className="p-2 bg-slate-50 text-[10px] text-slate-600 font-mono flex justify-between uppercase px-3 border-b border-slate-200">
                    <span>Suggestions</span>
                    <span>{matchingSuggestions.length} found</span>
                  </div>
                  {matchingSuggestions.map((item, idx) => {
                    const price = BillingEngine.getApplicablePrice(item, priceType);
                    const isSelected = idx === selectedSuggestionIndex;
                    return (
                      <div
                        key={item.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItemAndFocusQty(item);
                        }}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50 text-amber-900 font-medium' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="font-mono font-bold text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                            #{item.itemCode}
                          </span>
                          <span className="font-medium text-xs text-slate-900 truncate">{item.itemName}</span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="font-bold text-amber-700 text-xs">₹{price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Selected Item & Rate Display (Full-width expansion via flex-1) */}
            <div className="flex-1 min-w-[220px]">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-bold text-slate-700">
                  Selected Item
                </label>
                {selectedMenuItem && (
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded font-bold">
                    #{selectedMenuItem.itemCode}
                  </span>
                )}
              </div>
              
              <div className={`h-10 rounded-lg px-3 border transition-all flex items-center justify-between gap-2 w-full ${
                selectedMenuItem 
                  ? 'bg-emerald-50/90 border-emerald-300 shadow-2xs' 
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {selectedMenuItem ? (
                  <>
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {selectedMenuItem.itemName}
                      </span>
                      {selectedMenuItem.itemNameTamil && (
                        <span className="text-[11px] text-emerald-800 truncate hidden sm:inline">
                          ({selectedMenuItem.itemNameTamil})
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 font-mono pl-2 border-l border-emerald-200 flex items-center gap-1">
                      <span className="text-base font-black text-emerald-800">
                        ₹{currentItemPrice}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Utensils className="w-3.5 h-3.5 text-slate-300" />
                    <span>Enter code to select item</span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Quantity & Add Button */}
            <div className="w-full sm:w-auto md:w-44 lg:w-48 shrink-0">
              <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                Quantity
              </label>
              <div className="h-10 flex items-center gap-1.5 w-full">
                <input
                  ref={quantityRef}
                  type="number"
                  min="1"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  onFocus={() => setFocusedStep('QUANTITY')}
                  onKeyDown={handleQuantityKeyDown}
                  disabled={!selectedMenuItem}
                  placeholder="1"
                  className={`w-14 h-10 bg-white border rounded-lg text-center font-mono font-bold text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-40 disabled:border-slate-200 ${
                    focusedStep === 'QUANTITY' ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  disabled={!selectedMenuItem}
                  onClick={() => {
                    const evt = { key: 'Enter', preventDefault: () => {} } as any;
                    handleQuantityKeyDown(evt);
                  }}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="Add item to bill"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* DOWN SECTION: LIVE BILL CART & SETTLEMENT */}
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          
          {/* Cart Header */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center">
                <Receipt className="w-3.5 h-3.5 text-amber-700" />
              </div>
              <span className="font-bold text-sm text-slate-900">Customer Bill</span>
              <span className="text-xs text-slate-500 font-mono">
                ({orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} • {priceType})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2.5 py-0.5 rounded-full font-bold border border-slate-200">
                {cart.reduce((s, i) => s + i.quantity, 0)} Items
              </span>

              {cart.length > 0 && (
                <button
                  onClick={handleNewBill}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1 cursor-pointer transition-colors border border-slate-200"
                  title="Clear current cart"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 p-2 sm:p-3 overflow-y-auto min-h-[140px]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6 space-y-2">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-2xs">
                  <Receipt className="w-6 h-6 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">Cart is Empty</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Enter an item code (e.g. <b className="text-amber-700">101</b>, <b className="text-amber-700">102</b>) or select from dishes above.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Mobile View: Compact Cards */}
                <div className="sm:hidden space-y-2 font-sans">
                  {cart.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col gap-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-amber-700 text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              #{item.itemCode}
                            </span>
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {item.itemName}
                            </span>
                          </div>
                          {item.notes && (
                            <span className="text-[10px] text-amber-700 font-medium mt-0.5 block">
                              ⚡ {item.notes}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs font-mono">
                            <button
                              onClick={() => handleUpdateCartQty(idx, item.quantity - 1)}
                              className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer text-sm"
                            >
                              -
                            </button>
                            <span className="font-bold text-slate-900 text-sm min-w-[20px] text-center">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateCartQty(idx, item.quantity + 1)}
                              className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer text-sm"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setActiveItemNoteIdx(idx)}
                            className="text-[10px] text-slate-600 hover:text-amber-800 font-mono flex items-center gap-0.5 cursor-pointer bg-white hover:bg-amber-50 px-2 py-1 rounded-lg border border-slate-200"
                            title="Add Cooking Note"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-amber-600" />
                            <span>{item.notes ? 'Note' : '+ Note'}</span>
                          </button>
                        </div>

                        <div className="text-right font-mono">
                          <span className="text-[11px] text-slate-500 block">₹{item.unitPrice} each</span>
                          <span className="text-sm font-black text-slate-900">₹{item.totalPrice}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: Clean Table */}
                <table className="w-full text-sm text-left hidden sm:table">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-xs tracking-wider bg-slate-50/50">
                      <th className="py-2.5 pl-3 w-12">#</th>
                      <th className="py-2.5 w-20">Code</th>
                      <th className="py-2.5">Item Name</th>
                      <th className="py-2.5 text-center w-36">Quantity</th>
                      <th className="py-2.5 text-right w-24">Rate</th>
                      <th className="py-2.5 text-right w-28">Total</th>
                      <th className="py-2.5 text-center w-14">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {cart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 pl-3 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="py-2.5 font-bold text-amber-700 text-sm">#{item.itemCode}</td>
                        <td className="py-2.5 font-sans">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{item.itemName}</span>
                            <button
                              type="button"
                              onClick={() => setActiveItemNoteIdx(idx)}
                              className="text-[10px] text-slate-500 hover:text-amber-800 font-mono flex items-center gap-0.5 cursor-pointer bg-slate-100 hover:bg-amber-50 px-1.5 py-0.5 rounded border border-slate-200"
                              title="Add Cooking Note"
                            >
                              <SlidersHorizontal className="w-2.5 h-2.5 text-amber-600" />
                              <span>{item.notes ? item.notes : '+ Note'}</span>
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <div className="inline-flex items-center gap-2 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                            <button
                              onClick={() => handleUpdateCartQty(idx, item.quantity - 1)}
                              className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-bold text-slate-900 text-sm min-w-[20px] text-center">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateCartQty(idx, item.quantity + 1)}
                              className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-slate-700 font-medium">₹{item.unitPrice}</td>
                        <td className="py-2.5 text-right font-black text-slate-900 text-base">₹{item.totalPrice}</td>
                        <td className="py-2.5 text-center">
                          <button
                            onClick={() => handleRemoveFromCart(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* Totals & Calculations Section */}
          <div className="bg-slate-50 border-t border-slate-200 p-3 space-y-2.5 shrink-0">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
              
              {/* Subtotal */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex justify-between items-center shadow-2xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</div>
                  <div className="text-xs text-slate-500">{cart.reduce((s, i) => s + i.quantity, 0)} items</div>
                </div>
                <div className="font-mono text-lg font-bold text-slate-800">
                  ₹{subtotal}
                </div>
              </div>

              {/* Discount Details */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex justify-between items-center shadow-2xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Discount</div>
                  <div className="text-xs text-slate-500">
                    {discountPercent !== null ? `${discountPercent}% applied` : 'Custom (₹)'}
                  </div>
                </div>
                {discountPercent !== null ? (
                  <div className="font-mono text-base font-bold text-amber-600">
                    -₹{effectiveDiscount}
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    value={customDiscount === 0 ? '' : customDiscount}
                    onChange={(e) => setCustomDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-right font-mono text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                )}
              </div>

              {/* Net Payable Grand Total */}
              <div className="bg-emerald-600 text-white rounded-xl p-2.5 flex justify-between items-center shadow-md shadow-emerald-600/20">
                <div>
                  <div className="text-[10px] font-bold text-emerald-100 uppercase tracking-wider">Net Payable</div>
                  <div className="text-[10px] text-emerald-100/90 font-mono">
                    {tenderedNum > 0 ? `Change: ₹${returnChange}` : 'Grand Total'}
                  </div>
                </div>
                <div className="font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ₹{grandTotal}
                </div>
              </div>

            </div>

            {/* Settle Action Buttons */}
            <div className="flex gap-2 pt-0.5">
              
              {/* Hold Bill */}
              <button
                type="button"
                onClick={handleHoldBill}
                disabled={cart.length === 0}
                className="py-3 px-4 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
                title="Hold current bill"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Hold Bill</span>
              </button>

              {/* 1-Click Print & Settle */}
              <button
                type="button"
                onClick={() => handleSaveBill(true, 'CASH')}
                disabled={cart.length === 0 || saving}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-black bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 cursor-pointer active:scale-[0.99]"
                title="Save and Print Bill (Ctrl)"
              >
                <Printer className="w-4 h-4 stroke-[2.5]" />
                <span>{saving ? 'Settling & Printing...' : `Save & Print Bill (₹${grandTotal})`}</span>
              </button>

            </div>

          </div>

        </div>

      </div>

      {/* Cooking Note / Modifiers Modal */}
      {activeItemNoteIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Cooking Note: {cart[activeItemNoteIdx]?.itemName}
                </h3>
              </div>
              <button
                onClick={() => setActiveItemNoteIdx(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_MODIFIERS.map((mod) => (
                <button
                  key={mod}
                  onClick={() => {
                    setCart((prev) => {
                      const updated = [...prev];
                      updated[activeItemNoteIdx] = {
                        ...updated[activeItemNoteIdx],
                        notes: mod
                      };
                      return updated;
                    });
                    setActiveItemNoteIdx(null);
                  }}
                  className="p-2 rounded-xl text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 text-left transition-all cursor-pointer"
                >
                  {mod}
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-between">
              <button
                onClick={() => {
                  setCart((prev) => {
                    const updated = [...prev];
                    updated[activeItemNoteIdx] = {
                      ...updated[activeItemNoteIdx],
                      notes: undefined
                    };
                    return updated;
                  });
                  setActiveItemNoteIdx(null);
                }}
                className="text-xs text-red-600 hover:underline cursor-pointer font-medium"
              >
                Clear Note
              </button>
              <button
                onClick={() => setActiveItemNoteIdx(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Search Modal [F4] */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-3.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
              <Search className="w-5 h-5 text-amber-600" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by code, item name, or category..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none font-medium"
              />
              <button
                onClick={() => setSearchModalOpen(false)}
                className="text-xs bg-slate-200 hover:bg-slate-300 px-2.5 py-1 rounded-lg text-slate-700 cursor-pointer font-medium"
              >
                Close [Esc]
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-1 divide-y divide-slate-100">
              {(searchQuery.trim() ? modalSearchResults.matchingSuggestions : menuItems).map((item) => {
                const acP = item.acPrice;
                const nonAcP = item.nonAcPrice;
                const activePrice = BillingEngine.getApplicablePrice(item, priceType);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      selectItemAndFocusQty(item);
                      setSearchModalOpen(false);
                    }}
                    className="p-2.5 rounded-xl hover:bg-amber-50/60 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          #{item.itemCode}
                        </span>
                        <span className="font-medium text-sm text-slate-900">{item.itemName}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{item.categoryName}</span>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="text-slate-900 font-bold">Active ({priceType}): ₹{activePrice}</div>
                      <div className="text-[10px] text-slate-500">Non-AC: ₹{nonAcP} | AC: ₹{acP}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 80mm Thermal Receipt Preview Modal */}
      <ThermalReceiptModal
        bill={savedBill}
        items={savedBillItems}
        settings={settings}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        isReprint={Boolean(savedBill && (savedBill.reprintCount || 0) > 0)}
      />

    </div>
  );
};
