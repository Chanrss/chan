import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Clock, 
  LogOut, 
  LogIn, 
  UtensilsCrossed, 
  Menu as MenuIcon,
  Receipt,
  Printer,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { getBusinessDate, formatBillNumber } from '../../services/billNumberEngine';
import { getLocalBills } from '../../services/localBillStore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { PrinterStatusService, PrinterHealthCheck } from '../../services/printerStatusService';
import { PrinterTroubleshootModal } from './PrinterTroubleshootModal';

interface HeaderProps {
  settings?: RestaurantSettings;
  onOpenAuth: () => void;
  onToggleSidebar?: () => void;
  onNavigateSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ settings, onOpenAuth, onToggleSidebar, onNavigateSettings }) => {
  const { currentUser, isOnline: authOnline, logout, firebaseUser } = useAuth();
  const [networkOnline, setNetworkOnline] = useState<boolean>(navigator.onLine);
  const [firestoreServerSynced, setFirestoreServerSynced] = useState<boolean>(false);
  const [time, setTime] = useState(new Date());
  const [currentBillNo, setCurrentBillNo] = useState<string>('01');
  const [printerCheck, setPrinterCheck] = useState<PrinterHealthCheck | null>(null);
  const [showPrinterModal, setShowPrinterModal] = useState<boolean>(false);

  // Subscribe to live printer status
  useEffect(() => {
    const unsub = PrinterStatusService.subscribe((check) => {
      setPrinterCheck(check);
    });
    return unsub;
  }, [settings]);

  // Real-time connectivity listener using browser network listeners + Firestore onSnapshot metadata
  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => {
      setNetworkOnline(false);
      setFirestoreServerSynced(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to Firestore metadata changes for deep cloud connectivity verification
    let unsubscribe: (() => void) | null = null;
    try {
      const docRef = doc(db, 'settings', 'restaurant');
      unsubscribe = onSnapshot(
        docRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          // snapshot.metadata.fromCache is false when data was received directly from the Firestore backend server
          const isFromCache = snapshot.metadata.fromCache;
          if (!isFromCache) {
            setFirestoreServerSynced(true);
          }
          if (navigator.onLine) {
            setNetworkOnline(true);
          }
        },
        (error) => {
          // Gracefully handle offline / unavailable errors without breaking or crashing the app
          console.debug('Firestore connectivity snapshot notice (operating in offline/cached mode):', error?.message);
          setFirestoreServerSynced(false);
          // If the device itself is offline, reflect offline state
          if (!navigator.onLine) {
            setNetworkOnline(false);
          }
        }
      );
    } catch (err) {
      console.debug('Failed to attach Firestore connectivity listener:', err);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const isCurrentlyOnline = networkOnline && authOnline !== false;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCurrentBillNo = (): string => {
    try {
      const businessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');
      
      // 1. Check local sequence counter for today
      const localBillKey = `pos_last_bill_${businessDate}`;
      const storedCounter = localStorage.getItem(localBillKey);
      if (storedCounter && parseInt(storedCounter, 10) > 0) {
        return formatBillNumber(parseInt(storedCounter, 10));
      }

      // 2. Check last printed bill in cache
      const lastPrintedRaw = localStorage.getItem('pos_last_printed_bill');
      if (lastPrintedRaw) {
        const parsed = JSON.parse(lastPrintedRaw);
        if (parsed?.bill?.billNumber) {
          return parsed.bill.billNumber;
        }
      }

      // 3. Check locally saved bills
      const localBills = getLocalBills();
      if (localBills.length > 0 && localBills[0].billNumber) {
        return localBills[0].billNumber;
      }
    } catch (err) {
      console.debug('Error getting current bill number:', err);
    }
    return '01';
  };

  useEffect(() => {
    const updateBill = () => {
      setCurrentBillNo(fetchCurrentBillNo());
    };
    updateBill();

    // Listen to local bill updates and print events
    window.addEventListener('pos_bills_updated', updateBill);
    window.addEventListener('pos-bill-printing', updateBill);
    window.addEventListener('storage', updateBill);
    const interval = setInterval(updateBill, 3000);

    return () => {
      window.removeEventListener('pos_bills_updated', updateBill);
      window.removeEventListener('pos-bill-printing', updateBill);
      window.removeEventListener('storage', updateBill);
      clearInterval(interval);
    };
  }, [settings?.businessDayStartHour]);

  const dateString = time.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeString = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <header className="bg-white text-slate-800 border-b border-slate-200 sticky top-0 z-30 shadow-xs w-full max-w-full overflow-hidden text-left flex flex-row items-center justify-between md:grid md:grid-cols-[15rem_1fr]">
      
      {/* Left Column: Branding & Mobile Menu Toggle (Aligned vertically with Sidebar 15rem track) */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 md:border-r md:border-slate-200 min-w-0 h-full">
        {onToggleSidebar && (
          <button 
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 shrink-0 cursor-pointer"
            title="Toggle Menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          {(settings?.logoUrl || DEFAULT_RESTAURANT_LOGO) ? (
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white border-2 border-amber-400/90 shadow-xs flex items-center justify-center p-0.5 shrink-0 transition-transform hover:scale-105 overflow-hidden">
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
          ) : (
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-xs text-white shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 
              style={{ fontFamily: 'Georgia, serif' }}
              className="font-bold text-xs sm:text-base leading-tight tracking-wide text-slate-900 uppercase truncate max-w-[130px] xs:max-w-[180px] sm:max-w-xs md:max-w-none"
            >
              {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
            </h1>
          </div>
        </div>
      </div>

      {/* Right Column: Current Bill No, Online & Offline Status, User Auth (Aligned vertically with Main Content track) */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 shrink-0 overflow-x-auto">
        
        {/* Current Bill No */}
        <div 
          id="header-current-bill-no" 
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 font-mono shadow-2xs shrink-0"
          title={`Current Business Day Bill No: #${currentBillNo}`}
        >
          <Receipt className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-[10px] text-amber-700 uppercase font-bold hidden sm:inline">BILL NO:</span>
          <span className="font-black text-amber-950 font-mono tracking-wide">#{currentBillNo}</span>
        </div>

        {/* Real-time Connectivity Indicator with Visual Dot (Green: Online, Red: Offline) */}
        <div 
          id="header-connectivity-status"
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border shrink-0 transition-all shadow-2xs ${
            isCurrentlyOnline 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
              : 'bg-red-50 text-red-800 border-red-300'
          }`}
          title={
            isCurrentlyOnline 
              ? (firestoreServerSynced 
                  ? 'Cloud Online: Firestore connected & live synced with server' 
                  : 'Network Online: Firestore active (real-time sync enabled)')
              : 'Offline Mode: Operating offline. All transactions saved locally and queued for auto-sync.'
          }
        >
          {/* Visual Dot: Green when Online, Red when Offline */}
          <span 
            id="connectivity-status-dot"
            className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 transition-colors ${
              isCurrentlyOnline 
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)] animate-pulse' 
                : 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.85)] animate-pulse'
            }`} 
          />
          {isCurrentlyOnline ? (
            <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600 shrink-0" />
          )}
        </div>

        {/* Printer Status Badge with 1-click Quick Test & Connection Check */}
        <button
          type="button"
          id="header-printer-status-btn"
          onClick={() => setShowPrinterModal(true)}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border shrink-0 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
            printerCheck?.status === 'OFFLINE'
              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
              : printerCheck?.status === 'MOCK'
              ? 'bg-indigo-50 text-indigo-800 border-indigo-300 hover:bg-indigo-100'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
          }`}
          title={printerCheck?.summary || "Thermal Printer: Ready (Click to check connection or test print)"}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            printerCheck?.status === 'OFFLINE'
              ? 'bg-rose-500 animate-pulse'
              : printerCheck?.status === 'MOCK'
              ? 'bg-indigo-500'
              : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
          }`} />
          <Printer className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${
            printerCheck?.status === 'OFFLINE' ? 'text-rose-600' : 'text-emerald-600'
          }`} />
          <span className="hidden xs:inline font-black tracking-wide">
            {printerCheck?.label || 'PRINTER READY'}
          </span>
          {typeof window !== 'undefined' && window.self !== window.top && (
            <ExternalLink className="w-2.5 h-2.5 text-emerald-700 ml-0.5" />
          )}
        </button>

        {/* User Badge / Account */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-0.5 shrink-0">
          {firebaseUser ? (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div 
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] sm:text-xs font-bold text-white shadow-2xs"
                title={`Signed in as: ${currentUser?.name || currentUser?.email || 'Staff'}`}
              >
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
              <button
                onClick={logout}
                className="p-1 sm:p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Sign In"
            >
              <LogIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden xs:inline">Sign In</span>
            </button>
          )}
        </div>

      </div>

      <PrinterTroubleshootModal
        isOpen={showPrinterModal}
        onClose={() => setShowPrinterModal(false)}
        settings={settings}
        onNavigateSettings={onNavigateSettings}
      />
    </header>
  );
};
