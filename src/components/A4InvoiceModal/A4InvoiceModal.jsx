import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  X, 
  Phone, 
  Check, 
  Share2,
  Loader2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.png';
import { numberToWords } from '../../utils/printReceiptHelper';
import { formatPaymentModeDisplay } from '../SplitPaymentSelector/SplitPaymentSelector';
import { uploadInvoiceImage } from '../../utils/cloudinary';
import { openWhatsAppWithInvoice } from '../../utils/whatsapp';
import { getCachedInvoiceSettings, subscribeInvoiceSettings } from '../../utils/invoiceSettings';
import './A4InvoiceModal.css';

const A4InvoiceModal = ({ bill, onClose }) => {
  const invoiceRef = useRef(null);
  const [targetPhone, setTargetPhone] = useState(bill?.customerPhone || '');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState(() => getCachedInvoiceSettings());

  useEffect(() => {
    const unsubscribe = subscribeInvoiceSettings(setInvoiceSettings);
    return unsubscribe;
  }, []);

  if (!bill) return null;

  const activeLogoUrl = invoiceSettings.logoUrl || logo;
  const activeSignatureUrl = invoiceSettings.signatureUrl || '';

  // Invoice & GST Calculations
  const isIGST = Boolean(bill.isIGST);
  const igstRateVal = isIGST ? Number(bill.igstRate || 5) : 5;
  const totalAmount = Number(bill.totalAmount || 0);
  const discountVal = Number(bill.discount || 0);
  const grossSubtotal = totalAmount + discountVal;

  let taxableVal, taxAmtVal, cgstVal, sgstVal, igstVal;
  if (isIGST) {
    if (bill.igstAmount !== undefined && Number(bill.igstAmount) > 0) {
      igstVal = Number(bill.igstAmount);
      taxableVal = totalAmount - igstVal;
      taxAmtVal = igstVal;
    } else {
      taxableVal = totalAmount / (1 + (igstRateVal / 100));
      taxAmtVal = totalAmount - taxableVal;
      igstVal = taxAmtVal;
    }
    cgstVal = 0;
    sgstVal = 0;
  } else {
    taxableVal = totalAmount / 1.05;
    taxAmtVal = totalAmount - taxableVal;
    cgstVal = taxAmtVal / 2;
    sgstVal = taxAmtVal / 2;
    igstVal = 0;
  }

  const billDate = bill.date || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));
  const billTime = bill.time || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
  const storeName = bill.tradeName || bill.storeName || 'SRI RAJU SWEETS';
  const outletLocation = bill.storeName && bill.storeName !== bill.tradeName ? bill.storeName : 'Main Branch';
  const storeAddress = bill.storeAddress || (bill.storeCity ? `${bill.storeCity}, ${bill.storeState || 'AP'}` : '56-11-20B, OPP JD TOWERS, PATAMATA MAIN ROAD, VIJAYAWADA, AP 520010');
  const storeGst = bill.storeGstNumber || bill.storeGst || '37DFJPK6083N1ZO';
  const storePhone = bill.storePhone || '9244757677';

  const items = Array.isArray(bill.items) ? bill.items : [];

  // Download high-resolution A4 PDF
  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return;
    setIsDownloading(true);
    const toastId = toast.loading('Generating A4 PDF invoice...');

    try {
      // High-resolution canvas rendering
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, // 2x for sharp printing quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      const margin = 8; // 8mm margin
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (contentHeight <= pdfHeight - (margin * 2)) {
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      } else {
        // Multi-page handling if invoice has dozens of items
        let heightLeft = contentHeight;
        let position = margin;

        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
        heightLeft -= (pdfHeight - (margin * 2));

        while (heightLeft > 0) {
          position = heightLeft - contentHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
          heightLeft -= (pdfHeight - (margin * 2));
        }
      }

      const filename = `Invoice_${bill.billId || 'POS'}.pdf`;
      pdf.save(filename);
      toast.success('Invoice PDF downloaded successfully!', { id: toastId });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF. You can also use Print to save as PDF.', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  // Send PDF via WhatsApp
  const handleSendWhatsApp = async () => {
    if (!invoiceRef.current) return;

    setIsSendingWhatsApp(true);
    const toastId = toast.loading('Preparing invoice and opening WhatsApp...');

    try {
      // 1. Generate high-res image of the A4 invoice
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 1.8,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // 2. Upload to Cloudinary to create a permanent shareable link
      let secureInvoiceUrl = '';
      try {
        const uploadRes = await uploadInvoiceImage(imageDataUrl, bill.billId || bill.id);
        if (uploadRes && uploadRes.secureUrl) {
          secureInvoiceUrl = uploadRes.secureUrl;
        }
      } catch (uploadErr) {
        console.warn('Cloudinary upload warning (will send text invoice fallback):', uploadErr);
      }

      // 3. Open WhatsApp with prefilled message & link
      openWhatsAppWithInvoice({
        bill,
        phone: targetPhone,
        invoiceUrl: secureInvoiceUrl
      });

      toast.success('WhatsApp opened with invoice details!', { id: toastId });
    } catch (err) {
      console.error('WhatsApp invoice sending error:', err);
      // Fallback: still open WhatsApp even if image generation had an issue
      openWhatsAppWithInvoice({
        bill,
        phone: targetPhone,
        invoiceUrl: ''
      });
      toast.success('WhatsApp opened!', { id: toastId });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Direct Browser Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="a4-modal-overlay" onClick={onClose}>
      <div className="a4-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Toolbar Header */}
        <div className="a4-modal-header">
          <div className="a4-header-title-box">
            <div className="a4-header-icon">
              <FileText size={20} />
            </div>
            <div className="a4-header-text">
              <h3>A4 Tax Invoice Preview - Bill #{bill.billId || 'POS'}</h3>
              <p>{storeName} • {billDate} {billTime}</p>
            </div>
          </div>

          <div className="a4-header-actions">
            {/* Phone Number Input for WhatsApp */}
            <div className="a4-phone-input-group" title="Recipient mobile number for WhatsApp">
              <Phone size={13} color="#64748b" />
              <input 
                type="tel" 
                placeholder="WhatsApp Number..."
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
              />
            </div>

            {/* Send WhatsApp Button */}
            <button 
              className="a4-btn a4-btn-whatsapp" 
              onClick={handleSendWhatsApp}
              disabled={isSendingWhatsApp}
              title="Upload invoice and send via WhatsApp"
            >
              {isSendingWhatsApp ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              <span>{isSendingWhatsApp ? 'Sending...' : 'Send WhatsApp'}</span>
            </button>

            {/* Download PDF Button */}
            <button 
              className="a4-btn a4-btn-download" 
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              title="Download high-resolution A4 PDF invoice"
            >
              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
            </button>

            {/* Print Button */}
            <button 
              className="a4-btn a4-btn-print" 
              onClick={handlePrint}
              title="Print A4 invoice"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>

            {/* Close Button */}
            <button 
              className="a4-btn-close" 
              onClick={onClose}
              title="Close Preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable Canvas with A4 Paper */}
        <div className="a4-modal-body">
          <div className="a4-sheet" ref={invoiceRef}>
            
            {/* 1. Brand Header */}
            <div className="a4-brand-header">
              <div className="a4-brand-left">
                <img
                  src={activeLogoUrl}
                  alt="Raju Ghee Sweets"
                  className="a4-logo"
                  crossOrigin="anonymous"
                />
                <div>
                  <h1 className="a4-company-name">RAJU GHEE SWEETS</h1>
                  <div className="a4-tagline">Pure Ghee Sweets & Traditional Savouries</div>
                  <div className="a4-store-details">
                    <div><strong>Outlet:</strong> {storeName} ({outletLocation})</div>
                    <div>{storeAddress}</div>
                    <div>Phone: <strong>+91 {storePhone}</strong></div>
                    <div className="a4-gst-highlight">GSTIN: {storeGst} | State: Andhra Pradesh (37)</div>
                  </div>
                </div>
              </div>

              <div className="a4-brand-right">
                <div className="a4-invoice-badge">Tax Invoice</div>
                <div className="a4-original-subtext">(ORIGINAL FOR RECIPIENT)</div>
                <div className="a4-meta-list">
                  <div><strong>Invoice No:</strong> {bill.billId || bill.id || 'POS'}</div>
                  <div><strong>Date:</strong> {billDate}</div>
                  <div><strong>Time:</strong> {billTime}</div>
                  <div><strong>Payment Mode:</strong> {formatPaymentModeDisplay(bill)}</div>
                  {isIGST && (
                    <div style={{ marginTop: '3px' }}>
                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800' }}>
                        IGST Invoice ({igstRateVal}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Bill From & Bill To 2-Column Section */}
            <div className="a4-party-grid">
              <div className="a4-party-box">
                <div className="a4-party-title">Details of Seller (Bill From)</div>
                <div className="a4-party-name">RAJU GHEE SWEETS</div>
                <div className="a4-party-info">
                  <div>Branch / Outlet: {storeName}</div>
                  <div>Address: {storeAddress}</div>
                  <div>GSTIN: <strong>{storeGst}</strong></div>
                  <div>State: Andhra Pradesh (State Code: 37)</div>
                  <div>Contact: +91 {storePhone}</div>
                </div>
              </div>

              <div className="a4-party-box">
                <div className="a4-party-title">Details of Buyer / Customer (Bill To)</div>
                <div className="a4-party-name">{bill.customerName || 'Walk-in Customer'}</div>
                <div className="a4-party-info">
                  {bill.companyName && <div><strong>Company:</strong> {bill.companyName}</div>}
                  <div>Phone / Mobile: <strong>{bill.customerPhone ? `+91 ${bill.customerPhone}` : 'Walk-in'}</strong></div>
                  {bill.customerAddress && <div>Address: {bill.customerAddress}</div>}
                  {(bill.customerGst || bill.gstNumber) && (
                    <div style={{ color: '#047857', fontWeight: '700' }}>
                      Customer GSTIN: {bill.customerGst || bill.gstNumber}
                    </div>
                  )}
                  <div>Payment Status: <strong>{bill.status === 'saved' ? 'Saved (Draft)' : 'Settled & Paid'}</strong></div>
                </div>
              </div>
            </div>

            {/* 3. Itemized Purchased Products Table */}
            <table className="a4-items-table">
              <thead>
                <tr>
                  <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                  <th style={{ width: '38%', textAlign: 'left' }}>Product Name / Description</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>HSN</th>
                  <th style={{ width: '13%', textAlign: 'center' }}>Qty / Weight</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Unit Rate</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Taxable Val</th>
                  {!isIGST ? (
                    <>
                      <th style={{ width: '10%', textAlign: 'right' }}>CGST (2.5%)</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>SGST (2.5%)</th>
                    </>
                  ) : (
                    <th style={{ width: '12%', textAlign: 'right' }}>IGST ({igstRateVal}%)</th>
                  )}
                  <th style={{ width: '13%', textAlign: 'right' }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? (
                  items.map((item, idx) => {
                    const itemQty = Number(item.quantity || 1);
                    const itemPrice = Number(item.price || 0);
                    const itemTotal = Number(item.total != null ? item.total : (itemQty * itemPrice));
                    const isWeight = item.unit === 'Weight' || item.weightUnit;
                    const formattedQty = isWeight ? `${itemQty} kg` : `${itemQty} ${item.unit || 'pcs'}`;

                    const rate = isIGST ? igstRateVal : 5;
                    const itemTaxable = itemTotal / (1 + (rate / 100));
                    const itemGST = itemTotal - itemTaxable;

                    return (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: '600' }}>{idx + 1}</td>
                        <td>
                          <div className="a4-item-name">{item.name || 'Unnamed Product'}</div>
                          {item.category && <div className="a4-item-cat">{item.category}</div>}
                        </td>
                        <td style={{ textAlign: 'center', color: '#475569' }}>{item.hsnCode || '2106'}</td>
                        <td style={{ textAlign: 'center', fontWeight: '600' }}>{formattedQty}</td>
                        <td style={{ textAlign: 'right', color: '#334155' }}>₹{itemPrice.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: '#334155' }}>₹{itemTaxable.toFixed(2)}</td>
                        {!isIGST ? (
                          <>
                            <td style={{ textAlign: 'right', color: '#64748b', fontSize: '10px' }}>
                              ₹{(itemGST / 2).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b', fontSize: '10px' }}>
                              ₹{(itemGST / 2).toFixed(2)}
                            </td>
                          </>
                        ) : (
                          <td style={{ textAlign: 'right', color: '#64748b', fontSize: '10px' }}>
                            ₹{itemGST.toFixed(2)}
                          </td>
                        )}
                        <td style={{ textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                          ₹{itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isIGST ? 8 : 9} style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                      No item rows found for this bill.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 4. Financial Calculations & Summary Grid */}
            <div className="a4-summary-grid">
              {/* Left Column: Amount in Words, Tax Breakup, Bank Details */}
              <div className="a4-summary-left">
                {/* Amount in words */}
                <div className="a4-words-box">
                  <div className="a4-words-label">Invoice Amount in Words:</div>
                  <div className="a4-words-text">{numberToWords(Math.round(totalAmount))}</div>
                </div>

                {/* GST Breakup */}
                <div className="a4-tax-breakdown-box">
                  <strong>GST Tax Summary:</strong>
                  {!isIGST ? (
                    <div>
                      <div>• Total Taxable Value: ₹{taxableVal.toFixed(2)}</div>
                      <div>• CGST @ 2.5%: ₹{cgstVal.toFixed(2)}</div>
                      <div>• SGST @ 2.5%: ₹{sgstVal.toFixed(2)}</div>
                      <div>• Total GST Tax: ₹{taxAmtVal.toFixed(2)}</div>
                    </div>
                  ) : (
                    <div>
                      <div>• Total Taxable Value: ₹{taxableVal.toFixed(2)}</div>
                      <div>• IGST @ {igstRateVal}%: ₹{igstVal.toFixed(2)}</div>
                      <div>• Total GST Tax: ₹{taxAmtVal.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Bank Details */}
                <div className="a4-bank-box">
                  <div className="a4-bank-title">Bank Details for Direct / RTGS Payment:</div>
                  <div><strong>Bank Name:</strong> HDFC Bank</div>
                  <div><strong>Account Name:</strong> RAJU GHEE SWEETS</div>
                  <div><strong>Account Number:</strong> 50200046843751</div>
                  <div><strong>IFSC Code:</strong> HDFC0009088</div>
                  <div><strong>Branch:</strong> Satyanarayanapuram, Vijayawada</div>
                </div>
              </div>

              {/* Right Column: Financial Totals Table */}
              <div>
                <table className="a4-totals-table">
                  <tbody>
                    <tr>
                      <td style={{ color: '#475569' }}>Gross Subtotal:</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{grossSubtotal.toFixed(2)}</td>
                    </tr>

                    {discountVal > 0 && (
                      <tr style={{ color: '#dc2626' }}>
                        <td>Discount Applied:</td>
                        <td style={{ textAlign: 'right', fontWeight: '700' }}>-₹{discountVal.toFixed(2)}</td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ color: '#475569' }}>Total Taxable Value:</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{taxableVal.toFixed(2)}</td>
                    </tr>

                    {!isIGST ? (
                      <>
                        <tr>
                          <td style={{ color: '#475569' }}>CGST @ 2.5%:</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{cgstVal.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#475569' }}>SGST @ 2.5%:</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{sgstVal.toFixed(2)}</td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td style={{ color: '#0284c7' }}>IGST @ {igstRateVal}%:</td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{igstVal.toFixed(2)}</td>
                      </tr>
                    )}

                    <tr className="a4-grand-total-row">
                      <td>Grand Total (Incl. Taxes):</td>
                      <td style={{ textAlign: 'right' }}>₹{totalAmount.toFixed(2)}</td>
                    </tr>

                    <tr>
                      <td style={{ color: '#475569' }}>Payment Mode:</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatPaymentModeDisplay(bill)}</td>
                    </tr>

                    <tr>
                      <td style={{ color: '#475569' }}>Amount Received:</td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>
                        ₹{Number(bill.receivedAmount != null ? bill.receivedAmount : totalAmount).toFixed(2)}
                      </td>
                    </tr>

                    {Math.max(0, totalAmount - Number(bill.receivedAmount != null ? bill.receivedAmount : totalAmount)) > 0 && (
                      <tr style={{ color: '#dc2626', fontWeight: '700' }}>
                        <td>Balance Due:</td>
                        <td style={{ textAlign: 'right' }}>
                          ₹{Math.max(0, totalAmount - Number(bill.receivedAmount)).toFixed(2)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Terms & Signatures */}
            <div className="a4-bottom-section">
              <div className="a4-terms-box">
                <strong style={{ color: '#334155' }}>Terms & Conditions:</strong><br />
                1. Goods once sold will not be accepted back or exchanged.<br />
                2. Keep sweets in a cool, dry place / refrigerated to preserve taste & aroma.<br />
                3. Subject to Vijayawada legal jurisdiction.<br />
                4. This is a computer generated invoice and requires no physical seal or signature.
              </div>

              <div className="a4-signatory-box">
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: activeSignatureUrl ? '4px' : '26px' }}>
                  For Raju Ghee Sweets
                </div>
                {activeSignatureUrl && (
                  <img
                    src={activeSignatureUrl}
                    alt="Authorised Signature"
                    className="a4-signature-img"
                    crossOrigin="anonymous"
                  />
                )}
                <div className="a4-sign-line">Authorised Signatory</div>
              </div>
            </div>

            {/* Footer */}
            <div className="a4-footer-thanks">
              Thank you for shopping with Raju Ghee Sweets! Taste the authentic pure ghee tradition. 🙏
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default A4InvoiceModal;

