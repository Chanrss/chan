import React from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  Utensils, 
  Boxes, 
  BarChart3, 
  Users, 
  Settings,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { X } from 'lucide-react';

export type NavTab = 
  | 'dashboard' 
  | 'direct-billing' 
  | 'pos' 
  | 'kot' 
  | 'reprint' 
  | 'menu' 
  | 'inventory' 
  | 'reports' 
  | 'users' 
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  settings?: RestaurantSettings;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onSelectTab, 
  isOpenMobile, 
  onCloseMobile,
  settings
}) => {
  const { hasPermission, isOwner, isManager, isWaiter } = useAuth();

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: hasPermission('dashboard.view') || isOwner || isManager
    },
    {
      id: 'direct-billing' as NavTab,
      label: 'Direct Billing',
      badge: 'Fast',
      icon: Zap,
      show: hasPermission('billing.create') || isOwner || isManager
    },
    {
      id: 'pos' as NavTab,
      label: 'POS Screen',
      icon: ShoppingBag,
      show: hasPermission('billing.create') || isOwner || isManager || isWaiter
    },
    {
      id: 'kot' as NavTab,
      label: 'KOT Orders',
      icon: ChefHat,
      show: hasPermission('kot.create') || hasPermission('kot.view') || isOwner || isManager || isWaiter
    },
    {
      id: 'reprint' as NavTab,
      label: 'Bills & Reprint',
      icon: Receipt,
      show: hasPermission('billing.reprint') || isOwner || isManager
    },
    {
      id: 'menu' as NavTab,
      label: 'Menu Items',
      icon: Utensils,
      show: hasPermission('menu.view') || isOwner || isManager
    },
    {
      id: 'inventory' as NavTab,
      label: 'Inventory',
      icon: Boxes,
      show: hasPermission('inventory.view') || isOwner || isManager
    },
    {
      id: 'reports' as NavTab,
      label: 'Reports',
      icon: BarChart3,
      show: hasPermission('reports.view') || isOwner || isManager
    },
    {
      id: 'users' as NavTab,
      label: 'Users & Roles',
      icon: Users,
      show: isOwner || hasPermission('users.manage')
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings,
      show: isOwner || hasPermission('settings.manage')
    }
  ];

  const handleSelect = (id: NavTab) => {
    onSelectTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Navigation */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 md:w-full bg-white text-slate-700 flex flex-col border-r border-slate-200 transition-transform duration-200 ease-in-out shadow-xs ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Mobile Header with Official Logo */}
        <div className="md:hidden flex items-center justify-between p-3.5 border-b border-slate-200 bg-amber-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white border border-amber-400 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
              <img 
                src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
                alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'} 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
                }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-xs uppercase tracking-wide text-slate-900 truncate">
                {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
              </h2>
              {settings?.restaurantNameTamil && (
                <p className="text-[10px] text-amber-700 font-bold truncate">
                  {settings.restaurantNameTamil}
                </p>
              )}
            </div>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navItems.filter(item => item.show).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/20'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-amber-600'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
