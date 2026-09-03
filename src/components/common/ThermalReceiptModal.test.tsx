import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { PrinterService } from '../../services/printerService';

vi.mock('../../services/printerService', () => ({
  PrinterService: {
    printBill: vi.fn()
  }
}));

const sampleBill: Bill = {
  id: 'b_modal_1',
  billNumber: '55',
  businessDate: '2026-08-28',
  orderType: 'DINE_IN',
  priceType: 'NON_AC',
  tableNumber: 'T-09',
  subtotal: 100,
  discount: 10,
  grandTotal: 90,
  paymentMethod: 'CASH',
  paymentStatus: 'PAID',
  status: 'COMPLETED',
  createdAt: 1724800000000,
  reprintCount: 0
};

const sampleItems: BillItem[] = [
  {
    id: 'bi_1',
    billId: 'b_modal_1',
    itemId: 'm_dosa',
    itemCode: '101',
    itemName: 'Masala Dosa',
    quantity: 1,
    unitPrice: 70,
    totalPrice: 70,
    priceType: 'NON_AC',
    businessDate: '2026-08-28',
    createdAt: 1724800000000
  },
  {
    id: 'bi_2',
    billId: 'b_modal_1',
    itemId: 'm_coffee',
    itemCode: '102',
    itemName: 'Filter Coffee',
    quantity: 1,
    unitPrice: 30,
    totalPrice: 30,
    priceType: 'NON_AC',
    businessDate: '2026-08-28',
    createdAt: 1724800000000
  }
];

const sampleSettings: RestaurantSettings = {
  restaurantName: 'Sri Saravana Bhavan',
  address: '104 Grand Avenue, Chennai',
  phone: '+91 78100 66035'
};

describe('ThermalReceiptModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ThermalReceiptModal
        isOpen={false}
        bill={sampleBill}
        items={sampleItems}
        settings={sampleSettings}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders receipt preview with bill details when isOpen is true', () => {
    render(
      <ThermalReceiptModal
        isOpen={true}
        bill={sampleBill}
        items={sampleItems}
        settings={sampleSettings}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Bill #55/i)).toBeInTheDocument();
    expect(screen.getByText('Sri Saravana Bhavan')).toBeInTheDocument();
    expect(screen.getByText(/T-09/i)).toBeInTheDocument();
    expect(screen.getByText('₹90')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ThermalReceiptModal
        isOpen={true}
        bill={sampleBill}
        items={sampleItems}
        settings={sampleSettings}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onPrint callback when print button is clicked', () => {
    const handlePrint = vi.fn();
    render(
      <ThermalReceiptModal
        isOpen={true}
        bill={sampleBill}
        items={sampleItems}
        settings={sampleSettings}
        onClose={vi.fn()}
        onPrint={handlePrint}
      />
    );

    // Look for print button
    const printButtons = screen.getAllByRole('button');
    const printActionBtn = printButtons.find((btn) => btn.textContent?.includes('Print'));
    expect(printActionBtn).toBeDefined();

    if (printActionBtn) {
      fireEvent.click(printActionBtn);
      expect(handlePrint).toHaveBeenCalledTimes(1);
    }
  });

  it('displays duplicate reprint banner when isReprint is true', () => {
    render(
      <ThermalReceiptModal
        isOpen={true}
        bill={sampleBill}
        items={sampleItems}
        settings={sampleSettings}
        isReprint={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/DUPLICATE \/ REPRINT/i)).toBeInTheDocument();
  });
});
