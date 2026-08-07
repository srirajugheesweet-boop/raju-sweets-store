/**
 * Receipt Printing Helper for Raju Ghee Sweets
 * Generates exact ESC/POS binary data and HTML layouts matching physical thermal receipts.
 */

// Converts numbers into Indian Rupee words (e.g., 240 -> "TWO HUNDRED FORTY RUPEES ONLY")
export const numberToWords = (num) => {
  const a = ['', 'ONE ', 'TWO ', 'THREE ', 'FOUR ', 'FIVE ', 'SIX ', 'SEVEN ', 'EIGHT ', 'NINE ', 'TEN ', 'ELEVEN ', 'TWELVE ', 'THIRTEEN ', 'FOURTEEN ', 'FIFTEEN ', 'SIXTEEN ', 'SEVENTEEN ', 'EIGHTEEN ', 'NINETEEN '];
  const b = ['', '', 'TWENTY ', 'THIRTY ', 'FORTY ', 'FIFTY ', 'SIXTY ', 'SEVENTY ', 'EIGHTY ', 'NINETY '];

  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_arr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_arr) return '';
    let str = '';
    str += (n_arr[1] != 0) ? (a[Number(n_arr[1])] || b[n_arr[1][0]] + ' ' + a[n_arr[1][1]]) + 'CRORE ' : '';
    str += (n_arr[2] != 0) ? (a[Number(n_arr[2])] || b[n_arr[2][0]] + ' ' + a[n_arr[2][1]]) + 'LAKH ' : '';
    str += (n_arr[3] != 0) ? (a[Number(n_arr[3])] || b[n_arr[3][0]] + ' ' + a[n_arr[3][1]]) + 'THOUSAND ' : '';
    str += (n_arr[4] != 0) ? (a[Number(n_arr[4])] || b[n_arr[4][0]] + ' ' + a[n_arr[4][1]]) + 'HUNDRED ' : '';
    str += (n_arr[5] != 0) ? ((str != '') ? 'AND ' : '') + (a[Number(n_arr[5])] || b[n_arr[5][0]] + ' ' + a[n_arr[5][1]]) : '';
    return str.trim();
  };

  const amountInt = Math.floor(Math.abs(Number(num) || 0));
  const paise = Math.round((Math.abs(Number(num) || 0) - amountInt) * 100);

  let result = amountInt === 0 ? 'ZERO RUPEES' : inWords(amountInt) + ' RUPEES';
  if (paise > 0) {
    result += ' AND ' + inWords(paise) + ' PAISE';
  }
  return result + ' ONLY';
};

/**
 * Returns formatted HTML for 80mm thermal receipt matching physical bill layout.
 */
export const generateReceiptHTML = (bill) => {
  const totalVal = Number(bill.totalAmount || 0);
  const discountVal = Number(bill.discount || 0);
  const grossVal = totalVal + discountVal;
  const taxableVal = totalVal / 1.05;
  const taxAmtVal = totalVal - taxableVal;
  const cgstVal = taxAmtVal / 2;
  const sgstVal = taxAmtVal / 2;
  const totalQty = (bill.items || []).reduce((acc, i) => acc + (i.unit === 'Weight' ? 1 : Number(i.quantity || 1)), 0);

  const formattedDate = bill.date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  const formattedTime = bill.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const itemsRows = (bill.items || []).map(item => `
    <tr>
      <td colspan="4" style="padding-top: 3px; font-weight: bold; text-align: left;">${item.name} ${item.unit === 'Weight' ? `${item.quantity} KG` : ''}</td>
    </tr>
    <tr>
      <td style="text-align: right;">${Number(item.quantity).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price).toFixed(2)}</td>
      <td style="text-align: right; font-weight: bold;">${Number(item.total).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${bill.billId}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            padding: 2px;
            color: #000;
            background: #fff;
          }
          .right { text-align: right; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .solid-divider { border-top: 1px solid #000; margin: 4px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: 11px; }
          th { padding: 2px 0; border-bottom: 1px dashed #000; }
          td { padding: 1px 0; }
          @media print { body { width: 72mm; } }
        </style>
      </head>
      <body>
        <div class="right" style="font-size: 10px;">Customer Copy</div>
        <div class="center bold" style="font-size: 16px; margin-top: 2px;">SRI RAJU SWEETS</div>
        <div class="center" style="font-size: 10px; margin-top: 2px; line-height: 1.2;">
          56-11-20B, OPP JD TOWERS, PATAMATA MAIN ROAD, VIJAYAWADA, ANDHRA PRADESH, 520010
        </div>
        <div class="center bold" style="font-size: 10px; margin-top: 2px;">
          PHONE: 9244757677
        </div>
        <div class="center bold" style="font-size: 10px;">
          GSTIN: 37DFJPK6083N1ZO
        </div>
        <div class="divider"></div>

        <div style="font-size: 11px;">
          <div>Customer: ${bill.customerName || 'Walk-in Customer'}</div>
          ${bill.customerPhone ? `<div>Mobile: ${bill.customerPhone}</div>` : ''}
          ${bill.companyName ? `<div class="bold" style="margin-top: 2px;">${bill.companyName}</div>` : ''}
          ${(bill.customerGst || bill.gstNumber) ? `<div class="bold">PH ${bill.customerPhone || ''} GST ${bill.customerGst || bill.gstNumber}</div>` : ''}
        </div>

        <div class="center bold" style="font-size: 13px; margin: 6px 0 3px;">
          Tax Invoice/Bill of Supply
        </div>
        <div class="solid-divider"></div>

        <div class="info-row bold" style="font-size: 12px;">
          <span>Bill No. <span style="font-size: 16px;">${bill.billId}</span></span>
          <span>Date <b>${formattedDate}</b> &nbsp; ${formattedTime}</span>
        </div>
        <div class="solid-divider"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;" colspan="4">Product</th>
            </tr>
            <tr>
              <th class="right" style="width: 25%;">Qty</th>
              <th class="right" style="width: 25%;">Mrp</th>
              <th class="right" style="width: 25%;">S.Price</th>
              <th class="right" style="width: 25%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <div class="solid-divider"></div>

        ${discountVal > 0 ? `
          <div class="info-row"><span>Gross Total</span><span>₹ ${grossVal.toFixed(2)}</span></div>
          <div class="info-row" style="color: #dc2626;"><span>Discount</span><span>-₹ ${discountVal.toFixed(2)}</span></div>
          <div class="solid-divider"></div>
        ` : ''}

        <div class="info-row bold" style="font-size: 16px; margin: 4px 0;">
          <span>Net Amount :</span>
          <span style="font-size: 20px;">₹ ${totalVal.toFixed(2)}</span>
        </div>
        <div class="solid-divider"></div>

        <div class="bold" style="font-size: 11px; margin-bottom: 2px;">GST Summary</div>
        <div class="solid-divider" style="margin-top: 0;"></div>
        <table style="font-size: 10px; width: 100%;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">Taxable</th>
              <th class="right">CGST</th>
              <th class="right">SGST</th>
              <th class="right">IGST</th>
              <th class="right">CESS</th>
              <th class="right">Tax Amt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="6" style="padding-top: 3px;"><b>GST 5%</b></td>
            </tr>
            <tr>
              <td style="text-align: left;">${taxableVal.toFixed(2)}</td>
              <td class="right">${cgstVal.toFixed(2)}</td>
              <td class="right">${sgstVal.toFixed(2)}</td>
              <td class="right">0.00</td>
              <td class="right">0.00</td>
              <td class="right">${taxAmtVal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px dashed #000; font-weight: bold;">
              <td style="text-align: left;">${taxableVal.toFixed(2)}</td>
              <td class="right">${cgstVal.toFixed(2)}</td>
              <td class="right">${sgstVal.toFixed(2)}</td>
              <td class="right">0.00</td>
              <td class="right">0.00</td>
              <td class="right">${taxAmtVal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div class="solid-divider"></div>

        <div style="font-size: 10px; font-weight: bold; margin: 4px 0;">
          Word: <i>${numberToWords(totalVal)}</i>
        </div>
        <div class="solid-divider"></div>

        <div class="info-row">
          <span>Counter : 1</span>
          <span><b>${bill.paymentMode || 'CASH'}-${totalVal.toFixed(0)}</b></span>
        </div>
        <div class="info-row">
          <span>User : admin</span>
          <span>Tot Qty : ${totalQty}</span>
        </div>
        <div class="divider"></div>

        <div class="center bold" style="font-size: 11px; margin-top: 4px;">
          *** Thank you & Visit Again ***
        </div>
      </body>
    </html>
  `;
};
