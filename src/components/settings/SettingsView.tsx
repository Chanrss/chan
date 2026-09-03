import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  Store, 
  Clock, 
  Printer, 
  Sparkles, 
  Save, 
  CheckCircle, 
  AlertCircle, 
  Database,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  Link,
  Flame,
  Coffee,
  Crown,
  Utensils,
  Receipt,
  Type,
  Sliders
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';

interface SettingsViewProps {
  settings?: RestaurantSettings;
  onRefreshSettings?: () => void;
}

// Preset vector logos encoded for instant 1-click preview and zero-latency thermal printing
const SAMPLE_PRESET_LOGOS = [
  {
    id: 'sri_saravana_bhavan',
    name: 'Sri Saravana Bhavan (SSB)',
    icon: Sparkles,
    dataUrl: DEFAULT_RESTAURANT_LOGO
  },
  {
    id: 'royal_crest',
    name: 'Royal Crest',
    icon: Crown,
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80"><path d="M40 55 L160 55 L150 25 L125 40 L100 15 L75 40 L50 25 Z" fill="%23000" stroke="%23000" stroke-width="2"/><circle cx="50" cy="22" r="5" fill="%23000"/><circle cx="100" cy="12" r="6" fill="%23000"/><circle cx="150" cy="22" r="5" fill="%23000"/><text x="100" y="73" font-family="monospace" font-size="12" font-weight="900" text-anchor="middle" letter-spacing="3">ROYAL DINING</text></svg>'
  },
  {
    id: 'south_kalash',
    name: 'Traditional Lamp',
    icon: Flame,
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80"><path d="M100 10 Q108 24 100 32 Q92 24 100 10 Z" fill="%23000"/><path d="M85 36 Q100 30 115 36 L118 48 Q100 52 82 48 Z" fill="%23000"/><rect x="94" y="48" width="12" height="8" fill="%23000"/><rect x="80" y="56" width="40" height="4" rx="2" fill="%23000"/><text x="100" y="74" font-family="monospace" font-size="11" font-weight="900" text-anchor="middle" letter-spacing="2">AUTHENTIC SOUTH</text></svg>'
  },
  {
    id: 'artisan_cafe',
    name: 'Café & Tiffin',
    icon: Coffee,
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80"><path d="M75 32 L125 32 L120 54 Q100 62 80 54 Z" fill="%23000"/><path d="M123 36 Q138 36 138 44 Q138 52 120 52" stroke="%23000" stroke-width="4" fill="none"/><path d="M88 24 Q92 16 88 12 M100 24 Q104 16 100 12 M112 24 Q116 16 112 12" stroke="%23000" stroke-width="2.5" fill="none" stroke-linecap="round"/><line x1="70" y1="62" x2="130" y2="62" stroke="%23000" stroke-width="4" stroke-linecap="round"/><text x="100" y="75" font-family="monospace" font-size="11" font-weight="900" text-anchor="middle" letter-spacing="2">HOT TIFFIN & TEA</text></svg>'
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({ settings: initialSettings, onRefreshSettings }) => {
  const { isOwner, bootstrapSystem } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<RestaurantSettings>({
    restaurantName: 'SRI SARAVANA BHAVAN',
    address: '104 Grand Avenue, Central Complex',
    phone: '+91 78100 66035 / 99769 74098',
    email: 'srisaravanabhavan57.com',
    logoUrl: DEFAULT_RESTAURANT_LOGO,
    receiptHeader: 'SRI SARAVANA BHAVAN',
    receiptFooter: 'Thank you for visiting! Please visit again.',
    businessDayStartHour: '04:00',
    billNumberDigits: 2,
    paperWidth: '80mm',
    receiptFontSize: 12,
    autoPrintOnSave: true,
    updatedAt: Date.now()
  });

  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [logoInputTab, setLogoInputTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (initialSettings) {
      setFormData({
        ...initialSettings,
        restaurantName: initialSettings.restaurantName || 'SRI SARAVANA BHAVAN',
        phone: initialSettings.phone || '+91 78100 66035 / 99769 74098',
        email: initialSettings.email || 'srisaravanabhavan57.com',
        logoUrl: initialSettings.logoUrl || DEFAULT_RESTAURANT_LOGO,
        autoPrintOnSave: initialSettings.autoPrintOnSave !== undefined ? initialSettings.autoPrintOnSave : true,
        receiptFontSize: initialSettings.receiptFontSize !== undefined ? initialSettings.receiptFontSize : (initialSettings.paperWidth === '58mm' ? 10 : 12)
      });
      if (initialSettings.logoUrl) {
        setCustomUrlInput(initialSettings.logoUrl);
      }
    }
  }, [initialSettings]);

  /**
   * Process & downscale uploaded image on the client side into high-contrast thermal-ready PNG
   */
  const handleFileProcess = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setNotification({ type: 'error', message: 'Please upload an image file (PNG, JPG, SVG, WebP).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'Image file size should be under 5MB.' });
      return;
    }

    setProcessingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawResult = e.target?.result as string;
        
        // For SVG files, directly use the data URL
        if (file.type === 'image/svg+xml') {
          setFormData((prev) => ({ ...prev, logoUrl: rawResult }));
          setCustomUrlInput(rawResult);
          setProcessingImage(false);
          setNotification({ type: 'success', message: 'SVG vector logo uploaded and applied!' });
          setTimeout(() => setNotification(null), 3000);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 320;
          const maxH = 140;
          let { width, height } = img;

          if (width > maxW || height > maxH) {
            const ratio = Math.min(maxW / width, maxH / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedBase64 = canvas.toDataURL('image/png', 0.92);
            setFormData((prev) => ({ ...prev, logoUrl: optimizedBase64 }));
            setCustomUrlInput(optimizedBase64);
            setNotification({ type: 'success', message: 'Logo optimized for thermal receipt output!' });
            setTimeout(() => setNotification(null), 3000);
          }
          setProcessingImage(false);
        };
        img.onerror = () => {
          setProcessingImage(false);
          setNotification({ type: 'error', message: 'Failed to process image file.' });
        };
        img.src = rawResult;
      };
      reader.onerror = () => {
        setProcessingImage(false);
        setNotification({ type: 'error', message: 'Failed to read file.' });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setProcessingImage(false);
      setNotification({ type: 'error', message: 'Error processing image.' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleApplyUrl = () => {
    if (!customUrlInput.trim()) {
      setNotification({ type: 'error', message: 'Please enter a valid image URL.' });
      return;
    }
    setFormData((prev) => ({ ...prev, logoUrl: customUrlInput.trim() }));
    setNotification({ type: 'success', message: 'Custom Logo URL applied!' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSelectPreset = (dataUrl: string) => {
    setFormData((prev) => ({ ...prev, logoUrl: dataUrl }));
    setCustomUrlInput(dataUrl);
    setNotification({ type: 'success', message: 'Preset restaurant logo selected!' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleClearLogo = () => {
    setFormData((prev) => ({ ...prev, logoUrl: '' }));
    setCustomUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setNotification({ type: 'success', message: 'Logo removed from thermal receipts.' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        updatedAt: Date.now()
      };
      await setDoc(doc(db, 'settings', 'restaurant'), dataToSave);
      if (onRefreshSettings) onRefreshSettings();
      setNotification({ type: 'success', message: 'Restaurant settings and thermal logo saved successfully!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRunBootstrap = async () => {
    if (!window.confirm('This will seed the database with initial Categories, Menu Items, Roles, and Settings. Continue?')) {
      return;
    }

    setBootstrapping(true);
    try {
      await bootstrapSystem();
      if (onRefreshSettings) onRefreshSettings();
      setNotification({ type: 'success', message: 'Database successfully seeded with South Indian Menu, Categories & Roles!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Bootstrap failed.' });
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-3 sm:p-4 gap-4 overflow-y-auto">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100">
              Restaurant Configuration & Thermal Logo Settings
            </h2>
            <p className="text-xs text-slate-400">Configure restaurant profile, upload thermal receipt logos, and customize print styles</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 transition-all ${
          notification.type === 'success'
            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
            : 'bg-red-950 border border-red-500/40 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Form & Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Main Settings Form (8 cols) */}
        <form onSubmit={handleSave} className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-5 text-xs">
          
          <div className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-amber-400" />
              <span>Store Profile & Identity</span>
            </div>
            <span className="text-[11px] text-amber-400 font-normal">Thermal Print Pipeline Config</span>
          </div>

          <div>
            <label className="block font-bold text-slate-400 mb-1">RESTAURANT NAME *</label>
            <input
              type="text"
              required
              value={formData.restaurantName}
              onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-400 mb-1">STORE ADDRESS</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-400 mb-1">CONTACT PHONE</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">BUSINESS EMAIL (OPTIONAL)</label>
              <input
                type="email"
                placeholder="contact@restaurant.com"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">GSTIN / FSSAI (OPTIONAL)</label>
              <input
                type="text"
                placeholder="GSTIN / FSSAI Lic No."
                value={formData.gstNumber || ''}
                onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* THERMAL RECEIPT RESTAURANT LOGO UPLOAD & CONFIGURATION MODULE */}
          {/* ========================================================================= */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-200 text-xs sm:text-sm">Thermal Receipt Logo Configuration</span>
              </div>
              {formData.logoUrl && (
                <button
                  type="button"
                  onClick={handleClearLogo}
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2 py-1 bg-red-950/50 hover:bg-red-950 border border-red-800/60 rounded-md cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove Logo</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upload your restaurant logo to be displayed prominently at the top of all printed thermal receipts and in the print-ready container.
            </p>

            {/* Logo Selection Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => setLogoInputTab('upload')}
                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  logoInputTab === 'upload' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => setLogoInputTab('presets')}
                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  logoInputTab === 'presets' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sample Emblems</span>
              </button>
              <button
                type="button"
                onClick={() => setLogoInputTab('url')}
                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  logoInputTab === 'url' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>Direct URL</span>
              </button>
            </div>

            {/* Tab 1: Upload File with Drag & Drop */}
            {logoInputTab === 'upload' && (
              <div 
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  dragOver 
                    ? 'border-amber-400 bg-amber-500/10' 
                    : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-900'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
                  accept="image/png,image/jpeg,image/svg+xml,image/webp" 
                  className="hidden" 
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Upload className={`w-5 h-5 ${processingImage ? 'animate-bounce' : ''}`} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block text-xs sm:text-sm">
                      {processingImage ? 'Optimizing Image for Thermal Heads...' : 'Click to Browse or Drag & Drop Restaurant Logo'}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      PNG, JPG, SVG, WebP supported • Auto-optimized for 80mm & 58mm receipts
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Sample Emblems */}
            {logoInputTab === 'presets' && (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 block">Choose a high-contrast emblem optimized for thermal printers:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {SAMPLE_PRESET_LOGOS.map((preset) => {
                    const IconComp = preset.icon;
                    const isSelected = formData.logoUrl === preset.dataUrl;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.dataUrl)}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 text-center transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400' 
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                        }`}
                      >
                        <div className="w-full bg-white rounded p-1.5 flex items-center justify-center h-12">
                          <img src={preset.dataUrl} alt={preset.name} className="max-h-10 max-w-full object-contain" />
                        </div>
                        <span className="font-bold text-[11px]">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 3: Direct URL */}
            {logoInputTab === 'url' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/restaurant-logo.png"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleApplyUrl}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Apply URL
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">Provide an HTTPS URL to a publicly accessible logo image</span>
              </div>
            )}

            {/* Active Logo Status Banner */}
            {formData.logoUrl ? (
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="w-16 h-12 bg-white rounded flex items-center justify-center p-1 border border-slate-700 shrink-0">
                  <img 
                    src={formData.logoUrl} 
                    alt="Active Logo" 
                    className="max-h-10 max-w-full object-contain filter grayscale contrast-125" 
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-emerald-400 text-xs">Active Logo Configured</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    Logo is ready to print at the header of all receipts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic bg-slate-900/40 p-2 rounded border border-slate-800/60 text-center">
                No custom logo set. Default text-only header will be printed.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-400 mb-1">RECEIPT HEADER SLOGAN</label>
              <input
                type="text"
                value={formData.receiptHeader}
                onChange={(e) => setFormData({ ...formData, receiptHeader: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">RECEIPT FOOTER MESSAGE</label>
              <input
                type="text"
                value={formData.receiptFooter}
                onChange={(e) => setFormData({ ...formData, receiptFooter: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-2 pt-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>Business Operational Hours & Paper Dimensions</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-400 mb-1">BUSINESS DAY START (HH:MM)</label>
              <input
                type="text"
                value={formData.businessDayStartHour}
                onChange={(e) => setFormData({ ...formData, businessDayStartHour: e.target.value })}
                placeholder="04:00"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Default 04:00 AM reset</span>
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">BILL NUMBER DIGITS</label>
              <select
                value={formData.billNumberDigits}
                onChange={(e) => setFormData({ ...formData, billNumberDigits: parseInt(e.target.value, 10) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              >
                <option value={2}>2 Digits (01, 02... 99)</option>
                <option value={3}>3 Digits (001, 002... 999)</option>
                <option value={4}>4 Digits (0001, 0002...)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">THERMAL PAPER WIDTH</label>
              <select
                value={formData.paperWidth}
                onChange={(e) => setFormData({ ...formData, paperWidth: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              >
                <option value="80mm">80mm (Standard POS / 3 inch)</option>
                <option value="58mm">58mm (Compact / 2 inch)</option>
              </select>
            </div>
          </div>

          <div className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-2 pt-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Billing & Print Automation</span>
          </div>

          {/* Auto-Print on Save Checkbox Configuration */}
          <div 
            id="billing-auto-print-setting-card"
            className={`border rounded-xl p-4 space-y-2.5 transition-all ${
              formData.autoPrintOnSave !== false
                ? 'bg-emerald-950/20 border-emerald-500/40'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <label 
                htmlFor="auto-print-on-save-checkbox"
                className="flex items-start gap-3 cursor-pointer flex-1"
              >
                <input
                  id="auto-print-on-save-checkbox"
                  type="checkbox"
                  checked={formData.autoPrintOnSave !== false}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setFormData((prev) => ({ ...prev, autoPrintOnSave: isChecked }));
                  }}
                  className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-900 mt-0.5 cursor-pointer shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100 text-xs sm:text-sm">
                      Enable 'Auto-Print on Save'
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      formData.autoPrintOnSave !== false
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {formData.autoPrintOnSave !== false ? '● ACTIVE: AUTO-PRINT ON SAVE' : '○ DISABLED: SAVE ONLY'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    Triggers the browser print dialog immediately after a bill is successfully saved to Firestore.
                  </p>
                </div>
              </label>
            </div>

            <div className="text-[11px] text-slate-500 pl-8 pt-1 border-t border-slate-800/80">
              {formData.autoPrintOnSave !== false ? (
                <span className="text-emerald-400/90 font-medium">
                  ✓ High-speed cashier workflow: Saving a bill writes to Firestore and opens the thermal print dialog instantly.
                </span>
              ) : (
                <span className="text-slate-400">
                  Bills will be saved securely to Firestore without popping the print dialog. Cashiers can view or reprint receipts on demand.
                </span>
              )}
            </div>
          </div>

          {/* Receipt Base Font Size Slider */}
          <div 
            id="receipt-font-size-setting-card"
            className="border border-slate-800 bg-slate-950/70 rounded-xl p-4 space-y-3 transition-all"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-400" />
                <label htmlFor="receipt-font-size-slider" className="font-bold text-slate-200 text-xs sm:text-sm">
                  RECEIPT BASE FONT SIZE
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12)}px
                  {(formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12)) === 12 ? ' (Standard 80mm)' : (formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12)) === 10 ? ' (Standard 58mm)' : ''}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 shrink-0">9px (Micro)</span>
                <input
                  id="receipt-font-size-slider"
                  type="range"
                  min={9}
                  max={18}
                  step={1}
                  value={formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFormData((prev) => ({ ...prev, receiptFontSize: val }));
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-[11px] font-mono text-slate-400 shrink-0">18px (Large)</span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Presets:</span>
                {[
                  { label: '9px (Micro)', value: 9 },
                  { label: '10px (58mm Default)', value: 10 },
                  { label: '12px (80mm Default)', value: 12 },
                  { label: '14px (Medium)', value: 14 },
                  { label: '16px (Large)', value: 16 }
                ].map((preset) => {
                  const currentSize = formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12);
                  const isActive = currentSize === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, receiptFontSize: preset.value }))}
                      className={`px-2.5 py-1 text-[11px] rounded-lg border font-mono transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2 space-y-1">
              <p>
                Dynamically updates the CSS variables (<code className="text-amber-400 font-mono text-[10px]">--receipt-base-font-size</code>) and layout classes in <code className="text-slate-300 font-mono text-[10px]">#pos-print-root</code>.
              </p>
              <p className="text-slate-500 text-[10px]">
                Item descriptions, header tags, table rows, and grand totals scale proportionally for all thermal printer models.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-200">Development / Testing Mode (No Physical Printer)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localStorage.getItem('pos_printer_mock_mode') === 'true'}
                  onChange={(e) => {
                    localStorage.setItem('pos_printer_mock_mode', String(e.target.checked));
                    setNotification({
                      type: 'success',
                      message: e.target.checked
                        ? 'Test Print Mode Enabled: Print dialogs will be bypassed for zero-friction billing speed testing.'
                        : 'Hardware Printer Enabled: Print dialog will open on settlement.'
                    });
                    setTimeout(() => setNotification(null), 3000);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Enable this while building and testing your billing speed without a connected receipt printer. You can still inspect receipts anytime via the <b>"View Receipt"</b> button or the <b>Reprint</b> history.
            </p>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition-colors"
            >
              <Save className="w-4 h-4" /> Save Settings
            </button>
          </div>

        </form>

        {/* Live Thermal Receipt Header Preview & Seeder (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Live Receipt Preview Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-slate-200">Live Thermal Header Preview</span>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-amber-300">
                {formData.paperWidth || '80mm'}
              </span>
            </div>

            {/* Thermal Simulated Slip */}
            {(() => {
              const previewBase = formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 12);
              const is58 = formData.paperWidth === '58mm';
              return (
                <div 
                  className={`bg-white text-black p-4 rounded shadow font-mono leading-tight select-text border border-slate-300 transition-all ${is58 ? 'max-w-[240px] mx-auto' : 'w-full'}`}
                  style={{
                    fontSize: `${previewBase}px`,
                    ['--receipt-base-font-size' as any]: `${previewBase}px`
                  }}
                >
                  
                  {/* Receipt Logo Output */}
                  {formData.logoUrl && (
                    <div className="flex justify-center items-center mb-2">
                      <img 
                        src={formData.logoUrl} 
                        alt="Receipt Header Logo" 
                        className="max-h-12 max-w-[140px] object-contain filter grayscale contrast-125"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  {/* Title & Info */}
                  <div className="text-center">
                    <div 
                      style={{ fontSize: `${Math.round(previewBase * 1.25 * 10) / 10}px` }}
                      className="font-black uppercase tracking-wide"
                    >
                      {formData.restaurantName || 'RESTAURANT NAME'}
                    </div>
                    {formData.receiptHeader && (
                      <div 
                        style={{ fontSize: `${Math.round(previewBase * 0.88 * 10) / 10}px` }}
                        className="font-semibold italic mt-0.5"
                      >
                        ★ {formData.receiptHeader} ★
                      </div>
                    )}
                    <div 
                      style={{ fontSize: `${Math.round(previewBase * 0.85 * 10) / 10}px` }}
                      className="mt-1 space-y-0.5 leading-tight text-slate-800"
                    >
                      <div>{formData.address || 'Address Line'}</div>
                      <div>Tel: {formData.phone || 'Phone'}</div>
                      {formData.gstNumber && <div className="font-bold mt-0.5">GSTIN: {formData.gstNumber}</div>}
                    </div>
                  </div>

                  <div className="border-t border-dashed border-black my-2" />

                  <div 
                    style={{ fontSize: `${Math.round(previewBase * 0.85 * 10) / 10}px` }}
                    className="text-slate-700 flex justify-between"
                  >
                    <span>Bill: #01</span>
                    <span>{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="border-t border-dashed border-black my-1.5" />

                  {/* Sample item */}
                  <div 
                    style={{ fontSize: `${previewBase}px` }}
                    className="flex justify-between font-bold"
                  >
                    <span>1× Masala Dosa</span>
                    <span>₹80.00</span>
                  </div>
                  <div 
                    style={{ fontSize: `${previewBase}px` }}
                    className="flex justify-between font-bold"
                  >
                    <span>1× Filter Coffee</span>
                    <span>₹35.00</span>
                  </div>

                  <div 
                    style={{ fontSize: `${Math.round(previewBase * 1.25 * 10) / 10}px` }}
                    className="border-t-2 border-double border-black my-1.5 pt-1 flex justify-between font-black"
                  >
                    <span>TOTAL:</span>
                    <span>₹115.00</span>
                  </div>

                  <div className="border-t border-dashed border-black my-1.5" />
                  
                  <div 
                    style={{ fontSize: `${Math.round(previewBase * 0.80 * 10) / 10}px` }}
                    className="text-center text-slate-600"
                  >
                    <div>{formData.receiptFooter || 'Thank you!'}</div>
                  </div>
                </div>
              );
            })()}

            <p className="text-[10px] text-slate-500 text-center">
              Real-time rendering of thermal receipt top layout
            </p>
          </div>

          {/* Database Seeder */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Menu & System Seeder</span>
            </div>

            <p className="text-slate-400 leading-relaxed">
              Populate your Firestore database with the pre-configured restaurant catalog: South Indian Tiffin, Rice, Meals, Beverages, Snacks, Default Admin and Waiter roles, and Initial Categories.
            </p>

            <button
              type="button"
              onClick={handleRunBootstrap}
              disabled={bootstrapping}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <Sparkles className={`w-4 h-4 ${bootstrapping ? 'animate-spin' : ''}`} />
              <span>{bootstrapping ? 'Seeding Database...' : 'Seed Sample Menu & Data'}</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};

