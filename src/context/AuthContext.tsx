import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  signOut as fbSignOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { AppUser, Role, UserRole } from '../types';
import { DEFAULT_RESTAURANT_LOGO } from '../data/defaultLogo';

export const DEFAULT_PERMISSIONS = {
  OWNER: [
    'dashboard.view',
    'kot.create',
    'kot.edit',
    'kot.delete',
    'billing.create',
    'billing.print',
    'billing.reprint',
    'billing.cancel',
    'menu.view',
    'menu.create',
    'menu.edit',
    'menu.price',
    'inventory.view',
    'inventory.edit',
    'reports.view',
    'reports.financial',
    'users.manage',
    'settings.manage'
  ],
  MANAGER: [
    'dashboard.view',
    'kot.create',
    'kot.edit',
    'kot.delete',
    'billing.create',
    'billing.print',
    'billing.reprint',
    'billing.cancel',
    'menu.view',
    'menu.create',
    'menu.edit',
    'menu.price',
    'inventory.view',
    'reports.view'
  ],
  WAITER: [
    'kot.create',
    'kot.edit',
    'kot.view',
    'billing.create',
    'billing.print'
  ]
};

interface AuthContextType {
  currentUser: AppUser | null;
  firebaseUser: FirebaseUser | null;
  currentRole: Role | null;
  loading: boolean;
  isOnline: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string, roleId: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  hasPermission: (perm: string) => boolean;
  isOwner: boolean;
  isManager: boolean;
  isWaiter: boolean;
  bootstrapSystem: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        // Fetch or create user record in Firestore
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as AppUser;
            setCurrentUser(userData);
            await loadRole(userData.roleId);
          } else {
            // First time login - if no users exist, default to OWNER
            const defaultUser: AppUser = {
              uid: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              email: fbUser.email || '',
              roleId: 'owner',
              active: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastLoginAt: Date.now()
            };
            await setDoc(userDocRef, defaultUser);
            setCurrentUser(defaultUser);
            await loadRole('owner');
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          // Fallback to owner for seamless dev flow
          const fallbackUser: AppUser = {
            uid: fbUser.uid,
            name: fbUser.email?.split('@')[0] || 'Admin Owner',
            email: fbUser.email || '',
            roleId: 'owner',
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          setCurrentUser(fallbackUser);
          await loadRole('owner');
        }
      } else {
        // Automatically authenticate anonymously so Firestore operations are authenticated
        const savedDemoRole = (localStorage.getItem('pos_demo_role') as UserRole) || 'owner';
        applyDemoUser(savedDemoRole);
        signInAnonymously(auth).catch((err) => {
          console.warn('Anonymous auth note:', err);
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyDemoUser = (role: UserRole) => {
    const lowerRole = role.toLowerCase() as 'owner' | 'manager' | 'waiter';
    const names = {
      owner: 'Hotel Owner (Full Access)',
      manager: 'Restaurant Manager',
      waiter: 'Floor Waiter'
    };

    const demoUser: AppUser = {
      uid: `demo_${lowerRole}`,
      name: names[lowerRole] || 'Staff User',
      email: `${lowerRole}@hotelpos.local`,
      roleId: lowerRole,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setCurrentUser(demoUser);
    setCurrentRole({
      id: lowerRole,
      name: lowerRole.toUpperCase(),
      permissions: DEFAULT_PERMISSIONS[lowerRole.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || [],
      active: true
    });
  };

  const loadRole = async (roleId: string) => {
    const normRoleId = roleId.toLowerCase();
    try {
      const roleRef = doc(db, 'roles', normRoleId);
      const roleSnap = await getDoc(roleRef);
      if (roleSnap.exists()) {
        setCurrentRole(roleSnap.data() as Role);
      } else {
        const perms = DEFAULT_PERMISSIONS[normRoleId.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || DEFAULT_PERMISSIONS.OWNER;
        const newRole: Role = {
          id: normRoleId,
          name: normRoleId.toUpperCase(),
          permissions: perms,
          active: true
        };
        await setDoc(roleRef, newRole);
        setCurrentRole(newRole);
      }
    } catch (e) {
      setCurrentRole({
        id: normRoleId,
        name: normRoleId.toUpperCase(),
        permissions: DEFAULT_PERMISSIONS[normRoleId.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || [],
        active: true
      });
    }
  };

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      setLoading(false);
      throw err;
    }
  };

  const register = async (email: string, pass: string, name: string, roleId: string) => {
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser: AppUser = {
        uid: res.user.uid,
        name,
        email,
        roleId: roleId.toLowerCase(),
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastLoginAt: Date.now()
      };
      await setDoc(doc(db, 'users', res.user.uid), newUser);
      setCurrentUser(newUser);
      await loadRole(roleId);
    } catch (err: any) {
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    if (firebaseUser) {
      await fbSignOut(auth);
    }
    applyDemoUser('owner');
  };

  const switchDemoRole = (role: UserRole) => {
    localStorage.setItem('pos_demo_role', role.toLowerCase());
    applyDemoUser(role);
  };

  const hasPermission = (perm: string): boolean => {
    if (!currentUser) return false;
    const roleId = currentUser.roleId?.toLowerCase();
    if (roleId === 'owner') return true; // Owner has unrestricted access
    if (!currentRole) return false;
    return currentRole.permissions.includes(perm);
  };

  const isOwner = currentUser?.roleId?.toLowerCase() === 'owner';
  const isManager = currentUser?.roleId?.toLowerCase() === 'manager' || isOwner;
  const isWaiter = currentUser?.roleId?.toLowerCase() === 'waiter';

  /**
   * Initializes initial standard restaurant data (Categories, Menu items with codes, settings)
   */
  const bootstrapSystem = async () => {
    try {
      // 1. Roles
      for (const [rKey, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
        await setDoc(doc(db, 'roles', rKey.toLowerCase()), {
          id: rKey.toLowerCase(),
          name: rKey,
          permissions: perms,
          active: true
        });
      }

      // 2. Settings
      await setDoc(doc(db, 'settings', 'restaurant'), {
        restaurantName: 'SRI SARAVANA BHAVAN',
        address: '104 Grand Avenue, Central Complex',
        phone: '+91 78100 66035 / 99769 74098',
        email: 'srisaravanabhavan57.com',
        tagline: 'AUTHENTIC TASTE & QUALITY',
        receiptHeader: 'SRI SARAVANA BHAVAN',
        receiptFooter: 'Thank you for visiting! Please visit again.',
        logoUrl: DEFAULT_RESTAURANT_LOGO
      });

      await setDoc(doc(db, 'settings', 'billing'), {
        businessDayStart: '04:00',
        billNumberStart: 1,
        discountEnabled: true,
        autoPrintAfterSave: true
      });

      // 3. Default Categories
      const categories = [
        { id: 'cat_tiffin', categoryCode: 'TIF', categoryName: 'Tiffin & Breakfast', description: 'South Indian Breakfasts' },
        { id: 'cat_meals', categoryCode: 'MLS', categoryName: 'Meals & Lunch', description: 'Thalis, Biryanis, Combos' },
        { id: 'cat_snacks', categoryCode: 'SNK', categoryName: 'Snacks & Starters', description: 'Crispy Evening Snacks' },
        { id: 'cat_beverages', categoryCode: 'BEV', categoryName: 'Beverages & Hot Drinks', description: 'Filter Coffee, Tea, Fresh Juices' },
        { id: 'cat_special', categoryCode: 'SPC', categoryName: 'Chef Specials & Desserts', description: 'House Specialties' }
      ];

      for (const cat of categories) {
        await setDoc(doc(db, 'categories', cat.id), {
          ...cat,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      // 4. Default Menu Items with unique item codes & AC / Non-AC pricing
      const menuItems = [
        { id: 'item_101', itemCode: '101', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Idly (2 Pcs)', acPrice: 50, nonAcPrice: 40, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_102', itemCode: '102', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Medu Vada (1 Pc)', acPrice: 45, nonAcPrice: 35, imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400' },
        { id: 'item_103', itemCode: '103', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Plain Dosa', acPrice: 75, nonAcPrice: 60, imageUrl: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400' },
        { id: 'item_104', itemCode: '104', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Masala Dosa', acPrice: 95, nonAcPrice: 80, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_105', itemCode: '105', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Poori Bhaji (2 Pcs)', acPrice: 85, nonAcPrice: 70, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400' },
        { id: 'item_106', itemCode: '106', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Ghee Podi Idly', acPrice: 80, nonAcPrice: 65, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_107', itemCode: '107', categoryId: 'cat_tiffin', categoryName: 'Tiffin & Breakfast', itemName: 'Rava Upma', acPrice: 60, nonAcPrice: 50, imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400' },
        
        { id: 'item_201', itemCode: '201', categoryId: 'cat_meals', categoryName: 'Meals & Lunch', itemName: 'South Indian Special Meals', acPrice: 160, nonAcPrice: 130, imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=400' },
        { id: 'item_202', itemCode: '202', categoryId: 'cat_meals', categoryName: 'Meals & Lunch', itemName: 'Curd Rice', acPrice: 80, nonAcPrice: 65, imageUrl: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400' },
        { id: 'item_203', itemCode: '203', categoryId: 'cat_meals', categoryName: 'Meals & Lunch', itemName: 'Sambar Rice with Ghee', acPrice: 90, nonAcPrice: 75, imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=400' },
        { id: 'item_204', itemCode: '204', categoryId: 'cat_meals', categoryName: 'Meals & Lunch', itemName: 'Veg Dum Biryani', acPrice: 180, nonAcPrice: 150, imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400' },
        { id: 'item_205', itemCode: '205', categoryId: 'cat_meals', categoryName: 'Meals & Lunch', itemName: 'Mini Tiffin Combo', acPrice: 140, nonAcPrice: 120, imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400' },

        { id: 'item_301', itemCode: '301', categoryId: 'cat_beverages', categoryName: 'Beverages & Hot Drinks', itemName: 'Filter Coffee', acPrice: 35, nonAcPrice: 25, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400' },
        { id: 'item_302', itemCode: '302', categoryId: 'cat_beverages', categoryName: 'Beverages & Hot Drinks', itemName: 'Masala Tea', acPrice: 30, nonAcPrice: 20, imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400' },
        { id: 'item_303', itemCode: '303', categoryId: 'cat_beverages', categoryName: 'Beverages & Hot Drinks', itemName: 'Fresh Lime Soda', acPrice: 50, nonAcPrice: 40, imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400' },
        { id: 'item_304', itemCode: '304', categoryId: 'cat_beverages', categoryName: 'Beverages & Hot Drinks', itemName: 'Sweet Lassi', acPrice: 70, nonAcPrice: 55, imageUrl: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400' },

        { id: 'item_401', itemCode: '401', categoryId: 'cat_snacks', categoryName: 'Snacks & Starters', itemName: 'Gobi 65', acPrice: 120, nonAcPrice: 100, imageUrl: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400' },
        { id: 'item_402', itemCode: '402', categoryId: 'cat_snacks', categoryName: 'Snacks & Starters', itemName: 'Paneer Butter Tikka', acPrice: 190, nonAcPrice: 160, imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400' },
        { id: 'item_501', itemCode: '501', categoryId: 'cat_special', categoryName: 'Chef Specials & Desserts', itemName: 'Gulab Jamun (2 Pcs)', acPrice: 60, nonAcPrice: 50, imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400' },
        { id: 'item_502', itemCode: '502', categoryId: 'cat_special', categoryName: 'Chef Specials & Desserts', itemName: 'Rava Kesari', acPrice: 55, nonAcPrice: 45, imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400' }
      ];

      for (const itm of menuItems) {
        await setDoc(doc(db, 'menu_items', itm.id), {
          ...itm,
          description: itm.itemName,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        // Also create matching inventory tracking item
        await setDoc(doc(db, 'inventory_items', `inv_${itm.itemCode}`), {
          id: `inv_${itm.itemCode}`,
          itemCode: itm.itemCode,
          itemName: itm.itemName,
          unit: 'Portion',
          minimumStock: 15,
          currentStock: 100,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      console.log('System bootstrapped successfully with initial menu & roles!');
    } catch (e) {
      console.error('Error bootstrapping system:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        currentRole,
        loading,
        isOnline,
        login,
        register,
        logout,
        switchDemoRole,
        hasPermission,
        isOwner,
        isManager,
        isWaiter,
        bootstrapSystem
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
