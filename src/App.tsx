import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { DirectBilling } from './components/billing/DirectBilling';
import { PosScreen } from './components/pos/PosScreen';
import { KotManagement } from './components/kot/KotManagement';
import { BillHistoryReprint } from './components/billing/BillHistoryReprint';
import { MenuManagement } from './components/menu/MenuManagement';
import { InventoryManagement } from './components/inventory/InventoryManagement';
import { ReportsView } from './components/reports/ReportsView';
import { UserManagement } from './components/users/UserManagement';
import { SettingsView } from './components/settings/SettingsView';
import { AuthModal } from './components/auth/AuthModal';
import { PrintingReceiptAnimation } from './components/common/PrintingReceiptAnimation';
import { DailyBackupNotificationToast } from './components/common/DailyBackupNotificationToast';
import { DailyLowStockAlertModal, useDailyLowStockAlert } from './components/inventory/DailyLowStockAlertModal';
import { useAutomatedDailyBackup } from './hooks/useAutomatedDailyBackup';
import { RestaurantSettings } from './types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from './data/defaultLogo';
import { OFFICIAL_LOGO_STORAGE_PATH, OFFICIAL_LOGO_STORAGE_URL } from './services/brandLogoService';
import { Zap, ShoppingBag, ChefHat, Receipt, MoreHorizontal, LayoutDashboard } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, isOwner, isManager, isWaiter } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('direct-billing');
  const [settings, setSettings] = useState<RestaurantSettings | undefined>(undefined);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Automated Daily Backup background manager and notifications
  const { backupToast, dismissToast } = useAutomatedDailyBackup(settings);

  // Daily 8:00 AM Low Stock Alert
  const {
    modalOpen: lowStockModalOpen,
    lowStockItems,
    handleDismiss: handleDismissLowStock,
    handleViewInventory: handleViewInventoryLowStock
  } = useDailyLowStockAlert(() => {
    setActiveTab('inventory');
    setMobileSidebarOpen(false);
  });

  // Subscribe to Restaurant Settings in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'restaurant'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RestaurantSettings;
        // STRICT LOGO PRESERVATION: Use exact original uploaded logo file directly
        // Disregard unreachable remote storage URLs that 404 and fallback to exact original asset
        const rawStorageUrl = data.logoStorageUrl?.trim();
        const rawLogoUrl = data.logoUrl?.trim();
        // Zero-network guarantee: If a custom uploaded data URL is present, use it.
        // Otherwise, fall back to DEFAULT_RESTAURANT_LOGO (the self-contained inline data URL)
        // so that neither subpaths, sandboxes, nor iframe origins cause HTTP 404 broken images.
        const isDataUrl = (rawStorageUrl?.startsWith('data:image/') || rawLogoUrl?.startsWith('data:image/'));
        const updatedLogo = isDataUrl 
          ? (rawStorageUrl?.startsWith('data:image/') ? rawStorageUrl : rawLogoUrl) 
          : DEFAULT_RESTAURANT_LOGO;

        setSettings({
          ...data,
          restaurantName: data.restaurantName || 'SRI SARAVANA BHAVAN',
          restaurantNameTamil: data.restaurantNameTamil || 'ஸ்ரீ சரவண பவன்',
          address: data.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
          phone: data.phone || '7708159933',
          email: data.email || 'srisaravanabhavan57.com',
          gstNumber: data.gstNumber || '',
          logoUrl: updatedLogo,
          logoStoragePath: data.logoStoragePath || OFFICIAL_LOGO_STORAGE_PATH,
          logoStorageUrl: updatedLogo,
          logoProtectedBrandAsset: true,
          monochromeLogoUrl: data.monochromeLogoUrl || data.bwLogoUrl || '',
          receiptHeader: data.receiptHeader || 'SRI SARAVANA BHAVAN',
          receiptFooter: data.receiptFooter || '*** THANK YOU VISIT AGAIN ***',
          businessDayStartHour: data.businessDayStartHour || '04:00',
          billNumberDigits: data.billNumberDigits || 2,
          paperWidth: data.paperWidth || '80mm',
          receiptFontSize: data.receiptFontSize || 11,
          receiptAlignment: 'center', // Top-center alignment
          receiptLogoMaxWidth: (data.receiptLogoMaxWidth && data.receiptLogoMaxWidth >= 60) ? data.receiptLogoMaxWidth : 90,
          receiptLogoMaxHeight: (data.receiptLogoMaxHeight && data.receiptLogoMaxHeight >= 60) ? data.receiptLogoMaxHeight : 90,
          logoDisplay: (data.logoDisplay && data.logoDisplay !== 'watermark') ? data.logoDisplay : 'both',
          watermarkOpacity: data.watermarkOpacity !== undefined ? data.watermarkOpacity : 0.12,
          compactMode: data.compactMode !== undefined ? Boolean(data.compactMode) : true,
          autoPrintOnSave: data.autoPrintOnSave !== undefined ? data.autoPrintOnSave : true,
          skipPrintPreview: data.skipPrintPreview !== undefined ? Boolean(data.skipPrintPreview) : false,
        });
      } else {
        setSettings({
          restaurantName: 'SRI SARAVANA BHAVAN',
          restaurantNameTamil: 'ஸ்ரீ சரவண பவன்',
          address: 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
          phone: '7708159933',
          email: 'srisaravanabhavan57.com',
          gstNumber: '',
          logoUrl: DEFAULT_RESTAURANT_LOGO,
          logoStoragePath: OFFICIAL_LOGO_STORAGE_PATH,
          logoStorageUrl: OFFICIAL_LOGO_STORAGE_URL,
          logoProtectedBrandAsset: true,
          monochromeLogoUrl: '',
          receiptHeader: 'SRI SARAVANA BHAVAN',
          receiptFooter: '*** THANK YOU VISIT AGAIN ***',
          businessDayStartHour: '04:00',
          billNumberDigits: 2,
          paperWidth: '80mm',
          receiptFontSize: 11,
          receiptAlignment: 'center',
          receiptLogoMaxWidth: 90,
          receiptLogoMaxHeight: 90,
          logoDisplay: 'both',
          watermarkOpacity: 0.12,
          compactMode: true,
          autoPrintOnSave: true,
          skipPrintPreview: false
        });
      }
    }, (error) => {
      console.warn('Restaurant settings firestore notice (using defaults):', error?.message || error);
      setSettings({
        restaurantName: 'SRI SARAVANA BHAVAN',
        restaurantNameTamil: 'ஸ்ரீ சரவண பவன்',
        address: 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
        phone: '7708159933',
        email: 'srisaravanabhavan57.com',
        gstNumber: '',
        logoUrl: DEFAULT_RESTAURANT_LOGO,
        logoStoragePath: OFFICIAL_LOGO_STORAGE_PATH,
        logoStorageUrl: OFFICIAL_LOGO_STORAGE_URL,
        logoProtectedBrandAsset: true,
        receiptHeader: 'SRI SARAVANA BHAVAN',
        receiptFooter: '*** THANK YOU VISIT AGAIN ***',
        businessDayStartHour: '04:00',
        billNumberDigits: 2,
        paperWidth: '80mm',
        receiptFontSize: 11,
        receiptAlignment: 'center',
        receiptLogoMaxWidth: 90,
        receiptLogoMaxHeight: 90,
        logoDisplay: 'both',
        watermarkOpacity: 0.12,
        compactMode: true,
        autoPrintOnSave: true,
        skipPrintPreview: false
      });
    });

    return () => unsub();
  }, []);

  // Set default starting tab based on role
  useEffect(() => {
    if (isWaiter) {
      setActiveTab('kot');
    } else {
      setActiveTab('direct-billing');
    }
  }, [currentUser?.roleId]);

  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] w-full bg-slate-100 text-slate-900 overflow-hidden font-sans">
      
      {/* Top Main Navigation App Bar */}
      <Header 
        settings={settings} 
        onOpenAuth={() => setAuthModalOpen(true)}
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        onNavigateSettings={() => setActiveTab('settings')}
      />

      {/* Main Workspace with Standardized Vertical Grid System */}
      <div className="flex-1 flex overflow-hidden relative md:grid md:grid-cols-[15rem_1fr] min-h-0">
        
        {/* Role-gated Sidebar (Column 1: 15rem / 240px) */}
        <Sidebar 
          activeTab={activeTab} 
          settings={settings}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileSidebarOpen(false);
          }}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Dynamic Screen View Area (Column 2: 1fr) */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto relative pb-16 md:pb-0">
          {activeTab === 'dashboard' && (
            <Dashboard 
              settings={settings} 
              onNavigate={(tab) => setActiveTab(tab)} 
            />
          )}

          {activeTab === 'direct-billing' && (
            <DirectBilling settings={settings} />
          )}

          {activeTab === 'pos' && (
            <PosScreen settings={settings} />
          )}

          {activeTab === 'kot' && (
            <KotManagement settings={settings} />
          )}

          {activeTab === 'reprint' && (
            <BillHistoryReprint settings={settings} />
          )}

          {activeTab === 'menu' && (
            <MenuManagement />
          )}

          {activeTab === 'inventory' && (
            <InventoryManagement />
          )}

          {activeTab === 'reports' && (
            <ReportsView settings={settings} />
          )}

          {activeTab === 'users' && (
            <UserManagement />
          )}

          {activeTab === 'settings' && (
            <SettingsView settings={settings} />
          )}
        </main>

      </div>

      {/* Mobile Bottom Quick Navigation Bar (Fast 1-tap switching on phones) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-slate-200 z-30 flex items-center justify-around px-1 shadow-lg">
        <button
          onClick={() => setActiveTab('direct-billing')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors cursor-pointer ${
            activeTab === 'direct-billing' ? 'text-amber-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className={`w-5 h-5 ${activeTab === 'direct-billing' ? 'text-amber-600 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Billing</span>
        </button>

        <button
          onClick={() => setActiveTab('pos')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors cursor-pointer ${
            activeTab === 'pos' ? 'text-amber-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className={`w-5 h-5 ${activeTab === 'pos' ? 'text-amber-600 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">POS</span>
        </button>

        <button
          onClick={() => setActiveTab('kot')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors cursor-pointer ${
            activeTab === 'kot' ? 'text-amber-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ChefHat className={`w-5 h-5 ${activeTab === 'kot' ? 'text-amber-600 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">KOT</span>
        </button>

        <button
          onClick={() => setActiveTab('reprint')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors cursor-pointer ${
            activeTab === 'reprint' ? 'text-amber-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className={`w-5 h-5 ${activeTab === 'reprint' ? 'text-amber-600 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Bills</span>
        </button>

        <button
          onClick={() => setMobileSidebarOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors cursor-pointer ${
            mobileSidebarOpen || (activeTab !== 'direct-billing' && activeTab !== 'pos' && activeTab !== 'kot' && activeTab !== 'reprint')
              ? 'text-amber-600 font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 tracking-tight">More</span>
        </button>
      </nav>

      {/* Global Thermal Receipt Printing Animation */}
      <PrintingReceiptAnimation mode="toast-widget" settings={settings} />

      {/* Daily 8:00 AM Low Stock Alert Modal */}
      <DailyLowStockAlertModal 
        isOpen={lowStockModalOpen}
        lowStockItems={lowStockItems}
        onClose={handleDismissLowStock}
        onViewInventory={handleViewInventoryLowStock}
      />

      {/* Automated Daily Backup Complete Notification Toast */}
      <DailyBackupNotificationToast 
        toast={backupToast}
        onDismiss={dismissToast}
        onNavigateSettings={() => setActiveTab('settings')}
      />

      {/* Firebase Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
      />

    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
