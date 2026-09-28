import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { 
  Barcode, 
  Printer, 
  Calendar, 
  Tag, 
  Usb, 
  Settings2,
  Package,
  Eye,
  FileText,
  HelpCircle,
  ExternalLink,
  X,
  Sparkles,
  RefreshCw,
  Building2,
  Layers,
  Trash2,
  Plus
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrinter } from '../../context/PrinterContext';
import './CustomBarcode.css';

// Default store branding header
const DEFAULT_STORE_NAME = "SRI RAJU SWEETS";

// Helper to format ISO YYYY-MM-DD into Indian standard DD/MM/YYYY
export const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch (_) {}
  return dateStr;
};

// Helper to get today's date in YYYY-MM-DD
const getTodayDateISO = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Helper to compute date offset in days from a starting date
const getDateOffsetISO = (baseDateStr, days) => {
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  const target = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const CustomBarcode = () => {
  const { 
    qzConnected, 
    qzPrinters,
    selectedQZPrinter, 
    showQZModal,
    showQZSetupGuide,
    setShowQZModal,
    setShowQZSetupGuide,
    connectQZTray, 
    confirmQZPrinter,
    disconnectQZTray,
    printRawUSB,
    printHTMLContent,
    webUsbConnected,
    webUsbDevice,
    handleWebUSBConnect,
    disconnectWebUSB,
    printRawWebUSB
  } = usePrinter();

  // Firestore items for optional quick fill
  const [items, setItems] = useState([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');

  // The 5 Exact Required Sticker Fields:
  // 1. Store Name
  // 2. Name (Product Name)
  // 3. Manufacturing Date (MFD)
  // 4. Expiry Date (EXP)
  // 5. Price
  const [storeName, setStoreName] = useState(DEFAULT_STORE_NAME);
  const [itemName, setItemName] = useState('Special Ghee Laddu');
  const [mfgDate, setMfgDate] = useState(getTodayDateISO());
  const [expDate, setExpDate] = useState(getDateOffsetISO(getTodayDateISO(), 30));
  const [price, setPrice] = useState('360');

  // Print Settings: Number of prints
  const [quantity, setQuantity] = useState(1);

  // Printer roll settings (with localStorage persistence)
  const savedSettings = (() => {
    try {
      const s = localStorage.getItem('raju_barcode_settings');
      return s ? JSON.parse(s) : null;
    } catch (_) { return null; }
  })();

  const [labelColumns, setLabelColumns] = useState(savedSettings?.columns ?? 2); // 2-Up Roll
  const [labelWidth, setLabelWidth] = useState(savedSettings?.width ?? 50); // 50mm
  const [labelHeight, setLabelHeight] = useState(savedSettings?.height ?? 25); // 25mm
  const [labelGap, setLabelGap] = useState(savedSettings?.gap ?? 3); // 3mm
  const [labelDirection, setLabelDirection] = useState(savedSettings?.direction ?? 0); // 0 or 1
  const [xOffset, setXOffset] = useState(savedSettings?.xOffset ?? 0);
  const [yOffset, setYOffset] = useState(savedSettings?.yOffset ?? 0);
  const [showSettings, setShowSettings] = useState(false);

  // Optional batch print queue
  const [printQueue, setPrintQueue] = useState([]);

  // Fetch products from Firestore for quick selection
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemData);
    }, (err) => {
      console.warn("Notice: Firestore items snapshot:", err);
    });
    return () => unsubscribe();
  }, []);

  // When user picks an item from the pre-fill dropdown
  const handleSelectCatalogItem = (e) => {
    const id = e.target.value;
    setSelectedCatalogId(id);
    if (!id) return;

    const found = items.find(i => i.id === id);
    if (found) {
      setItemName(found.name || '');
      setPrice((Number(found.price) || 0).toString());
      toast.success(`Loaded "${found.name}"`);
    }
  };

  // Set expiry date quickly based on days offset from manufacturing date
  const applyExpiryDaysOffset = (days) => {
    const newExp = getDateOffsetISO(mfgDate, days);
    setExpDate(newExp);
  };

  // Flatten stickers list for printing
  const getStickersList = (isBatch = false) => {
    if (isBatch) {
      const flat = [];
      printQueue.forEach(item => {
        const count = Number(item.quantity) || 1;
        for (let i = 0; i < count; i++) {
          flat.push({
            storeName: item.storeName || storeName,
            itemName: item.itemName,
            mfgFormatted: item.mfgFormatted,
            expFormatted: item.expFormatted,
            price: item.price
          });
        }
      });
      return flat;
    } else {
      const count = Number(quantity) || 1;
      const singleObj = {
        storeName: storeName.trim() || DEFAULT_STORE_NAME,
        itemName: itemName.trim() || 'Product Name',
        mfgFormatted: formatDateDisplay(mfgDate),
        expFormatted: formatDateDisplay(expDate),
        price: Number(price) || 0
      };
      return Array.from({ length: count }).map(() => singleObj);
    }
  };

  // --- TSPL Buffer Generator with ONLY Store Name, Item Name, MFD, EXP, Price ---
  const buildTSPLBuffer = (stickerItems) => {
    let tspl = '';
    const cols = Number(labelColumns);
    const singleW = Number(labelWidth) || 50;
    const gapW = Number(labelGap) || 3;
    const singleH = Number(labelHeight) || 25;
    const totalWidthMm = cols === 2 ? (singleW * 2 + gapW) : singleW;

    for (let i = 0; i < stickerItems.length; i += cols) {
      const col1 = stickerItems[i];
      const col2 = cols === 2 ? stickerItems[i + 1] : null;

      tspl += `
SIZE ${totalWidthMm} mm, ${singleH} mm
GAP 2 mm, 0 mm
DIRECTION ${labelDirection}
CLS
`;

      // --- COLUMN 1 (LEFT STICKER) ---
      const x1 = 12 + Number(xOffset);
      const y1 = 6 + Number(yOffset);
      tspl += `
TEXT ${70 + x1}, ${10 + y1}, "3", 0, 1, 1, "${col1.storeName}"
TEXT ${15 + x1}, ${52 + y1}, "3", 0, 1, 1, "${col1.itemName.substring(0, 18)}"
TEXT ${15 + x1}, ${95 + y1}, "2", 0, 1, 1, "MFD: ${col1.mfgFormatted}"
TEXT ${210 + x1}, ${95 + y1}, "2", 0, 1, 1, "EXP: ${col1.expFormatted}"
TEXT ${15 + x1}, ${135 + y1}, "3", 0, 1, 1, "PRICE: Rs.${col1.price}/-"
`;

      // --- COLUMN 2 (RIGHT STICKER) ---
      if (col2) {
        const x2 = 430 + Number(xOffset);
        const y2 = 6 + Number(yOffset);
        tspl += `
TEXT ${70 + x2}, ${10 + y2}, "3", 0, 1, 1, "${col2.storeName}"
TEXT ${15 + x2}, ${52 + y2}, "3", 0, 1, 1, "${col2.itemName.substring(0, 18)}"
TEXT ${15 + x2}, ${95 + y2}, "2", 0, 1, 1, "MFD: ${col2.mfgFormatted}"
TEXT ${210 + x2}, ${95 + y2}, "2", 0, 1, 1, "EXP: ${col2.expFormatted}"
TEXT ${15 + x2}, ${135 + y2}, "3", 0, 1, 1, "PRICE: Rs.${col2.price}/-"
`;
      }

      tspl += `PRINT 1\n`;
    }

    return tspl;
  };

  // --- HTML 2-Column Row-Based Generator for Browser / Windows Driver Print ---
  const buildPrintHTML = (stickerItems) => {
    const cols = Number(labelColumns);
    const singleW = Number(labelWidth) || 50;
    const singleH = Number(labelHeight) || 25;
    const gapW = Number(labelGap) || 3;
    const totalWidthMm = cols === 2 ? (singleW * 2 + gapW) : singleW;

    const rows = [];
    for (let i = 0; i < stickerItems.length; i += cols) {
      if (cols === 2) {
        rows.push({
          left: stickerItems[i],
          right: stickerItems[i + 1] || null
        });
      } else {
        rows.push({
          left: stickerItems[i],
          right: null
        });
      }
    }

    const rowsHtml = rows.map((row, rIdx) => {
      return `
        <div class="sticker-print-row" key="row-${rIdx}">
          <!-- LEFT STICKER -->
          <div class="print-sticker-card custom-clean-sticker">
            <div class="sticker-store-name">${row.left.storeName}</div>
            <div class="sticker-item-name">${row.left.itemName}</div>
            <div class="sticker-dates-row">
              <span>MFD: ${row.left.mfgFormatted}</span>
              <span>EXP: ${row.left.expFormatted}</span>
            </div>
            <div class="sticker-price-row">
              PRICE: ₹${row.left.price}/-
            </div>
          </div>

          ${cols === 2 ? (
            row.right ? `
              <!-- RIGHT STICKER -->
              <div class="print-sticker-card custom-clean-sticker">
                <div class="sticker-store-name">${row.right.storeName}</div>
                <div class="sticker-item-name">${row.right.itemName}</div>
                <div class="sticker-dates-row">
                  <span>MFD: ${row.right.mfgFormatted}</span>
                  <span>EXP: ${row.right.expFormatted}</span>
                </div>
                <div class="sticker-price-row">
                  PRICE: ₹${row.right.price}/-
                </div>
              </div>
            ` : `
              <div class="print-sticker-card blank-sticker"></div>
            `
          ) : ''}
        </div>
      `;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Custom Stickers - Raju Ghee Sweets</title>
          <style>
            @page {
              size: ${totalWidthMm}mm ${singleH}mm;
              margin: 0mm !important;
            }
            * {
              box-sizing: border-box !important;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              width: ${totalWidthMm}mm !important;
            }
            .printable-stickers-container {
              width: ${totalWidthMm}mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .sticker-print-row {
              display: flex !important;
              flex-direction: row !important;
              justify-content: space-between !important;
              align-items: stretch !important;
              width: ${totalWidthMm}mm !important;
              height: ${singleH}mm !important;
              max-height: ${singleH}mm !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .print-sticker-card {
              width: ${cols === 2 ? `${singleW - 1.5}mm` : `${singleW - 1}mm`} !important;
              height: ${singleH - 0.5}mm !important;
              max-height: ${singleH - 0.5}mm !important;
              border: none !important;
              padding: 1.2mm 2mm !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              overflow: hidden !important;
              font-family: Arial, Helvetica, sans-serif !important;
              color: #000000 !important;
              background: #ffffff !important;
            }
            .print-sticker-card.blank-sticker {
              visibility: hidden !important;
              border: none !important;
            }
            .sticker-store-name {
              text-align: center !important;
              font-size: 8.5pt !important;
              font-weight: 900 !important;
              line-height: 1.1 !important;
              letter-spacing: 0.3px !important;
              text-transform: uppercase !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              border-bottom: 0.3mm solid #000000 !important;
              padding-bottom: 0.5mm !important;
            }
            .sticker-item-name {
              font-size: 8.5pt !important;
              font-weight: 800 !important;
              line-height: 1.2 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              margin: 0.5mm 0 !important;
            }
            .sticker-dates-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              font-size: 7pt !important;
              font-weight: 700 !important;
              line-height: 1 !important;
              margin: 0.3mm 0 !important;
            }
            .sticker-price-row {
              font-size: 9.5pt !important;
              font-weight: 900 !important;
              line-height: 1.1 !important;
              border-top: 0.3mm solid #000000 !important;
              padding-top: 0.5mm !important;
            }
          </style>
        </head>
        <body>
          <div class="printable-stickers-container">
            ${rowsHtml}
          </div>
        </body>
      </html>
    `;
  };

  const printStickersViaIframe = (isBatch = false) => {
    const stickerList = getStickersList(isBatch);
    if (stickerList.length === 0) {
      toast.error("No items to print");
      return;
    }
    const fullHtml = buildPrintHTML(stickerList);
    printHTMLContent(fullHtml);
  };

  // --- Primary Print Handler: Prints Directly to Connected Device ---
  const handlePrint = async () => {
    if (!itemName.trim()) {
      toast.error("Please enter product name");
      return;
    }

    const copyQty = Number(quantity) || 1;

    // 1. If WebUSB thermal printer is connected -> print directly via WebUSB
    if (webUsbConnected) {
      const toastId = toast.loading(`Sending ${copyQty} sticker(s) to WebUSB printer...`);
      try {
        const stickerItems = getStickersList(false);
        const tsplCode = buildTSPLBuffer(stickerItems);
        const encoder = new TextEncoder();
        await printRawWebUSB(encoder.encode(tsplCode));
        toast.success(`Printed ${copyQty} sticker(s) directly via WebUSB!`, { id: toastId });
        return;
      } catch (err) {
        console.error("WebUSB Print Error:", err);
        toast.error(`WebUSB error: ${err.message || 'Check USB'}. Opening print dialog...`, { id: toastId });
        setTimeout(() => printStickersViaIframe(false), 200);
        return;
      }
    }

    // 2. If QZ Tray desktop printer is connected -> print directly via QZ Tray
    if (qzConnected && selectedQZPrinter) {
      const toastId = toast.loading(`Printing ${copyQty} sticker(s) to ${selectedQZPrinter}...`);
      try {
        const stickerItems = getStickersList(false);
        const tsplCode = buildTSPLBuffer(stickerItems);
        const encoder = new TextEncoder();
        await printRawUSB(encoder.encode(tsplCode));
        toast.success(`Printed ${copyQty} sticker(s) via USB printer!`, { id: toastId });
        return;
      } catch (err) {
        console.error("QZ USB Print Error:", err);
        toast.error(`Printer notice: ${err.message || 'Check printer'}. Opening print dialog...`, { id: toastId });
        setTimeout(() => printStickersViaIframe(false), 200);
        return;
      }
    }

    // 3. Fallback: Windows Printer Driver Print dialog
    toast("Opening Windows Print dialog...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe(false);
    }, 150);
  };

  // Add to batch queue
  const handleAddToQueue = () => {
    if (!itemName.trim()) {
      toast.error("Please enter product name");
      return;
    }

    const newItem = {
      queueId: Date.now() + Math.random(),
      storeName: storeName.trim() || DEFAULT_STORE_NAME,
      itemName: itemName.trim(),
      mfgFormatted: formatDateDisplay(mfgDate),
      expFormatted: formatDateDisplay(expDate),
      price: Number(price) || 0,
      quantity: Number(quantity) || 1
    };

    setPrintQueue(prev => [...prev, newItem]);
    toast.success(`Added ${quantity} x "${itemName}" to print queue`);
  };

  // Print all batch items
  const handlePrintBatch = async () => {
    if (printQueue.length === 0) {
      toast.error("Print queue is empty!");
      return;
    }

    const totalCount = printQueue.reduce((a, c) => a + c.quantity, 0);

    if (webUsbConnected) {
      const toastId = toast.loading(`Sending ${totalCount} batch stickers to WebUSB printer...`);
      try {
        const flattenedStickers = getStickersList(true);
        const tsplCode = buildTSPLBuffer(flattenedStickers);
        const encoder = new TextEncoder();
        await printRawWebUSB(encoder.encode(tsplCode));
        toast.success(`Printed ${totalCount} stickers directly via WebUSB!`, { id: toastId });
        return;
      } catch (err) {
        console.error("WebUSB Batch Print Error:", err);
        toast.error(`WebUSB error: ${err.message}. Opening print dialog...`, { id: toastId });
        setTimeout(() => printStickersViaIframe(true), 200);
        return;
      }
    }

    if (qzConnected && selectedQZPrinter) {
      const toastId = toast.loading(`Printing ${totalCount} batch stickers to ${selectedQZPrinter}...`);
      try {
        const flattenedStickers = getStickersList(true);
        const tsplCode = buildTSPLBuffer(flattenedStickers);
        const encoder = new TextEncoder();
        await printRawUSB(encoder.encode(tsplCode));
        toast.success(`Printed ${totalCount} stickers successfully!`, { id: toastId });
        return;
      } catch (err) {
        console.error("Batch Print Error:", err);
      }
    }

    toast("Opening Windows Print dialog for batch...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe(true);
    }, 150);
  };

  return (
    <div className="custom-barcode-page">

      {/* Navigation Switcher Tabs */}
      <div className="barcode-mode-nav">
        <Link to="/barcode-generator" className="mode-tab-btn">
          <Barcode size={16} />
          Catalog Barcode Generator
        </Link>
        <button className="mode-tab-btn active" type="button">
          <Sparkles size={16} />
          Custom Sticker
          <span className="mode-badge">Active</span>
        </button>
      </div>

      {/* Screen Header */}
      <div className="custom-barcode-header-bar">
        <div className="custom-barcode-title-group">
          <div className="custom-barcode-icon-badge">
            <Tag size={24} />
          </div>
          <div>
            <h1 className="custom-barcode-page-title">Custom Sticker Generator</h1>
            <p className="custom-barcode-page-subtitle">
              Prints Store Name, Product Name, Manufacturing Date, Expiry Date & Price
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="custom-barcode-header-actions">
          {!webUsbConnected && (
            <button 
              className="barcode-btn barcode-btn-webusb" 
              onClick={handleWebUSBConnect}
              title="Pair WebUSB Thermal Printer"
            >
              <Usb size={16} />
              Pair WebUSB
            </button>
          )}

          <button 
            className="barcode-btn barcode-btn-primary" 
            onClick={handlePrint}
            style={{ fontSize: '15px', padding: '12px 24px' }}
          >
            <Printer size={18} />
            Print Stickers ({quantity})
          </button>
        </div>
      </div>

      {/* Connection Status Banner */}
      <div className="custom-barcode-usb-banner">
        <div className="custom-barcode-banner-info">
          <div className={`custom-barcode-status-dot ${webUsbConnected || qzConnected ? 'active' : 'inactive'}`} />
          <div>
            <h4 className="custom-barcode-banner-title">
              {webUsbConnected 
                ? `Connected: ${webUsbDevice || 'WebUSB Thermal Printer'}`
                : qzConnected && selectedQZPrinter
                  ? `Connected: ${selectedQZPrinter}`
                  : 'Printer Ready (WebUSB / Windows Driver)'}
            </h4>
            <p className="custom-barcode-banner-sub">
              {webUsbConnected || qzConnected 
                ? 'High-speed thermal sticker printing directly to your connected device.' 
                : 'Click "Pair WebUSB" for driverless USB print, or use standard Windows Print Driver.'}
            </p>
          </div>
        </div>

        <div className="custom-barcode-banner-actions">
          {webUsbConnected ? (
            <button className="barcode-btn barcode-btn-outline" onClick={disconnectWebUSB}>
              Disconnect
            </button>
          ) : (
            <button className="barcode-btn barcode-btn-webusb" onClick={handleWebUSBConnect}>
              <Usb size={14} /> Connect USB Printer
            </button>
          )}

          {qzConnected ? (
            <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZModal(true)}>
              <Settings2 size={14} /> Printer Settings
            </button>
          ) : (
            <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZSetupGuide(true)}>
              <HelpCircle size={14} /> Setup Guide
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="custom-barcode-grid">

        {/* LEFT COLUMN: The Clean 5 Inputs + Number of Prints */}
        <div className="barcode-card">

          {/* Quick Pre-fill helper from store catalog (optional) */}
          {items.length > 0 && (
            <div className="catalog-prefill-bar">
              <Package size={16} />
              <span>Auto-fill from items (optional):</span>
              <select 
                className="catalog-prefill-select"
                value={selectedCatalogId}
                onChange={handleSelectCatalogItem}
              >
                <option value="">-- Choose item or type custom below --</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} (₹{item.price})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="card-section-header">
            <Tag size={18} />
            <h3>Sticker Details</h3>
          </div>

          {/* 1. Store Name */}
          <div className="form-group">
            <label>
              Store Name <span className="required-star">*</span>
            </label>
            <div className="input-with-icon">
              <Building2 size={16} className="input-icon-left" />
              <input 
                type="text"
                className="custom-input"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="SRI RAJU SWEETS"
              />
            </div>
          </div>

          {/* 2. Product Name */}
          <div className="form-group">
            <label>
              Product Name <span className="required-star">*</span>
            </label>
            <input 
              type="text"
              className="custom-input"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Special Ghee Laddu, Mysore Pak..."
            />
          </div>

          {/* 3 & 4. Manufacturing Date & Expiry Date */}
          <div className="form-row-2col">
            <div className="form-group">
              <label>
                Manufacturing Date (MFD) <span className="required-star">*</span>
              </label>
              <input 
                type="date"
                className="custom-input"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
              />
              <div className="quick-preset-chips">
                <button 
                  type="button" 
                  className="date-chip-btn"
                  onClick={() => setMfgDate(getTodayDateISO())}
                >
                  Today
                </button>
                <button 
                  type="button" 
                  className="date-chip-btn"
                  onClick={() => setMfgDate(getDateOffsetISO(getTodayDateISO(), -1))}
                >
                  Yesterday
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>
                Expiry Date (EXP) <span className="required-star">*</span>
              </label>
              <input 
                type="date"
                className="custom-input"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
              />
              <div className="quick-preset-chips">
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(7)}>+7d</button>
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(15)}>+15d</button>
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(30)}>+30d</button>
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(60)}>+60d</button>
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(90)}>+90d</button>
                <button type="button" className="date-chip-btn" onClick={() => applyExpiryDaysOffset(180)}>+6m</button>
              </div>
            </div>
          </div>

          {/* 5. Price & Number of Prints */}
          <div className="form-row-2col">
            <div className="form-group">
              <label>
                Price (₹) <span className="required-star">*</span>
              </label>
              <div className="custom-price-input-box">
                <span className="custom-price-prefix">₹</span>
                <input 
                  type="number"
                  className="custom-price-field"
                  min="0"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="360"
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Number of Prints (Copies) <span className="required-star">*</span>
              </label>
              <div className="quantity-counter">
                <button 
                  type="button" 
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                >-</button>
                <input 
                  type="number" 
                  min="1" 
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
                <button 
                  type="button" 
                  onClick={() => setQuantity(prev => prev + 1)}
                >+</button>
              </div>
            </div>
          </div>

          {/* Big Direct Print Button */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
            <button 
              type="button"
              className="barcode-btn barcode-btn-primary flex-1"
              style={{ padding: '14px', fontSize: '16px', fontWeight: '700' }}
              onClick={handlePrint}
            >
              <Printer size={20} />
              Print Now ({quantity} Copies)
            </button>

            <button 
              type="button"
              className="barcode-btn barcode-btn-outline"
              onClick={handleAddToQueue}
              title="Add this sticker to batch print queue"
            >
              <Plus size={16} /> Add to Queue
            </button>
          </div>

          {/* Optional Printer Roll Settings Toggle */}
          <div 
            className="card-section-header margin-top" 
            style={{ cursor: 'pointer', marginBottom: 0 }} 
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 size={16} />
            <span style={{ fontSize: '13px', fontWeight: '600' }}>Sticker Roll Format & Settings</span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b' }}>
              {showSettings ? '▲ Hide' : '▼ Expand'}
            </span>
          </div>

          {showSettings && (
            <motion.div 
              className="calibration-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="form-group">
                <label>Roll Format</label>
                <div className="format-toggle-group">
                  <button 
                    type="button" 
                    className={`toggle-btn ${labelColumns === 2 ? 'active' : ''}`}
                    onClick={() => setLabelColumns(2)}
                  >
                    2 Columns (2-Up Roll)
                  </button>
                  <button 
                    type="button" 
                    className={`toggle-btn ${labelColumns === 1 ? 'active' : ''}`}
                    onClick={() => setLabelColumns(1)}
                  >
                    1 Column (Single Roll)
                  </button>
                </div>
              </div>

              <div className="form-row-2col margin-top">
                <div className="form-group">
                  <label>Label Width (mm)</label>
                  <input 
                    type="number" 
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
                <div className="form-group">
                  <label>Label Height (mm)</label>
                  <input 
                    type="number" 
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
              </div>
            </motion.div>
          )}

        </div>

        {/* RIGHT COLUMN: Live Sticker Preview & Batch Queue */}
        <div>

          {/* Live Thermal Sticker Preview Card */}
          <div className="barcode-card preview-card">
            <div className="card-section-header">
              <Eye size={18} />
              <h3>Live Sticker Preview {labelColumns === 2 ? '(2-Up Roll)' : '(1-Column)'}</h3>
              <span className="live-tag">Exact Sticker Output</span>
            </div>

            <div className="sticker-preview-wrapper">
              <div className="preview-row-container">
                {/* Left Sticker */}
                <div className="physical-clean-sticker">
                  <div className="clean-sticker-store">{storeName || DEFAULT_STORE_NAME}</div>
                  <div className="clean-sticker-name">{itemName || 'Product Name'}</div>
                  <div className="clean-sticker-dates">
                    <span>MFD: {formatDateDisplay(mfgDate)}</span>
                    <span>EXP: {formatDateDisplay(expDate)}</span>
                  </div>
                  <div className="clean-sticker-price">
                    PRICE: ₹{price || 0}/-
                  </div>
                </div>

                {/* Right Sticker if 2-Column Mode */}
                {labelColumns === 2 && (
                  <div className="physical-clean-sticker">
                    <div className="clean-sticker-store">{storeName || DEFAULT_STORE_NAME}</div>
                    <div className="clean-sticker-name">{itemName || 'Product Name'}</div>
                    <div className="clean-sticker-dates">
                      <span>MFD: {formatDateDisplay(mfgDate)}</span>
                      <span>EXP: {formatDateDisplay(expDate)}</span>
                    </div>
                    <div className="clean-sticker-price">
                      PRICE: ₹{price || 0}/-
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button 
                className="barcode-btn barcode-btn-primary flex-1"
                onClick={handlePrint}
                style={{ padding: '12px' }}
              >
                <Printer size={16} />
                Print ({quantity} Copies)
              </button>

              <button 
                className="barcode-btn barcode-btn-secondary"
                onClick={() => printStickersViaIframe(false)}
                title="Open standard browser print dialog"
              >
                <FileText size={16} />
                Browser Print
              </button>
            </div>

          </div>

          {/* Batch Print Queue (if items are queued) */}
          {printQueue.length > 0 && (
            <div className="barcode-card queue-card">
              <div className="card-section-header">
                <Layers size={18} />
                <h3>Print Queue ({printQueue.length})</h3>
                <button className="clear-queue-btn" onClick={() => setPrintQueue([])}>
                  Clear All
                </button>
              </div>

              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Dates</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {printQueue.map((item) => (
                    <tr key={item.queueId}>
                      <td><strong>{item.itemName}</strong></td>
                      <td>
                        <small style={{ display: 'block' }}>M: {item.mfgFormatted}</small>
                        <small style={{ display: 'block', color: '#b91c1c' }}>E: {item.expFormatted}</small>
                      </td>
                      <td>₹{item.price}</td>
                      <td><span className="queue-qty">{item.quantity}</span></td>
                      <td>
                        <button 
                          className="remove-queue-btn" 
                          onClick={() => setPrintQueue(prev => prev.filter(i => i.queueId !== item.queueId))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="queue-footer">
                <button 
                  className="barcode-btn barcode-btn-primary full-width"
                  onClick={handlePrintBatch}
                >
                  <Printer size={16} />
                  Print Entire Queue ({printQueue.reduce((s, i) => s + i.quantity, 0)} Stickers)
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowQZModal(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '420px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Usb size={28} />
              </div>
              <h3 className="modal-title">Select USB Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', display: 'block' }}>
                  Detected System Printers
                </label>
                <select
                  value={selectedQZPrinter}
                  onChange={(e) => confirmQZPrinter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#ffffff',
                    outline: 'none'
                  }}
                >
                  {qzPrinters.length > 0 ? (
                    qzPrinters.map(p => <option key={p} value={p}>{p}</option>)
                  ) : (
                    <option value="">No USB thermal printers found</option>
                  )}
                </select>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button className="barcode-btn barcode-btn-outline flex-1" onClick={() => { disconnectQZTray(); setShowQZModal(false); }}>
                  Disconnect
                </button>
                <button
                  className="barcode-btn barcode-btn-primary flex-1"
                  onClick={() => setShowQZModal(false)}
                >
                  Confirm Selection
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* QZ Setup Guide Modal */}
      <AnimatePresence>
        {showQZSetupGuide && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowQZSetupGuide(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '480px', width: '95%', textAlign: 'left' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <Usb size={20} style={{ color: '#2563eb' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>Thermal Printer Setup Guide</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowQZSetupGuide(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0 }}>
                  For direct USB printing in Chrome/Edge, connect your thermal printer via USB and click <strong>"Connect USB Printer"</strong>.
                </p>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}>Direct Printing Options:</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>WebUSB:</strong> Click "Connect USB Printer" and select your thermal printer from the browser popup. No drivers needed!</li>
                    <li><strong>Windows Driver:</strong> Standard Windows printer driver dialog opens automatically if USB is not paired.</li>
                  </ul>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button className="barcode-btn barcode-btn-secondary" onClick={() => { setShowQZSetupGuide(false); printStickersViaIframe(false); }}>
                  <Printer size={14} /> Use Windows Driver
                </button>
                <button
                  className="barcode-btn barcode-btn-primary"
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await handleWebUSBConnect();
                  }}
                >
                  <Usb size={14} /> Pair WebUSB Now
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

    </div>
  );
};

export default CustomBarcode;
