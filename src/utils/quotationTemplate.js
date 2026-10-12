import html2canvas from 'html2canvas';
import logo from '../assets/logo.png';
import { numberToWords } from './invoice';

/**
 * Generate a clean, branded HTML string for a Quotation
 */
export function getQuotationHtml(quotation) {
  const quotationNo = quotation.quotationNo || `QT-${Date.now().toString().slice(-6)}`;
  const dateStr = quotation.quotationDate || new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  
  const toName = quotation.toName || 'Valued Customer';
  const mobile = quotation.mobileNumber || '-';
  const business = quotation.businessName || '';
  const email = quotation.email || '';
  const address = quotation.address || '';

  const subtotal = Number(quotation.subtotal || 0);
  const discountAmount = Number(quotation.discountAmount || 0);
  const grandTotal = Number(quotation.grandTotal || 0);
  const discountType = quotation.discountType || 'amount';
  const discountValue = quotation.discountValue || 0;

  const items = Array.isArray(quotation.items) ? quotation.items : [];

  const itemsRows = items.map((it, idx) => {
    const isWeight = it.unit === 'Weight';
    const qtyStr = isWeight ? `${Number(it.quantity || 0).toFixed(3)} kg` : `${it.quantity || 1} pcs`;
    const rateStr = `₹${Number(it.price || 0).toFixed(2)} / ${isWeight ? 'kg' : 'pc'}`;
    const amountStr = `₹${Number(it.total || 0).toFixed(2)}`;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #fafbfc;' : ''}">
        <td style="padding: 10px 12px; text-align: center; font-size: 13px; color: #64748b;">${idx + 1}</td>
        <td style="padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 600; color: #1e293b;">
          ${it.name || 'Product'}
        </td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #475569;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${isWeight ? '#fef3c7' : '#e0f2fe'}; color: ${isWeight ? '#92400e' : '#0369a1'}; font-weight: 500;">
            ${isWeight ? 'Weight' : 'Piece'}
          </span>
        </td>
        <td style="padding: 10px 12px; text-align: right; font-size: 13px; font-weight: 600; color: #0f172a;">
          ${qtyStr}
        </td>
        <td style="padding: 10px 12px; text-align: right; font-size: 13px; color: #475569;">
          ${rateStr}
        </td>
        <td style="padding: 10px 12px; text-align: right; font-size: 13px; font-weight: 700; color: #0A2A1B;">
          ${amountStr}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family: 'Sora', 'Segoe UI', Roboto, sans-serif; width: 750px; background: #ffffff; color: #1e293b; padding: 36px 40px; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 12px;">
      
      <!-- Header with Logo and Brand -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #0A2A1B;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <img src="${logo}" alt="Raju Ghee Sweets" style="height: 64px; width: auto; object-fit: contain;" />
          <div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0A2A1B; letter-spacing: -0.5px;">RAJU GHEE SWEETS</h1>
            <p style="margin: 2px 0 0; font-size: 12px; color: #D4AF37; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Pure Ghee Sweets & Traditional Savouries</p>
            <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Specialist in Homemade Sweets & Wholesale Catering</p>
          </div>
        </div>

        <div style="text-align: right;">
          <div style="display: inline-block; background: #0A2A1B; color: #ffffff; padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
            ESTIMATE / QUOTATION
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #475569;">
            <strong>Ref #:</strong> <span style="color: #0A2A1B; font-weight: 700;">${quotationNo}</span>
          </div>
          <div style="margin-top: 3px; font-size: 12px; color: #64748b;">
            <strong>Date:</strong> ${dateStr}
          </div>
          <div style="margin-top: 2px; font-size: 11px; color: #16a34a; font-weight: 600;">
            Valid For: 15 Days
          </div>
        </div>
      </div>

      <!-- Bill To & Client Information -->
      <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; margin: 24px 0 20px; background: #f8fafc; padding: 18px 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
        <div>
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">QUOTATION FOR / CLIENT DETAILS</span>
          <div style="font-size: 16px; font-weight: 700; color: #0A2A1B; margin-bottom: 4px;">${toName}</div>
          ${business ? `<div style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 3px;">🏢 ${business}</div>` : ''}
          <div style="font-size: 13px; color: #475569; margin-bottom: 2px;">📞 <strong>Phone:</strong> ${mobile}</div>
          ${email ? `<div style="font-size: 12px; color: #475569; margin-bottom: 2px;">✉️ <strong>Email:</strong> ${email}</div>` : ''}
          ${address ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">📍 <strong>Address:</strong> ${address}</div>` : ''}
        </div>

        <div style="border-left: 1px dashed #cbd5e1; padding-left: 20px;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">ISSUED BY</span>
          <div style="font-size: 14px; font-weight: 700; color: #0A2A1B;">RAJU GHEE SWEETS</div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">Premium Sweet Manufacturing & Retail</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">📞 +91 94949 49494 / +91 98480 12345</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">✉️ sales@rajugheesweets.com</div>
        </div>
      </div>

      <!-- Products Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #0A2A1B; color: #ffffff;">
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: center; width: 40px;">#</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: left;">Product / Item Description</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: center; width: 80px;">Type</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: right; width: 100px;">Weight / Qty</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: right; width: 110px;">Unit Rate</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: right; width: 110px;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">No items added</td></tr>'}
        </tbody>
      </table>

      <!-- Calculations and Amount in Words -->
      <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start;">
        
        <div style="background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 6px;">Total Amount in Words:</div>
          <div style="font-size: 13px; font-weight: 700; color: #0A2A1B; line-height: 1.4;">
            ${numberToWords(Math.round(grandTotal))}
          </div>

          <div style="margin-top: 14px; font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
            <strong style="color: #475569;">Terms & Conditions:</strong><br/>
            1. This quotation is an estimate and valid for 15 days from issuance.<br/>
            2. Bulk packaging and gift pack customization available upon order confirmation.<br/>
            3. Delivery charges as applicable based on location.
          </div>
        </div>

        <div style="background: #ffffff; border: 1.5px solid #0A2A1B; border-radius: 8px; padding: 14px 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 8px;">
            <span>Subtotal:</span>
            <span style="font-weight: 600; color: #1e293b;">₹${subtotal.toFixed(2)}</span>
          </div>

          ${discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #16a34a; margin-bottom: 8px; font-weight: 600;">
              <span>Discount (${discountType === 'percent' ? `${discountValue}%` : '₹'}):</span>
              <span>- ₹${discountAmount.toFixed(2)}</span>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: space-between; font-size: 17px; font-weight: 800; color: #0A2A1B; border-top: 2px solid #0A2A1B; padding-top: 10px; margin-top: 6px;">
            <span>Grand Total:</span>
            <span>₹${grandTotal.toFixed(2)}</span>
          </div>

          <div style="margin-top: 24px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 12px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 24px;">For Raju Ghee Sweets</div>
            <div style="font-size: 12px; font-weight: 700; color: #0A2A1B;">Authorised Signatory</div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
        Thank you for choosing Raju Ghee Sweets! Taste the authentic pure ghee tradition.
      </div>

    </div>
  `;
}

/**
 * Render quotation to high-res base64 image using html2canvas
 * @param {Object} quotation 
 * @returns {Promise<string>} Base64 image data url
 */
export async function renderQuotationToImage(quotation) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.zIndex = '-1000';
  container.innerHTML = getQuotationHtml(quotation);

  document.body.appendChild(container);

  try {
    // Wait for fonts and logo image to load
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(container.firstElementChild, {
      scale: 2, // retina 2x quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    return dataUrl;
  } finally {
    document.body.removeChild(container);
  }
}
