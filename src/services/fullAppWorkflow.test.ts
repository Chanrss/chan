import { describe, it, expect, vi } from 'vitest';
import { BillingEngine } from './billingEngine';
import { formatBillNumber, getBusinessDate } from './billNumberEngine';
import { PrinterService } from './printerService';
import { getTamilItemName } from './tamilTranslation';
import { CartItem, MenuItem, RestaurantSettings, Bill } from '../types';

describe('Full POS Lifecycle Automated End-to-End Suite', () => {
  const restaurantSettings: RestaurantSettings = {
    restaurantName: 'Sri Saravana Bhavan',
    address: '104 Grand Avenue, Central Complex, Chennai',
    phone: '+91 78100 66035 / 99769 74098',
    email: 'srisaravanabhavan57.com',
    gstNumber: '33AABCS1429B1Z',
    fssaiNumber: '12423002000456',
    tagline: 'AUTHENTIC TASTE & QUALITY',
    receiptHeader: 'SRI SARAVANA BHAVAN',
    receiptFooter: 'Thank you for visiting! Please visit again.',
    paperWidth: '80mm',
    receiptFontSize: 12,
    autoPrintOnSave: true
  };

  const menuItems: MenuItem[] = [
    {
      id: 'm_dosa',
      itemCode: '101',
      categoryId: 'cat_tiffin',
      itemName: 'Masala Dosa',
      itemNameTamil: 'மசால் தோசை',
      nonAcPrice: 70,
      acPrice: 85,
      active: true,
      createdAt: 1724000000000,
      updatedAt: 1724000000000
    },
    {
      id: 'm_coffee',
      itemCode: '102',
      categoryId: 'cat_beverage',
      itemName: 'Filter Coffee',
      itemNameTamil: 'ஃபில்டர் காபி',
      nonAcPrice: 30,
      acPrice: 40,
      active: true,
      createdAt: 1724000000000,
      updatedAt: 1724000000000
    }
  ];

  it('executes complete billing cycle from item addition to thermal print & duplicate reprint', () => {
    // 1. Customer orders in Non-AC
    const cart: CartItem[] = [
      {
        itemId: menuItems[0].id,
        itemCode: menuItems[0].itemCode,
        itemName: menuItems[0].itemName,
        itemNameTamil: menuItems[0].itemNameTamil,
        quantity: 2, // 2 * 70 = 140
        priceType: 'NON_AC',
        unitPrice: BillingEngine.getApplicablePrice(menuItems[0], 'NON_AC'),
        totalPrice: BillingEngine.calculateLineTotal(menuItems[0], 2, 'NON_AC')
      },
      {
        itemId: menuItems[1].id,
        itemCode: menuItems[1].itemCode,
        itemName: menuItems[1].itemName,
        itemNameTamil: menuItems[1].itemNameTamil,
        quantity: 1, // 1 * 30 = 30
        priceType: 'NON_AC',
        unitPrice: BillingEngine.getApplicablePrice(menuItems[1], 'NON_AC'),
        totalPrice: BillingEngine.calculateLineTotal(menuItems[1], 1, 'NON_AC')
      }
    ];

    // 2. Financial calculation check
    const subtotal = BillingEngine.calculateSubtotal(cart);
    expect(subtotal).toBe(170);

    const discount = 10;
    const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);
    expect(grandTotal).toBe(160);

    // 3. Business date determination & sequential formatting
    const fixedTime = new Date('2026-08-28T12:00:00Z');
    const businessDate = getBusinessDate('04:00', fixedTime);
    expect(businessDate).toBe('2026-08-28');

    const formattedBillNum = formatBillNumber(42);
    expect(formattedBillNum).toBe('42');

    // 4. Instant Bill Preparation
    const { bill, items } = BillingEngine.prepareBillForDirectPrint(
      cart,
      'DINE_IN',
      'NON_AC',
      'T-04',
      discount,
      'CASH',
      'Cashier Raman',
      'cashier_uid_1',
      formattedBillNum,
      businessDate
    );

    expect(bill.billNumber).toBe('42');
    expect(bill.subtotal).toBe(170);
    expect(bill.discount).toBe(10);
    expect(bill.grandTotal).toBe(160);
    expect(bill.reprintCount).toBe(0);
    expect(items.length).toBe(2);

    // 5. Thermal Receipt Generation (Original)
    const originalReceipt = PrinterService.generateThermalReceiptHTML(bill, items, restaurantSettings);
    expect(originalReceipt).toContain('ஸ்ரீ சரவண பவன்');
    expect(originalReceipt).toContain('Bill No: #42');
    expect(originalReceipt).toContain('GSTIN: 33AABCS1429B1Z');
    expect(originalReceipt).toContain('FSSAI: 12423002000456');
    expect(originalReceipt).toContain('160'); // Grand Total
    // Check Tamil script in thermal receipt output
    expect(originalReceipt).toContain('மசால் தோசை');
    expect(originalReceipt).toContain('ஃபில்டர் காபி');
    // Ensure original receipt does not have DUPLICATE / REPRINT banner
    expect(originalReceipt).not.toContain('*** DUPLICATE / REPRINT');

    // 6. Duplicate Reprint Simulation
    const duplicateBill: Bill = {
      ...bill,
      reprintCount: 1
    };

    const duplicateReceipt = PrinterService.generateThermalReceiptHTML(duplicateBill, items, restaurantSettings);
    expect(duplicateReceipt).toContain('*** DUPLICATE / REPRINT (1) ***');
    expect(duplicateReceipt).toContain('Bill No: #42');
  });

  it('verifies AC pricing differential logic across order items', () => {
    const nonAcDosaPrice = BillingEngine.getApplicablePrice(menuItems[0], 'NON_AC');
    const acDosaPrice = BillingEngine.getApplicablePrice(menuItems[0], 'AC');

    expect(nonAcDosaPrice).toBe(70);
    expect(acDosaPrice).toBe(85);
    expect(acDosaPrice).toBeGreaterThan(nonAcDosaPrice);
  });
});
