import { Bill, BillItem, Kot, KotItem, RestaurantSettings } from '../types';
import { getTamilItemName } from './tamilTranslation';
import { DEFAULT_RESTAURANT_LOGO } from '../data/defaultLogo';

export class PrinterService {
  /**
   * Check if Mock/Silent print mode is enabled (for development/testing without physical printer)
   */
  static isMockPrintMode(): boolean {
    return localStorage.getItem('pos_printer_mock_mode') === 'true';
  }

  static setMockPrintMode(enabled: boolean): void {
    localStorage.setItem('pos_printer_mock_mode', String(enabled));
  }

  /**
   * Generates printable HTML formatted specifically for thermal printers (80mm / 3-inch or 58mm / 2-inch)
   */
  static generateThermalReceiptHTML(
    bill: Bill, 
    items: BillItem[], 
    settings?: RestaurantSettings
  ): string {
    const logoUrl = settings?.logoUrl || DEFAULT_RESTAURANT_LOGO;
    const restaurantName = settings?.restaurantName || 'SRI SARAVANA BHAVAN';
    const address = settings?.address || '104 Grand Avenue, Central Complex';
    const phone = settings?.phone || '+91 78100 66035 / 99769 74098';
    const email = settings?.email || 'srisaravanabhavan57.com';
    const gstNumber = settings?.gstNumber;
    const fssaiNumber = settings?.fssaiNumber;
    const receiptHeader = settings?.receiptHeader || settings?.tagline || 'AUTHENTIC TASTE & QUALITY';
    const receiptFooter = settings?.receiptFooter || 'Thank you for your visit! Please visit again.';

    const createdDate = new Date(bill.createdAt);
    const dateFormatted = createdDate.toLocaleDateString('en-GB'); // DD/MM/YYYY
    const timeFormatted = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const paperWidth = is58mm ? '48mm' : '72mm';
    const baseFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
    const totalQty = items.reduce((sum, itm) => sum + itm.quantity, 0);

    const titleFontSize = Math.round(baseFontSize * 1.25 * 10) / 10;
    const headerFontSize = Math.round(baseFontSize * 0.88 * 10) / 10;
    const metaFontSize = Math.round(baseFontSize * 0.85 * 10) / 10;
    const itemFontSize = baseFontSize;
    const totalFontSize = Math.round(baseFontSize * 1.25 * 10) / 10;
    const smallFontSize = Math.round(baseFontSize * 0.75 * 10) / 10;

    const itemRows = items.map((itm, idx) => {
      const displayNameTamil = getTamilItemName(itm.itemName, itm.itemNameTamil);
      const maxLen = is58mm ? (baseFontSize > 12 ? 11 : 14) : (baseFontSize > 14 ? 18 : 24);
      const cleanName = displayNameTamil.length > maxLen 
        ? displayNameTamil.substring(0, maxLen - 1) + '..' 
        : displayNameTamil;
      
      return `
        <tr>
          <td style="text-align: left; padding: 2px 0; font-family: monospace; font-size: var(--receipt-meta-font-size, ${metaFontSize}px);">${idx + 1}</td>
          <td style="text-align: left; padding: 2px 0; font-family: 'Mukta Malar', 'Noto Sans Tamil', 'Latha', 'Tamil Sangam MN', sans-serif, monospace; font-size: var(--receipt-item-font-size, ${itemFontSize}px); font-weight: 700; line-height: 1.2;">${cleanName}</td>
          <td style="text-align: center; padding: 2px 0; font-family: monospace; font-size: var(--receipt-meta-font-size, ${metaFontSize}px);">${itm.quantity}</td>
          <td style="text-align: right; padding: 2px 0; font-family: monospace; font-size: var(--receipt-meta-font-size, ${metaFontSize}px);">${itm.unitPrice}</td>
          <td style="text-align: right; padding: 2px 0; font-family: monospace; font-size: var(--receipt-item-font-size, ${itemFontSize}px); font-weight: 700;">${itm.totalPrice}</td>
        </tr>
      `;
    }).join('');

    const discountRow = bill.discount > 0 ? `
      <tr>
        <td colspan="3" style="text-align: left; padding: 2px 0; font-weight: 600; color: #111; font-size: var(--receipt-meta-font-size, ${metaFontSize}px);">Discount:</td>
        <td colspan="2" style="text-align: right; font-weight: 700; padding: 2px 0; font-size: var(--receipt-meta-font-size, ${metaFontSize}px);">-${bill.discount}</td>
      </tr>
    ` : '';

    const reprintBadge = bill.reprintCount > 0 ? `
      <div style="text-align: center; border: 1.5px solid #000; padding: 3px; margin: 4px 0; font-size: var(--receipt-meta-font-size, ${metaFontSize}px); font-weight: 800; text-transform: uppercase;">
        *** DUPLICATE / REPRINT (${bill.reprintCount}) ***
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt #${bill.billNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Mukta+Malar:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    :root, #pos-print-root, html, body, .receipt-wrapper {
      --receipt-base-font-size: ${baseFontSize}px;
      --receipt-title-font-size: ${titleFontSize}px;
      --receipt-header-font-size: ${headerFontSize}px;
      --receipt-meta-font-size: ${metaFontSize}px;
      --receipt-item-font-size: ${itemFontSize}px;
      --receipt-total-font-size: ${totalFontSize}px;
      --receipt-small-font-size: ${smallFontSize}px;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Mukta Malar', 'Noto Sans Tamil', 'Latha', 'Tamil Sangam MN', 'Courier New', Courier, monospace;
      font-size: var(--receipt-base-font-size, ${baseFontSize}px);
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: ${paperWidth};
      margin: 0 auto;
      padding: 6px 2px;
      position: relative;
    }
    .receipt-wrapper {
      position: relative;
      width: 100%;
      overflow: hidden;
      font-size: var(--receipt-base-font-size, ${baseFontSize}px);
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: ${is58mm ? '130px' : '170px'};
      height: ${is58mm ? '130px' : '170px'};
      opacity: 0.07;
      pointer-events: none;
      z-index: 0;
    }
    .content {
      position: relative;
      z-index: 1;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .header { text-align: center; margin-bottom: 6px; }
    .receipt-logo-container {
      text-align: center;
      margin-bottom: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .receipt-logo {
      max-width: ${is58mm ? '130px' : '170px'};
      max-height: ${is58mm ? '65px' : '85px'};
      object-fit: contain;
      display: block;
      margin: 0 auto 3px auto;
      filter: contrast(120%);
      -webkit-filter: contrast(120%);
    }
    .restaurant-title { 
      font-size: var(--receipt-title-font-size, ${titleFontSize}px); 
      font-weight: 900; 
      margin-bottom: 2px; 
      letter-spacing: 0.5px;
      text-transform: uppercase; 
    }
    .header-slogan {
      font-size: var(--receipt-header-font-size, ${headerFontSize}px);
      font-weight: 600;
      margin-bottom: 3px;
      font-style: italic;
    }
    .contact-info {
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      line-height: 1.35;
      color: #222;
    }
    .tax-info {
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      margin-top: 2px;
      font-weight: 600;
    }
    .divider-solid { border-top: 1.5px solid #000; margin: 4px 0; }
    .divider-double { border-top: 3px double #000; margin: 4px 0; }
    .divider-dashed { border-top: 1px dashed #000; margin: 4px 0; }
    .meta-table, .items-table, .totals-table { width: 100%; border-collapse: collapse; font-size: var(--receipt-base-font-size, ${baseFontSize}px); }
    .meta-table td { padding: 1.5px 0; vertical-align: top; font-size: var(--receipt-meta-font-size, ${metaFontSize}px); }
    .items-table th { 
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000; 
      padding: 3px 0; 
      text-align: left; 
      font-weight: 800;
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
    }
    .totals-table td { padding: 1.5px 0; }
    .grand-total-row { 
      font-size: var(--receipt-total-font-size, ${totalFontSize}px); 
      font-weight: 900; 
    }
    .summary-qty {
      font-size: var(--receipt-small-font-size, ${smallFontSize}px);
      color: #333;
      padding-bottom: 3px;
    }
    .footer { 
      text-align: center; 
      margin-top: 8px; 
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px); 
      line-height: 1.35;
    }
    .footer-note {
      font-weight: 700;
      margin-bottom: 2px;
    }
    @media print {
      body { width: 100%; margin: 0; padding: 2px; }
      .watermark { opacity: 0.10; }
      #pos-print-root {
        --receipt-base-font-size: ${baseFontSize}px;
        --receipt-title-font-size: ${titleFontSize}px;
        --receipt-header-font-size: ${headerFontSize}px;
        --receipt-meta-font-size: ${metaFontSize}px;
        --receipt-item-font-size: ${itemFontSize}px;
        --receipt-total-font-size: ${totalFontSize}px;
        --receipt-small-font-size: ${smallFontSize}px;
        font-size: var(--receipt-base-font-size, ${baseFontSize}px) !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-wrapper">
    <!-- Centered Watermark Background Logo -->
    <svg class="watermark" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" fill="none">
      <circle cx="100" cy="100" r="92" stroke="#000" stroke-width="2.5" stroke-dasharray="6,4" />
      <circle cx="100" cy="100" r="82" stroke="#000" stroke-width="1.2" />
      <g transform="translate(100, 95)">
        <path d="M-25,-20 C-35,-20 -40,-35 -25,-45 C-25,-55 -5,-60 0,-50 C5,-60 25,-55 25,-45 C40,-35 35,-20 25,-20 Z" stroke="#000" stroke-width="2.2" />
        <path d="M-22,-20 L22,-20 L20,-12 L-20,-12 Z" stroke="#000" stroke-width="2" />
        <path d="M-30,-5 L30,45" stroke="#000" stroke-width="2.5" stroke-linecap="round" />
        <path d="M-35,-10 L-25,0" stroke="#000" stroke-width="2" stroke-linecap="round" />
        <path d="M-38,-6 L-28,4" stroke="#000" stroke-width="2" stroke-linecap="round" />
        <path d="M30,-5 L-30,45" stroke="#000" stroke-width="2.5" stroke-linecap="round" />
        <path d="M22,-13 C32,-3 32,3 22,13 L15,7 Z" stroke="#000" stroke-width="2" />
      </g>
      <text x="100" y="165" font-family="'Courier New', Courier, monospace" font-size="11" font-weight="bold" text-anchor="middle" fill="#000" letter-spacing="2">HOTEL & RESTAURANT</text>
      <text x="100" y="42" font-family="'Courier New', Courier, monospace" font-size="10" font-weight="bold" text-anchor="middle" fill="#000" letter-spacing="3">★ AUTHENTIC DINING ★</text>
    </svg>

    <div class="content">
      <!-- 1. Professional Header -->
      <div class="header">
        ${logoUrl ? `
          <div class="receipt-logo-container">
            <img src="${logoUrl}" alt="${restaurantName}" class="receipt-logo" referrerpolicy="no-referrer" />
          </div>
        ` : ''}
        <div class="restaurant-title">${restaurantName}</div>
        ${receiptHeader ? `<div class="header-slogan">★ ${receiptHeader} ★</div>` : ''}
        <div class="contact-info">
          <div>${address}</div>
          <div>Tel: ${phone}</div>
          ${email ? `<div>Email: ${email}</div>` : ''}
          ${(gstNumber || fssaiNumber) ? `
            <div class="tax-info">
              ${gstNumber ? `GSTIN: ${gstNumber}` : ''}
              ${(gstNumber && fssaiNumber) ? ' | ' : ''}
              ${fssaiNumber ? `FSSAI: ${fssaiNumber}` : ''}
            </div>
          ` : ''}
        </div>
      </div>

      ${reprintBadge}

      <div class="divider-double"></div>

      <!-- 2. Bill Meta Information -->
      <table class="meta-table">
        <tr>
          <td class="bold">Bill No: #${bill.billNumber}</td>
          <td style="text-align: right; font-weight: 600;">${dateFormatted} ${timeFormatted}</td>
        </tr>
        <tr>
          <td>Cashier: <span class="bold">${bill.userName || 'Staff'}</span></td>
          <td style="text-align: right; font-weight: 600;">
            ${bill.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} (${bill.priceType === 'AC' ? 'AC' : 'Non-AC'})
          </td>
        </tr>
        ${bill.tableNumber ? `
          <tr>
            <td colspan="2" class="bold" style="font-size: ${is58mm ? '10px' : '11.5px'};">
              Table / Room: ${bill.tableNumber}
            </td>
          </tr>
        ` : ''}
      </table>

      <!-- 3. Clean Itemized Summary Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 8%; text-align: left;">#</th>
            <th style="width: ${is58mm ? '42%' : '48%'}; text-align: left;">ITEM</th>
            <th style="width: 14%; text-align: center;">QTY</th>
            <th style="width: 18%; text-align: right;">RATE</th>
            <th style="width: 18%; text-align: right;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="divider-dashed"></div>

      <!-- 4. Totals & Financial Breakdown -->
      <div class="summary-qty">
        <span>Total Items: <strong>${items.length}</strong></span> | <span>Total Qty: <strong>${totalQty}</strong></span>
      </div>

      <table class="totals-table">
        <tr>
          <td colspan="3" style="text-align: left;">Subtotal:</td>
          <td colspan="2" style="text-align: right; font-weight: 700;">₹${bill.subtotal}</td>
        </tr>
        ${discountRow}
      </table>

      <div class="divider-double"></div>

      <table class="totals-table">
        <tr class="grand-total-row">
          <td colspan="3" style="text-align: left; padding: 2px 0;">NET PAYABLE:</td>
          <td colspan="2" style="text-align: right; padding: 2px 0;">₹${bill.grandTotal}</td>
        </tr>
      </table>

      <div class="divider-double"></div>

      <!-- 5. Professional Footer -->
      <div class="footer">
        <div class="footer-note">${receiptFooter}</div>
        <div style="font-size: ${is58mm ? '8px' : '9px'}; color: #444; margin-top: 3px;">
          ★ ★ ★ Have a Wonderful Day ★ ★ ★
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates printable KOT slip for kitchen
   */
  static generateKotSlipHTML(kot: Kot, items: KotItem[]): string {
    const createdDate = new Date(kot.createdAt);
    const dateFormatted = createdDate.toLocaleDateString('en-GB');
    const timeFormatted = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const itemRows = items.map((itm, i) => `
      <tr>
        <td style="padding: 2px 0; font-weight: bold; font-size: 13px; font-family: monospace;">${i + 1}. ${itm.itemName}</td>
        <td style="text-align: right; padding: 2px 0; font-weight: bold; font-size: 14px; font-family: monospace;">× ${itm.quantity}</td>
      </tr>
      ${itm.notes ? `<tr><td colspan="2" style="font-style: italic; font-size: 10px; padding-left: 10px;">Note: ${itm.notes}</td></tr>` : ''}
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT - ${kot.kotNumber}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.25;
    }
    body {
      width: 72mm;
      margin: 0 auto;
      padding: 6px 2px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .kot-title { font-size: 16px; font-weight: bold; text-align: center; border: 2px solid #000; padding: 3px; margin-bottom: 5px; }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    @media print {
      body { width: 100%; margin: 0; padding: 2px; }
    }
  </style>
</head>
<body>
  <div class="kot-title">KITCHEN ORDER TICKET</div>
  <table>
    <tr>
      <td class="bold" style="font-size: 14px;">${kot.kotNumber}</td>
      <td style="text-align: right;">${timeFormatted}</td>
    </tr>
    <tr>
      <td class="bold" style="font-size: 14px;">Table: ${kot.tableNumber || 'Take Away'}</td>
      <td style="text-align: right;">Date: ${dateFormatted}</td>
    </tr>
    <tr>
      <td>Type: ${kot.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'}</td>
      <td style="text-align: right;">Waiter: ${kot.waiterName || 'Staff'}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align: left; padding: 2px 0;">Item Name</th>
        <th style="text-align: right; padding: 2px 0;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="divider"></div>
  <div class="center" style="font-size: 11px;">Status: ${kot.status}</div>
</body>
</html>`;
  }

  /**
   * Ultra-fast zero-latency print dispatch:
   * Uses a persistent invisible iframe with direct document write & immediate print trigger.
   * Includes instant fallback to direct in-DOM print portal if iframe printing is sandboxed.
   */
  static printViaIframe(htmlContent: string): void {
    try {
      let iframe = document.getElementById('pos-thermal-printer-frame') as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pos-thermal-printer-frame';
        iframe.setAttribute('style', 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;');
        document.body.appendChild(iframe);
      }

      const contentWindow = iframe.contentWindow;
      if (contentWindow) {
        const doc = contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();

        // Allow styles and images (such as the restaurant logo) to load before triggering print
        const triggerPrint = () => {
          try {
            contentWindow.focus();
            contentWindow.print();
          } catch (iframeErr) {
            console.warn('Iframe print restricted, triggering DOM portal fallback:', iframeErr);
            PrinterService.printViaDirectDOM(htmlContent);
          }
        };

        const img = doc.querySelector('img');
        if (img && !img.complete) {
          img.onload = triggerPrint;
          img.onerror = triggerPrint;
          setTimeout(triggerPrint, 350);
        } else {
          requestAnimationFrame(() => {
            setTimeout(triggerPrint, 50);
          });
        }
      } else {
        PrinterService.printViaDirectDOM(htmlContent);
      }
    } catch (err) {
      console.warn('PrinterService execution notice:', err);
      PrinterService.printViaDirectDOM(htmlContent);
    }
  }

  /**
   * Direct DOM Print Portal:
   * Injects the print content and styles into dedicated top-level container #pos-print-root,
   * sets the 'print-ready' state, and triggers window.print() with strict DOM isolation.
   */
  static printViaDirectDOM(htmlContent: string, settings?: RestaurantSettings): void {
    try {
      let printRoot = document.getElementById('pos-print-root');
      if (!printRoot) {
        printRoot = document.createElement('div');
        printRoot.id = 'pos-print-root';
        printRoot.setAttribute('aria-hidden', 'true');
        document.body.appendChild(printRoot);
      }

      // Configure base font scale custom properties directly on the root element
      const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
      const baseFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
      printRoot.style.setProperty('--receipt-base-font-size', `${baseFontSize}px`);
      printRoot.style.setProperty('--receipt-title-font-size', `${Math.round(baseFontSize * 1.25 * 10) / 10}px`);
      printRoot.style.setProperty('--receipt-header-font-size', `${Math.round(baseFontSize * 0.88 * 10) / 10}px`);
      printRoot.style.setProperty('--receipt-meta-font-size', `${Math.round(baseFontSize * 0.85 * 10) / 10}px`);
      printRoot.style.setProperty('--receipt-item-font-size', `${baseFontSize}px`);
      printRoot.style.setProperty('--receipt-total-font-size', `${Math.round(baseFontSize * 1.25 * 10) / 10}px`);
      printRoot.style.setProperty('--receipt-small-font-size', `${Math.round(baseFontSize * 0.75 * 10) / 10}px`);
      printRoot.style.fontSize = `${baseFontSize}px`;

      // Extract styles and body content to ensure 100% fidelity
      const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
      const styles = styleMatches.join('\n');
      const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const innerContent = bodyMatch ? bodyMatch[1] : htmlContent;

      printRoot.innerHTML = `${styles}\n${innerContent}`;
      printRoot.setAttribute('data-print-ready', 'true');
      document.body.classList.add('pos-printing', 'print-ready');

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        document.body.classList.remove('pos-printing', 'print-ready');
        if (printRoot) {
          printRoot.removeAttribute('data-print-ready');
          printRoot.innerHTML = '';
        }
        window.removeEventListener('afterprint', cleanup);
      };

      window.addEventListener('afterprint', cleanup, { once: true });
      // Generous safety cleanup (45s) so print preview rendering is never interrupted
      setTimeout(cleanup, 45000);

      requestAnimationFrame(() => {
        try {
          window.focus();
          window.print();
        } catch (printErr) {
          console.warn('window.print() direct invocation notice:', printErr);
          // Fallback to iframe printing
          PrinterService.printViaIframe(htmlContent);
        }
      });
    } catch (err) {
      console.warn('Direct DOM print failed, attempting iframe:', err);
      PrinterService.printViaIframe(htmlContent);
    }
  }

  /**
   * Directly prints a bill receipt instantly (0ms delay).
   * In Mock/Dev Testing mode, only bypasses if forceHardware is explicitly set to false.
   * Defaults to forceHardware = true to guarantee bill printing.
   */
  static printBill(bill: Bill, items: BillItem[], settings?: RestaurantSettings, forceHardware = true): void {
    if (!forceHardware && PrinterService.isMockPrintMode()) {
      console.log(`[POS Dev Mode] Simulated instant thermal print for Bill #${bill.billNumber} (₹${bill.grandTotal})`);
      return;
    }
    const html = PrinterService.generateThermalReceiptHTML(bill, items, settings);
    
    // Use iframe printing first (best for thermal isolation without UI disruption), with direct DOM fallback
    PrinterService.printViaIframe(html);
    // Also prepare Direct DOM container for standard browser print triggers
    PrinterService.printViaDirectDOM(html, settings);

    // Notify any listening components
    window.dispatchEvent(new CustomEvent('pos-bill-printed', {
      detail: { bill, items, settings }
    }));
  }

  /**
   * Directly prints a KOT ticket instantly (0ms delay).
   */
  static printKot(kot: Kot, items: KotItem[], forceHardware = true): void {
    if (!forceHardware && PrinterService.isMockPrintMode()) {
      console.log(`[POS Dev Mode] Simulated instant thermal print for KOT #${kot.kotNumber}`);
      return;
    }
    const html = PrinterService.generateKotSlipHTML(kot, items);
    PrinterService.printViaIframe(html);
  }
}
