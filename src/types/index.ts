export type UserRole = 'owner' | 'manager' | 'waiter' | 'OWNER' | 'MANAGER' | 'WAITER';

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  roleId: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export type User = AppUser;

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  active: boolean;
}

export interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
  displayOrder?: number;
  description?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MenuItem {
  id: string;
  itemCode: string;
  categoryId: string;
  categoryName?: string;
  itemName: string;
  itemNameTamil?: string;
  description?: string;
  imageUrl?: string;
  acPrice: number;
  nonAcPrice: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PriceType = 'NON_AC' | 'AC';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY';

export type KotStatus = 'OPEN' | 'SENT' | 'PREPARING' | 'READY' | 'COMPLETED' | 'BILLED' | 'CANCELLED';

export interface KotItem {
  id: string;
  kotId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  priceType: PriceType;
  unitPrice?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Kot {
  id: string;
  kotNumber: string;
  businessDate: string;
  orderType: OrderType;
  tableNumber: string;
  waiterId: string;
  waiterName?: string;
  status: KotStatus;
  items?: KotItem[];
  itemsCount?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type BillStatus = 'COMPLETED' | 'CANCELLED';

export interface BillItem {
  id: string;
  billId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType: PriceType;
  createdAt: number;
}

export interface Bill {
  id: string;
  businessDate: string;
  billNumber: string;
  orderType: OrderType;
  priceType: PriceType;
  userId: string;
  userName: string;
  kotId?: string;
  tableNumber?: string;
  subtotal: number;
  discount: number;
  grandTotal: number;
  status: BillStatus;
  reprintCount: number;
  lastReprintedAt?: number;
  lastReprintedBy?: string;
  cancelledBy?: string;
  cancelledAt?: number;
  cancelReason?: string;
  deviceId?: string;
  transactionId?: string;
  items?: BillItem[];
  createdAt: number;
  updatedAt: number;
}

export interface BusinessDay {
  businessDate: string;
  lastBillNumber: number;
  lastKotNumber: number;
  startedAt: number;
  isClosed: boolean;
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
  minimumStock: number;
  currentStock: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MovementType = 'OPENING' | 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'WASTAGE';

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  type: MovementType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: number;
  notes?: string;
}

export type StockMovement = InventoryMovement;

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  invoiceNumber: string;
  supplierName: string;
  date: string;
  totalAmount: number;
  notes?: string;
  items?: PurchaseItem[];
  createdBy: string;
  createdAt: number;
}

export interface StockAdjustment {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  adjustmentType: 'INCREASE' | 'DECREASE';
  quantity: number;
  reason: string;
  createdBy: string;
  createdAt: number;
}

export interface Wastage {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  reason: string;
  createdBy: string;
  createdAt: number;
}

export interface RestaurantSettings {
  restaurantName: string;
  address: string;
  phone: string;
  logoUrl?: string;
  tagline?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  email?: string;
  gstNumber?: string;
  fssaiNumber?: string;
  paperWidth?: '80mm' | '58mm';
  printerType?: 'THERMAL_80MM' | 'THERMAL_58MM';
  receiptFontSize?: number;
  businessDayStartHour?: string;
  businessDayStart?: string;
  billNumberDigits?: number;
  autoPrintOnSave?: boolean;
  updatedAt?: number;
}

export interface BillingSettings {
  businessDayStart: string; // e.g. "04:00"
  billNumberStart: number;
  discountEnabled: boolean;
  autoPrintAfterSave: boolean;
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
  deviceId?: string;
}

export interface CartItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType: PriceType;
}

export interface BillingDraft {
  id: string;
  screen: 'direct_billing' | 'pos';
  userId?: string;
  userName?: string;
  deviceId: string;
  orderType: OrderType;
  priceType: PriceType;
  tableNumber: string;
  items: (CartItem & { notes?: string })[];
  discount: number;
  discountPercent?: number | null;
  customDiscount?: number;
  cashTendered?: string;
  updatedAt: number;
  itemCount: number;
  subtotal: number;
  grandTotal: number;
}
