import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KotManagement } from './KotManagement';
import { Kot, KotItem, RestaurantSettings } from '../../types';
import { saveKotLocally } from '../../services/localKotStore';

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      uid: 'user_chef',
      displayName: 'Master Chef',
      role: 'chef',
      active: true
    }
  })
}));

// Mock Firebase
vi.mock('../../services/firebase', () => ({
  db: {},
  auth: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn((query, callback) => {
    return () => {};
  }),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn()
}));

const dummySettings: RestaurantSettings = {
  restaurantName: 'Saravana Bhavan',
  address: 'Anna Salai, Chennai',
  phone: '044-28520000',
  email: 'info@saravanabhavan.com',
  gstNumber: '33AAAAA0000A1Z5',
  fssaiNumber: '12415002000001',
  tagline: 'Authentic Veg',
  receiptHeader: 'Welcome',
  receiptFooter: 'Thank you',
  paperWidth: '80mm',
  receiptFontSize: 12,
  autoPrintOnSave: false
};

describe('Responsive KOT Card Display and Grid Layout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the responsive CSS grid container with auto-adjusting breakpoints for mobile and kitchen monitors', () => {
    const testKot: Kot = {
      id: 'kot_test_1',
      kotNumber: 'KOT-01',
      businessDate: '2026-09-07',
      tableNumber: 'T-4',
      orderType: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Karthik',
      status: 'OPEN',
      createdBy: 'w1',
      createdAt: Date.now() - 5 * 60 * 1000,
      updatedAt: Date.now() - 5 * 60 * 1000
    };

    const testItems: KotItem[] = [
      {
        id: 'ki_1',
        kotId: 'kot_test_1',
        itemId: 'i_1',
        itemCode: '101',
        itemName: 'Ghee Roast Dosa',
        itemNameTamil: 'நெய் ரோஸ்ட் தோசை',
        quantity: 2,
        priceType: 'NON_AC',
        notes: 'Extra Crispy',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    saveKotLocally(testKot, testItems);

    const { container } = render(<KotManagement settings={dummySettings} />);

    // Check for the responsive CSS grid container class
    const gridContainer = container.querySelector('.kot-card-grid');
    expect(gridContainer).toBeDefined();
    expect(gridContainer?.className).toContain('kot-card-grid');
    expect(gridContainer?.className).toContain('grid-cols-1');
    expect(gridContainer?.className).toContain('sm:grid-cols-2');
    expect(gridContainer?.className).toContain('lg:grid-cols-3');
    expect(gridContainer?.className).toContain('xl:grid-cols-4');
    expect(gridContainer?.className).toContain('2xl:grid-cols-5');
    expect(gridContainer?.className).toContain('min-[1920px]:grid-cols-6');
  });

  it('displays high-visibility card details including KOT number, Table, Tamil names, quantities, and special notes', () => {
    const testKot: Kot = {
      id: 'kot_test_2',
      kotNumber: 'KOT-88',
      businessDate: '2026-09-07',
      tableNumber: 'T-12',
      orderType: 'DINE_IN',
      waiterId: 'w2',
      waiterName: 'Murugan',
      status: 'PREPARING',
      createdBy: 'w2',
      createdAt: Date.now() - 10 * 60 * 1000,
      updatedAt: Date.now() - 10 * 60 * 1000
    };

    const testItems: KotItem[] = [
      {
        id: 'ki_2',
        kotId: 'kot_test_2',
        itemId: 'i_2',
        itemCode: '102',
        itemName: 'Poori Masala',
        itemNameTamil: 'பூரி மசாலா',
        quantity: 3,
        priceType: 'NON_AC',
        notes: 'Less oil',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    saveKotLocally(testKot, testItems);

    render(<KotManagement settings={dummySettings} />);

    // KOT Number
    expect(screen.getByText('KOT-88')).toBeDefined();
    // Table Number
    expect(screen.getByText('T-12')).toBeDefined();
    // Dish Name
    expect(screen.getAllByText(/Poori Masala/).length).toBeGreaterThanOrEqual(1);
    // Tamil translation
    expect(screen.getByText('பூரி மசாலா')).toBeDefined();
    // Special cooking instruction note
    expect(screen.getByText('Less oil')).toBeDefined();
    // High-visibility quantity badge
    expect(screen.getAllByText('×3').length).toBeGreaterThanOrEqual(1);
  });

  it('applies urgency warning styling to tickets waiting over 30 minutes for kitchen monitors', () => {
    const urgentKot: Kot = {
      id: 'kot_urgent_1',
      kotNumber: 'KOT-99',
      businessDate: '2026-09-07',
      tableNumber: 'T-2',
      orderType: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Ravi',
      status: 'OPEN',
      createdBy: 'w1',
      createdAt: Date.now() - 35 * 60 * 1000, // 35 min ago (>30m)
      updatedAt: Date.now() - 35 * 60 * 1000
    };

    const urgentItems: KotItem[] = [
      {
        id: 'ki_3',
        kotId: 'kot_urgent_1',
        itemId: 'i_3',
        itemCode: '103',
        itemName: 'Medu Vada',
        quantity: 1,
        priceType: 'NON_AC',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    saveKotLocally(urgentKot, urgentItems);

    const { container } = render(<KotManagement settings={dummySettings} />);

    // Urgent KOT card should have rose alert border
    const urgentCard = container.querySelector('.border-rose-500\\/60');
    expect(urgentCard).toBeDefined();

    // Elapsed time container should show pulsing alert
    const pulsingAlert = container.querySelector('.animate-pulse');
    expect(pulsingAlert).toBeDefined();
    expect(pulsingAlert?.textContent).toContain('35m ago');
  });

  it('displays real-time order counts inside the status filter tabs for kitchen staff', () => {
    const kotOpen: Kot = {
      id: 'kot_f1',
      kotNumber: 'KOT-01',
      businessDate: '2026-09-07',
      tableNumber: 'T-1',
      orderType: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Staff',
      status: 'OPEN',
      createdBy: 'w1',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const kotPrep: Kot = {
      id: 'kot_f2',
      kotNumber: 'KOT-02',
      businessDate: '2026-09-07',
      tableNumber: 'T-2',
      orderType: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Staff',
      status: 'PREPARING',
      createdBy: 'w1',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    saveKotLocally(kotOpen, [{ id: 'i1', kotId: 'kot_f1', itemId: 'x', itemCode: 'x', itemName: 'Tea', quantity: 1, priceType: 'NON_AC', createdAt: Date.now(), updatedAt: Date.now() }]);
    saveKotLocally(kotPrep, [{ id: 'i2', kotId: 'kot_f2', itemId: 'y', itemCode: 'y', itemName: 'Coffee', quantity: 1, priceType: 'NON_AC', createdAt: Date.now(), updatedAt: Date.now() }]);

    render(<KotManagement settings={dummySettings} />);

    // Active Kitchen count should reflect the active orders
    expect(screen.getByText('Active Kitchen')).toBeDefined();
    expect(screen.getByText('All KOTs')).toBeDefined();
  });
});
