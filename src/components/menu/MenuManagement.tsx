import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  FolderPlus, 
  Layers, 
  Eye, 
  EyeOff, 
  Save, 
  X,
  RefreshCw,
  CloudUpload
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Category, MenuItem } from '../../types';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { getTamilItemName, suggestTamilName } from '../../services/tamilTranslation';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';

export const MenuManagement: React.FC = () => {
  const { hasPermission, isOwner, isManager } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [syncingCloud, setSyncingCloud] = useState(false);

  // Menu Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    itemCode: '',
    itemName: '',
    itemNameTamil: '',
    categoryId: '',
    nonAcPrice: '',
    acPrice: '',
    imageUrl: '',
    active: true
  });

  // Category Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    categoryName: '',
    displayOrder: '1',
    active: true
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Firestore listeners
  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'categories'), (snap) => {
      const list: Category[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
      setCategories(list.sort((a, b) => a.displayOrder - b.displayOrder));
    });

    const unsubItems = onSnapshot(collection(db, 'menu_items'), (snap) => {
      const list: MenuItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MenuItem));
      setMenuItems(list);
    });

    return () => {
      unsubCats();
      unsubItems();
    };
  }, []);

  const openNewItemModal = () => {
    setEditingItem(null);
    setItemForm({
      itemCode: '',
      itemName: '',
      itemNameTamil: '',
      categoryId: categories[0]?.id || '',
      nonAcPrice: '',
      acPrice: '',
      imageUrl: '',
      active: true
    });
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      itemCode: item.itemCode,
      itemName: item.itemName,
      itemNameTamil: item.itemNameTamil || getTamilItemName(item.itemName),
      categoryId: item.categoryId,
      nonAcPrice: item.nonAcPrice.toString(),
      acPrice: item.acPrice.toString(),
      imageUrl: item.imageUrl || '',
      active: item.active
    });
    setItemModalOpen(true);
  };

  const handleItemNameChange = (newName: string) => {
    const suggested = suggestTamilName(newName);
    // If Tamil name was empty or matched previous auto-suggestion, update it
    setItemForm((prev) => ({
      ...prev,
      itemName: newName,
      itemNameTamil: prev.itemNameTamil === '' || prev.itemNameTamil === suggestTamilName(prev.itemName)
        ? suggested 
        : prev.itemNameTamil
    }));
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.itemCode.trim() || !itemForm.itemName.trim() || !itemForm.nonAcPrice || !itemForm.acPrice) {
      setNotification({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    const nonAc = parseFloat(itemForm.nonAcPrice);
    const ac = parseFloat(itemForm.acPrice);
    if (isNaN(nonAc) || isNaN(ac) || nonAc < 0 || ac < 0) {
      setNotification({ type: 'error', message: 'Please enter valid non-negative prices.' });
      return;
    }

    // Check unique code
    const existingCode = menuItems.find(
      (m) => m.itemCode.toUpperCase() === itemForm.itemCode.trim().toUpperCase() && m.id !== editingItem?.id
    );
    if (existingCode) {
      setNotification({ type: 'error', message: `Item code "${itemForm.itemCode}" is already in use.` });
      return;
    }

    setSaving(true);
    try {
      const targetCategory = categories.find((c) => c.id === itemForm.categoryId);
      const itemId = editingItem ? editingItem.id : `item_${itemForm.itemCode.trim().toLowerCase()}_${Date.now()}`;
      const now = Date.now();

      const itemData: MenuItem = {
        id: itemId,
        itemCode: itemForm.itemCode.trim().toUpperCase(),
        itemName: itemForm.itemName.trim(),
        itemNameTamil: itemForm.itemNameTamil.trim() || getTamilItemName(itemForm.itemName.trim()),
        categoryId: itemForm.categoryId,
        categoryName: targetCategory?.categoryName || 'General',
        nonAcPrice: nonAc,
        acPrice: ac,
        active: itemForm.active,
        createdAt: editingItem?.createdAt || now,
        updatedAt: now
      };

      if (itemForm.imageUrl && itemForm.imageUrl.trim()) {
        itemData.imageUrl = itemForm.imageUrl.trim();
      }

      await setDoc(doc(db, 'menu_items', itemId), sanitizeForFirestore(itemData));
      setItemModalOpen(false);
      setNotification({
        type: 'success',
        message: `Item "${itemData.itemName}" saved successfully.`
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save item.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleItemStatus = async (item: MenuItem) => {
    try {
      await updateDoc(doc(db, 'menu_items', item.id), {
        active: !item.active,
        updatedAt: Date.now()
      });
      setNotification({
        type: 'success',
        message: `Item "${item.itemName}" ${!item.active ? 'activated' : 'deactivated'}.`
      });
      setTimeout(() => setNotification(null), 2500);
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to update status.' });
    }
  };

  // Category Handlers
  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({
      categoryName: '',
      displayOrder: (categories.length + 1).toString(),
      active: true
    });
    setCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({
      categoryName: cat.categoryName,
      displayOrder: (cat.displayOrder || 1).toString(),
      active: cat.active !== false
    });
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.categoryName.trim()) {
      setNotification({ type: 'error', message: 'Category name is required.' });
      return;
    }

    setSaving(true);
    try {
      const catId = editingCategory ? editingCategory.id : `cat_${Date.now()}`;
      const now = Date.now();

      const catData: Category = {
        id: catId,
        categoryCode: editingCategory?.categoryCode || categoryForm.categoryName.trim().toUpperCase().slice(0, 4),
        categoryName: categoryForm.categoryName.trim(),
        displayOrder: parseInt(categoryForm.displayOrder, 10) || 1,
        active: categoryForm.active,
        createdAt: editingCategory?.createdAt || now,
        updatedAt: now
      };

      await setDoc(doc(db, 'categories', catId), sanitizeForFirestore(catData));
      setCategoryModalOpen(false);
      setNotification({
        type: 'success',
        message: `Category "${catData.categoryName}" saved.`
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Failed to save category.' });
    } finally {
      setSaving(false);
    }
  };

  const effectiveCategories = useMemo(() => {
    return categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  }, [categories]);

  const effectiveMenuItems = useMemo(() => {
    return menuItems.length > 0 ? menuItems : DEFAULT_FALLBACK_MENU_ITEMS;
  }, [menuItems]);

  const handleSyncStandardMenu = async () => {
    if (!window.confirm(`Sync all ${DEFAULT_FALLBACK_MENU_ITEMS.length} menu items and ${DEFAULT_CATEGORIES.length} categories to cloud Firestore database?`)) {
      return;
    }
    setSyncingCloud(true);
    try {
      // Sync categories
      for (const cat of DEFAULT_CATEGORIES) {
        await setDoc(doc(db, 'categories', cat.id), sanitizeForFirestore(cat));
      }
      // Sync items in batch
      const batch = writeBatch(db);
      for (const item of DEFAULT_FALLBACK_MENU_ITEMS) {
        const itemRef = doc(db, 'menu_items', item.id);
        batch.set(itemRef, sanitizeForFirestore(item));
      }
      await batch.commit();

      setNotification({
        type: 'success',
        message: `Successfully synchronized ${DEFAULT_FALLBACK_MENU_ITEMS.length} menu items and ${DEFAULT_CATEGORIES.length} categories to database.`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to sync menu items to cloud.' });
    } finally {
      setSyncingCloud(false);
    }
  };

  const filteredItems = effectiveMenuItems.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      !q || 
      item.itemCode.toLowerCase().includes(q) || 
      item.itemName.toLowerCase().includes(q) ||
      (item.itemNameTamil && item.itemNameTamil.includes(q));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-2.5 sm:p-4 gap-3 overflow-y-auto lg:overflow-hidden">
      
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Utensils className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100">
              Menu Items & Categories Management
            </h2>
            <div className="text-[11px] text-slate-400">
              Total {effectiveMenuItems.length} dishes • {effectiveCategories.length} categories available
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Cloud Sync Button */}
          <button
            onClick={handleSyncStandardMenu}
            disabled={syncingCloud}
            title="Upload/Sync standard hotel menu to Firestore Cloud Database"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors disabled:opacity-50"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-bounce' : ''}`} />
            {syncingCloud ? 'Syncing...' : 'Sync Standard Menu'}
          </button>

          {/* Sub-tab Switcher */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'items' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Menu Items ({effectiveMenuItems.length})
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'categories' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Categories ({effectiveCategories.length})
            </button>
          </div>

          {/* Add Button */}
          {activeTab === 'items' ? (
            <button
              onClick={openNewItemModal}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Menu Item
            </button>
          ) : (
            <button
              onClick={openNewCategoryModal}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> Add Category
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 ${
          notification.type === 'success'
            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
            : 'bg-red-950 border border-red-500/40 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* VIEW 1: MENU ITEMS TABLE */}
      {activeTab === 'items' && (
        <div className="flex flex-col flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
          
          {/* Filter and Search Sub-bar */}
          <div className="p-3 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full">
              <span className="text-xs text-slate-400 font-bold">Category:</span>
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  selectedCategory === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                }`}
              >
                All
              </button>
              {effectiveCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer whitespace-nowrap ${
                    selectedCategory === c.id ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {c.categoryName}
                </button>
              ))}
            </div>

            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Code</th>
                  <th className="py-3">Item Name</th>
                  <th className="py-3">Category</th>
                  <th className="py-3 text-right">Non-AC Price</th>
                  <th className="py-3 text-right">AC Price</th>
                  <th className="py-3 text-center">Status</th>
                  <th className="py-3 text-center pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 pl-4 font-bold text-amber-400">{item.itemCode}</td>
                    <td className="py-3 font-sans font-medium text-slate-200">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.itemName}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded object-cover border border-slate-700"
                          />
                        )}
                        <div>
                          <div className="font-semibold text-slate-100">{item.itemName}</div>
                          <div className="text-[11px] text-amber-400 font-medium">
                            {item.itemNameTamil || getTamilItemName(item.itemName)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 font-sans text-slate-400">{item.categoryName}</td>
                    <td className="py-3 text-right text-slate-300">₹{item.nonAcPrice}</td>
                    <td className="py-3 text-right font-bold text-emerald-400">₹{item.acPrice}</td>
                    <td className="py-3 text-center">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                        item.active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        {item.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 text-center pr-4">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleItemStatus(item)}
                          className="p-1 text-slate-400 hover:text-amber-400 rounded"
                          title={item.active ? 'Deactivate' : 'Activate'}
                        >
                          {item.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => openEditItemModal(item)}
                          className="p-1 text-slate-400 hover:text-blue-400 rounded"
                          title="Edit Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* VIEW 2: CATEGORIES TABLE */}
      {activeTab === 'categories' && (
        <div className="flex flex-col flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3 pl-4">Order</th>
                  <th className="py-3">Category Name</th>
                  <th className="py-3 text-center">Items Count</th>
                  <th className="py-3 text-center">Status</th>
                  <th className="py-3 text-center pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {effectiveCategories.map((cat) => {
                  const itemCount = effectiveMenuItems.filter((m) => m.categoryId === cat.id).length;
                  return (
                    <tr key={cat.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 pl-4 font-mono font-bold text-amber-400">{cat.displayOrder}</td>
                      <td className="py-3 font-medium text-slate-200">{cat.categoryName}</td>
                      <td className="py-3 text-center font-mono text-slate-400">{itemCount} items</td>
                      <td className="py-3 text-center">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          cat.active !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {cat.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-center pr-4">
                        <button
                          onClick={() => openEditCategoryModal(cat)}
                          className="p-1 text-slate-400 hover:text-blue-400 rounded"
                          title="Edit Category"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT MENU ITEM */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-100">
                {editingItem ? `Edit Item (${editingItem.itemCode})` : 'New Menu Item'}
              </h3>
              <button onClick={() => setItemModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">ITEM CODE *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 101"
                    value={itemForm.itemCode}
                    onChange={(e) => setItemForm({ ...itemForm, itemCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">CATEGORY *</label>
                  <select
                    value={itemForm.categoryId}
                    onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.categoryName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">ITEM NAME (ENGLISH) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Masala Dosa"
                  value={itemForm.itemName}
                  onChange={(e) => handleItemNameChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-400">TAMIL NAME (ரசீது தமிழ் பெயர் / PRINT NAME)</label>
                  <span className="text-[10px] text-amber-400 font-medium">Used on Printed Receipts</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. மசாலா தோசை"
                  value={itemForm.itemNameTamil}
                  onChange={(e) => setItemForm({ ...itemForm, itemNameTamil: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-amber-300 font-medium focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">NON-AC PRICE (₹) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    placeholder="e.g. 60"
                    value={itemForm.nonAcPrice}
                    onChange={(e) => setItemForm({ ...itemForm, nonAcPrice: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">AC PRICE (₹) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    placeholder="e.g. 75"
                    value={itemForm.acPrice}
                    onChange={(e) => setItemForm({ ...itemForm, acPrice: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">IMAGE URL (OPTIONAL)</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={itemForm.imageUrl}
                  onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="itemActive"
                  checked={itemForm.active}
                  onChange={(e) => setItemForm({ ...itemForm, active: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-500"
                />
                <label htmlFor="itemActive" className="text-slate-300 font-medium cursor-pointer">
                  Item is active and available for billing
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CATEGORY */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-100">
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <button onClick={() => setCategoryModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">CATEGORY NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Indian Tiffin"
                  value={categoryForm.categoryName}
                  onChange={(e) => setCategoryForm({ ...categoryForm, categoryName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">DISPLAY ORDER</label>
                <input
                  type="number"
                  min="1"
                  value={categoryForm.displayOrder}
                  onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
