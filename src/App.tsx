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
import { RestaurantSettings } from './types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from './data/defaultLogo';
import { Zap, ShoppingBag, ChefHat, Receipt, MoreHorizontal, LayoutDashboard } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, isOwner, isManager, isWaiter } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('direct-billing');
  const [settings, setSettings] = useState<RestaurantSettings | undefined>(undefined);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Subscribe to Restaurant Settings in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'restaurant'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RestaurantSettings;
        setSettings({
          ...data,
          restaurantName: data.restaurantName || 'SRI SARAVANA BHAVAN',
          phone: data.phone || '+91 78100 66035 / 99769 74098',
          email: data.email || 'srisaravanabhavan57.com',
          logoUrl: data.logoUrl || DEFAULT_RESTAURANT_LOGO
        });
      } else {
        setSettings({
          restaurantName: 'SRI SARAVANA BHAVAN',
          address: '104 Grand Avenue, Central Complex',
          phone: '+91 78100 66035 / 99769 74098',
          email: 'srisaravanabhavan57.com',
          logoUrl: DEFAULT_RESTAURANT_LOGO,
          receiptHeader: 'SRI SARAVANA BHAVAN',
          receiptFooter: 'Thank you for visiting! Please visit again.',
          paperWidth: '80mm',
          receiptFontSize: 12,
          autoPrintOnSave: true
        });
      }
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
      />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Role-gated Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileSidebarOpen(false);
          }}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Dynamic Screen View Area with adaptive mobile/tablet scrolling */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto lg:overflow-hidden relative pb-16 md:pb-0">
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
