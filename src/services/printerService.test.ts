import { describe, it, expect } from 'vitest';
import { PrinterService } from './printerService';
import { Bill, BillItem, Kot, RestaurantSettings } from '../types';

describe('PrinterService thermal receipt formatting', () => {
  const sampleBill: Bill = {
    id: 'bill-123',
    billNumber: '42',
    businessDate: '2026-08-28',
    orderType: 'DINE_IN',
    priceType: 'NON_AC',
    tableNumber: 'T4',
    subtotal: 100,
    discount: 10,
    grandTotal: 90,
    status: 'COMPLETED',
    reprintCount: 0,
    userId: 'staff_1',
    userName: 'Cashier John',
    createdAt: 1724810000000,
    updatedAt: 1724810000000
  };

  const sampleItems: BillItem[] = [
    {
      id: 'bi-1',
      billId: 'bill-123',
      itemId: 'm1',
      itemCode: '101',
      itemName: 'Masala Dosa',
      quantity: 1,
      unitPrice: 70,
      totalPrice: 70,
      priceType: 'NON_AC',
      createdAt: 1724810000000
    },
    {
      id: 'bi-2',
      billId: 'bill-123',
      itemId: 'm2',
      itemCode: '201',
      itemName: 'Filter Coffee',
      quantity: 1,
      unitPrice: 30,
      totalPrice: 30,
      priceType: 'NON_AC',
      createdAt: 1724810000000
    }
  ];

  const sampleSettings: RestaurantSettings = {
    restaurantName: 'Anand Bhavan Hotel',
    address: '123 Main Bazaar, Chennai',
    phone: '+91 98765 43210',
    tagline: 'Authentic South Indian Taste'
  };

  it('generates 80mm thermal receipt HTML with correct restaurant header & details', () => {
    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, sampleSettings);

    expect(html).toContain('Anand Bhavan Hotel');
    expect(html).toContain('123 Main Bazaar, Chennai');
    expect(html).toContain('Bill No: #42');
    // Either Tamil translated name or English item name
    expect(html.includes('மசால் தோசை') || html.includes('Masala Dosa')).toBe(true);
    expect(html.includes('ஃபில்டர் காபி') || html.includes('Filter Coffee')).toBe(true);
    expect(html).toContain('70');
    expect(html).toContain('30');
    expect(html).toContain('90');
    expect(html).toContain('Thank you');
  });

  it('generates 58mm thermal receipt with tailored compact width', () => {
    const settings58: RestaurantSettings = {
      ...sampleSettings,
      printerType: 'THERMAL_58MM'
    };
    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, settings58);

    expect(html).toContain('width: 48mm');
    expect(html).toContain('font-size: 10px');
    expect(html).toContain('Anand Bhavan Hotel');
  });

  it('includes reprint indicator if reprintCount > 0', () => {
    const reprintBill: Bill = {
      ...sampleBill,
      reprintCount: 2
    };
    const html = PrinterService.generateThermalReceiptHTML(reprintBill, sampleItems, sampleSettings);

    expect(html).toContain('*** DUPLICATE / REPRINT (2) ***');
  });

  it('generates printable KOT slip with table, items, and quantities', () => {
    const kot: Kot = {
      id: 'kot-1',
      kotNumber: 'KOT-05',
      businessDate: '2026-08-28',
      orderType: 'DINE_IN' as const,
      tableNumber: 'T-2',
      waiterId: 'w-1',
      waiterName: 'Ramesh',
      status: 'OPEN' as const,
      itemsCount: 3,
      createdBy: 'Ramesh',
      createdAt: 1724810000000,
      updatedAt: 1724810000000
    };

    const kotItems = [
      {
        id: 'ki-1',
        kotId: 'kot-1',
        itemId: 'm1',
        itemCode: '101',
        itemName: 'Ghee Roast Dosa',
        quantity: 2,
        priceType: 'NON_AC' as const,
        unitPrice: 80,
        notes: 'Extra crispy',
        createdAt: 1724810000000,
        updatedAt: 1724810000000
      }
    ];

    const kotHtml = PrinterService.generateKotSlipHTML(kot, kotItems);
    expect(kotHtml).toContain('KITCHEN ORDER TICKET');
    expect(kotHtml).toContain('KOT-05');
    expect(kotHtml).toContain('Table: T-2');
    expect(kotHtml).toContain('Ghee Roast Dosa');
    expect(kotHtml).toContain('× 2');
    expect(kotHtml).toContain('Note: Extra crispy');
  });

  it('supports toggling mock dev print mode', () => {
    PrinterService.setMockPrintMode(true);
    expect(PrinterService.isMockPrintMode()).toBe(true);

    PrinterService.setMockPrintMode(false);
    expect(PrinterService.isMockPrintMode()).toBe(false);
  });
});
