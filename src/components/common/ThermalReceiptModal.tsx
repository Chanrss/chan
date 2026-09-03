import React, { useEffect } from 'react';
import { Printer, X, Check, Copy } from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { PrinterService } from '../../services/printerService';
import { getTamilItemName } from '../../services/tamilTranslation';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';

interface ThermalReceiptModalProps {
  bill: Bill | null;
  items: BillItem[];
  settings?: RestaurantSettings;
  isOpen: boolean;
  onClose: () => void;
  onPrint?: () => void | Promise<void>;
  isReprint?: boolean;
  printButtonText?: string;
  isPrinting?: boolean;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  bill,
  items,
  settings,
  isOpen,
  onClose,
  onPrint,
  isReprint = false,
  printButtonText,
  isPrinting = false
}) => {
  if (!isOpen || !bill) return null;

  const handlePrint = async () => {
    if (onPrint) {
      await onPrint();
    } else {
      PrinterService.printBill(bill, items, settings, true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleModalKey = (e: KeyboardEvent) => {
      if (e.key === 'F10' || (e.ctrlKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleModalKey);
    return () => window.removeEventListener('keydown', handleModalKey);
  }, [isOpen, bill, items, settings, onPrint]);

  const createdDate = new Date(bill.createdAt);
  const dateFormatted = createdDate.toLocaleDateString('en-GB');
  const timeFormatted = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
  const baseFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
  const nextReprintNum = (bill.reprintCount || 0) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isReprint ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                {isReprint ? `Thermal Receipt Preview (Reprint)` : `Thermal Receipt Preview`}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Bill #{bill.billNumber} • {is58mm ? '58mm Paper' : '80mm Paper'}
                {isReprint && <span className="text-amber-400 font-bold ml-1.5">• Duplicate #{nextReprintNum}</span>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice banner for reprint preview */}
        {isReprint && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-900 text-xs flex items-center justify-between shrink-0">
            <span className="font-medium">
              Review receipt details below before triggering the printer.
            </span>
            <span className="font-mono text-[11px] font-bold bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded">
              PREVIEW ONLY
            </span>
          </div>
        )}

        {/* Receipt Preview Container */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex justify-center flex-1 min-h-0">
          <div 
            id="thermal-receipt-preview" 
            style={{
              fontSize: `${baseFontSize}px`,
              ['--receipt-base-font-size' as any]: `${baseFontSize}px`
            }}
            className={`relative ${is58mm ? 'w-[230px]' : 'w-[280px]'} bg-white p-4 shadow-md border border-slate-300 font-mono leading-tight text-black select-text overflow-hidden transition-all`}
          >
            {/* Center Background Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] select-none z-0">
              <svg className="w-48 h-48 text-black" viewBox="0 0 200 200" fill="none">
                <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6,4" />
                <circle cx="100" cy="100" r="82" stroke="currentColor" strokeWidth="1.2" />
                <g transform="translate(100, 95)">
                  {/* Chef Toque */}
                  <path d="M-25,-20 C-35,-20 -40,-35 -25,-45 C-25,-55 -5,-60 0,-50 C5,-60 25,-55 25,-45 C40,-35 35,-20 25,-20 Z" stroke="currentColor" strokeWidth="2.2" />
                  <path d="M-22,-20 L22,-20 L20,-12 L-20,-12 Z" stroke="currentColor" strokeWidth="2" />
                  {/* Crossed cutlery */}
                  <path d="M-30,-5 L30,45" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M-35,-10 L-25,0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M-38,-6 L-28,4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M30,-5 L-30,45" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M22,-13 C32,-3 32,3 22,13 L15,7 Z" stroke="currentColor" strokeWidth="2" />
                </g>
                <text x="100" y="165" fontFamily="monospace" fontSize="11" fontWeight="bold" textAnchor="middle" fill="currentColor" letterSpacing="2">HOTEL & RESTAURANT</text>
                <text x="100" y="42" fontFamily="monospace" fontSize="10" fontWeight="bold" textAnchor="middle" fill="currentColor" letterSpacing="3">★ PREMIUM DINING ★</text>
              </svg>
            </div>

            {/* Receipt Content Container */}
            <div className="relative z-10">
              {/* 1. Professional Header */}
              <div className="text-center mb-2.5">
                {(settings?.logoUrl || DEFAULT_RESTAURANT_LOGO) && (
                  <div className="flex justify-center items-center mb-2">
                    <img 
                      src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
                      alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'} 
                      className="max-h-16 max-w-[160px] object-contain drop-shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="font-extrabold text-[14px] uppercase tracking-wider text-black">
                  {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
                </div>
                {(settings?.receiptHeader || settings?.tagline) && (
                  <div className="text-[10px] font-semibold text-slate-800 italic mt-0.5">
                    ★ {settings?.receiptHeader || settings?.tagline} ★
                  </div>
                )}
                <div className="text-[9.5px] text-slate-700 mt-1 leading-snug">
                  <div>{settings?.address || '104 Grand Avenue, Central Complex'}</div>
                  <div>Tel: {settings?.phone || '+91 78100 66035 / 99769 74098'}</div>
                  {(settings?.email || 'srisaravanabhavan57.com') && <div>Email: {settings?.email || 'srisaravanabhavan57.com'}</div>}
                  {(settings?.gstNumber || settings?.fssaiNumber) && (
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {settings?.gstNumber ? `GSTIN: ${settings.gstNumber}` : ''}
                      {(settings?.gstNumber && settings?.fssaiNumber) ? ' | ' : ''}
                      {settings?.fssaiNumber ? `FSSAI: ${settings.fssaiNumber}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {(isReprint || bill.reprintCount > 0) && (
                <div className="text-center border-2 border-black py-0.5 my-1.5 text-[10px] font-black uppercase tracking-wider bg-slate-50">
                  *** DUPLICATE / REPRINT ({bill.reprintCount ? (isReprint ? bill.reprintCount + 1 : bill.reprintCount) : 1}) ***
                </div>
              )}

              <div className="border-t-2 border-dashed border-black my-2" />

              {/* 2. Bill Meta: Bill No, Date & Time, Cashier, Order Type, Table */}
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-black">Bill No: #{bill.billNumber}</span>
                  <span className="font-mono">{dateFormatted} {timeFormatted}</span>
                </div>
                <div className="flex justify-between items-center text-slate-800">
                  <span>Cashier: <strong className="text-black">{bill.userName || 'Staff'}</strong></span>
                  <span className="font-medium">{bill.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} ({bill.priceType === 'AC' ? 'AC' : 'Non-AC'})</span>
                </div>
                {bill.tableNumber && (
                  <div className="font-bold text-black text-[10.5px]">
                    Table / Room: {bill.tableNumber}
                  </div>
                )}
              </div>

              {/* 3. Clean Itemized Summary Table */}
              <table className="w-full text-[10px] mt-2">
                <thead>
                  <tr className="border-y border-dashed border-black text-left">
                    <th className="py-1 w-6 font-bold">#</th>
                    <th className="py-1 font-bold">ITEM</th>
                    <th className="py-1 text-center font-bold w-8">QTY</th>
                    <th className="py-1 text-right font-bold w-12">RATE</th>
                    <th className="py-1 text-right font-bold w-12">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dotted divide-slate-300">
                  {items.map((item, idx) => {
                    const tamilName = getTamilItemName(item.itemName, item.itemNameTamil);
                    return (
                      <tr key={idx}>
                        <td className="py-1 text-slate-500 font-mono text-[9px]">{idx + 1}</td>
                        <td className="py-1 pr-1 font-bold text-slate-900 truncate max-w-[120px] text-[11px] leading-tight font-sans">
                          {tamilName}
                        </td>
                        <td className="py-1 text-center font-mono">{item.quantity}</td>
                        <td className="py-1 text-right font-mono">₹{item.unitPrice}</td>
                        <td className="py-1 text-right font-bold font-mono">₹{item.totalPrice}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-dashed border-black my-1.5" />

              {/* 4. Quantity Summary & Financial Totals */}
              <div className="flex justify-between text-[9px] text-slate-600 mb-1">
                <span>Total Items: <strong>{items.length}</strong></span>
                <span>Total Qty: <strong>{items.reduce((s, itm) => s + itm.quantity, 0)}</strong></span>
              </div>

              <div className="space-y-0.5 text-[10.5px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-bold font-mono">₹{bill.subtotal}</span>
                </div>
                {bill.discount > 0 && (
                  <div className="flex justify-between font-bold text-red-700">
                    <span>Discount:</span>
                    <span className="font-mono">-₹{bill.discount}</span>
                  </div>
                )}
                <div className="border-t-2 border-double border-black pt-1 mt-1 flex justify-between text-[13px] font-black text-black">
                  <span>NET PAYABLE:</span>
                  <span className="font-mono">₹{bill.grandTotal}</span>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-black my-2" />

              {/* 5. Professional Footer */}
              <div className="text-center text-[9.5px] text-slate-700 mt-2 space-y-0.5">
                <div className="font-bold text-black">{settings?.receiptFooter || 'Thank you for your visit! Please visit again.'}</div>
                <div className="text-[8.5px] text-slate-500">★ ★ ★ Have a Wonderful Day ★ ★ ★</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            {isReprint ? 'Confirm print to send duplicate to thermal printer' : 'Ready to print'}
          </div>
          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className={`flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                isReprint 
                  ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 shadow-amber-600/20' 
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing...' : (printButtonText || (isReprint ? 'Confirm & Print Reprint' : 'Print Receipt (F10)'))}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
