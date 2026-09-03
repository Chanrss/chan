import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Clock, 
  User, 
  ShieldCheck, 
  LogOut, 
  LogIn, 
  UtensilsCrossed, 
  Store, 
  RefreshCw,
  Sparkles,
  Menu as MenuIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings, UserRole } from '../../types';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';

interface HeaderProps {
  settings?: RestaurantSettings;
  onOpenAuth: () => void;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ settings, onOpenAuth, onToggleSidebar }) => {
  const { currentUser, currentRole, isOnline, switchDemoRole, logout, firebaseUser } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const roleColors: Record<string, string> = {
    owner: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
    manager: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200',
    waiter: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
  };

  const userRoleKey = currentUser?.roleId?.toLowerCase() || 'owner';

  return (
    <header className="bg-white text-slate-800 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      
      {/* Left: Branding & Mobile Menu Toggle */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button 
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            title="Toggle Menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5">
          {(settings?.logoUrl || DEFAULT_RESTAURANT_LOGO) ? (
            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-0.5 shadow-xs overflow-hidden">
              <img 
                src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
                alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'} 
                className="max-h-full max-w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-xs text-white">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="font-bold text-sm sm:text-base leading-tight tracking-wide text-slate-900 uppercase">
              {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
            </h1>
          </div>
        </div>
      </div>

      {/* Middle: Live Clock & Date */}
      <div className="hidden lg:flex items-center gap-3 px-3 py-1 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono text-slate-600">
        <Clock className="w-3.5 h-3.5 text-amber-500" />
        <span>
          {time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <span className="text-slate-300">|</span>
        <span className="font-bold text-slate-800">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Right: Online Status, Role Switcher, Auth */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* Online / Offline status */}
        <div 
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isOnline 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
          title={isOnline ? 'Cloud Synced' : 'Offline Mode - Local Persistence Active'}
        >
          {isOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">ONLINE</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-red-500" />
              <span>OFFLINE</span>
            </>
          )}
        </div>

        {/* Quick Role Switcher Dropdown (Seamless Testing & Real Role Simulation) */}
        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 p-0.5">
          <label className="text-[10px] text-slate-500 px-2 font-medium hidden md:block">
            ROLE:
          </label>
          <select
            value={userRoleKey}
            onChange={(e) => switchDemoRole(e.target.value as UserRole)}
            className="bg-transparent text-xs font-semibold text-amber-700 focus:outline-none pr-1 py-1 cursor-pointer"
            title="Switch User Role to test permissions"
          >
            <option value="owner" className="bg-white text-slate-900">👑 OWNER (Full)</option>
            <option value="manager" className="bg-white text-slate-900">💼 MANAGER (No Sales Rev)</option>
            <option value="waiter" className="bg-white text-slate-900">🍽️ WAITER (KOT Only)</option>
          </select>
        </div>

        {/* User Badge / Account */}
        <div className="flex items-center gap-2 pl-1">
          {firebaseUser ? (
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Sign In with Firebase Auth"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Firebase Sign In</span>
            </button>
          )}
        </div>

      </div>

    </header>
  );
};
