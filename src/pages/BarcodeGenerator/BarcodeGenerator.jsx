import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Printer, 
  Search, 
  Scale, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Copy, 
  Layers, 
  Usb, 
  Settings2,
  Package,
  Eye,
  FileText
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import JsBarcode from 'jsbarcode';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrinter } from '../../context/PrinterContext';
import './BarcodeGenerator.css';

// Default store branding header
const STORE_NAME = "SRI RAJU SWEETS";

const WEIGHT_PRESETS = [
  { label: '50g', value: 50 },
  { label: '100g', value: 100 },
  { label: '250g', value: 250 },
  { label: '400g', value: 400 },
  { label: '500g (1/2 KG)', value: 500 },
  { label: '750g', value: 750 },
  { label: '1000g (1 KG)', value: 1000 },
  { label: '1500g (1.5 KG)', value: 1500 },
  { label: '2000g (2 KG)', value: 2000 },
  { label: '2500g (2.5 KG)', value: 2500 },
  { label: '5000g (5 KG)', value: 5000 },
];

const BarcodeGenerator = () => {
  const { 
    qzConnected, 
    selectedQZPrinter, 
    connectQZTray, 
    setShowQZModal, 
    printRawUSB 
  } = usePrinter();

  // Item & Data states
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Form states
  const [grams, setGrams] = useState(400);
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [barcodeFormatOption, setBarcodeFormatOption] = useState('numeric'); // 'numeric' (10040400) or 'asterisk' (1004*0400)
  const [customBarcodeId, setCustomBarcodeId] = useState('');

  // Sticker Dimensions & Settings (mm)
  const [labelWidth, setLabelWidth] = useState(50); // 50mm
  const [labelHeight, setLabelHeight] = useState(25); // 25mm

  // Batch Print Queue
  const [printQueue, setPrintQueue] = useState([]);

  // Barcode SVG Ref for rendering
  const barcodeRef = useRef(null);
  const printAreaRef = useRef(null);

  // Fetch products from Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemData);
      if (itemData.length > 0 && !selectedItem) {
        setSelectedItem(itemData[0]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching items:", err);
      toast.error("Failed to load products");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Update custom price when selected item or grams changes
  useEffect(() => {
    if (selectedItem) {
      const basePrice = Number(selectedItem.price) || 0;
      if (selectedItem.unit === 'Piece') {
        setCustomPrice(basePrice);
      } else {
        // Calculated price for grams (Base price is per 1kg / 1000g)
        const calculated = Math.round((basePrice * grams) / 1000);
        setCustomPrice(calculated);
      }
      setCustomBarcodeId(selectedItem.barcode || selectedItem.barcodeId || selectedItem.id?.substring(0, 4) || '1004');
    }
  }, [selectedItem, grams]);

  // Generate Barcode Value
  const getBarcodeValue = () => {
    if (!selectedItem) return '10040400';
    const rawBarcodeId = (customBarcodeId || selectedItem.barcode || selectedItem.barcodeId || '1004').trim();
    // Padded 4-digit grams representation (e.g. 400 -> "0400", 1000 -> "1000", 50 -> "0050")
    const paddedWeight = String(grams || 0).padStart(4, '0');

    if (barcodeFormatOption === 'asterisk') {
      return `${rawBarcodeId}*${paddedWeight}`;
    }
    return `${rawBarcodeId}${paddedWeight}`;
  };

  const barcodeValue = getBarcodeValue();

  // Render Barcode using JsBarcode
  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 1.6,
          height: 38,
          displayValue: false, // We render clean text below barcode as per attached design
          margin: 0,
          background: "transparent"
        });
      } catch (err) {
        console.warn("JsBarcode render notice:", err);
      }
    }
  }, [barcodeValue, barcodeRef.current]);

  // Formatted Weight Display String (e.g. "400 GM" or "1 KG")
  const getFormattedWeightLabel = () => {
    if (!selectedItem) return '400 GM';
    if (selectedItem.unit === 'Piece') return '1 PC';
    
    if (grams >= 1000) {
      const kgVal = grams / 1000;
      return `${kgVal % 1 === 0 ? kgVal : kgVal.toFixed(2)} KG`;
    }
    return `${grams} GM`;
  };

  // Filter items search
  const filteredItems = items.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (item.name || '').toLowerCase().includes(q);
    const codeMatch = (item.barcode || item.barcodeId || '').toLowerCase().includes(q);
    return nameMatch || codeMatch;
  });

  // Add to batch queue
  const handleAddToQueue = () => {
    if (!selectedItem) {
      toast.error("Please select a product first");
      return;
    }

    const newItem = {
      queueId: Date.now() + Math.random(),
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      barcodeId: customBarcodeId || selectedItem.barcode || selectedItem.barcodeId || '1004',
      barcodeValue,
      grams,
      weightLabel: getFormattedWeightLabel(),
      mrp: Number(customPrice) || 0,
      quantity: Number(quantity) || 1,
      unit: selectedItem.unit || 'Weight'
    };

    setPrintQueue(prev => [...prev, newItem]);
    toast.success(`Added ${quantity} x ${selectedItem.name} to print queue`);
  };

  const handleRemoveFromQueue = (queueId) => {
    setPrintQueue(prev => prev.filter(i => i.queueId !== queueId));
  };

  const handleClearQueue = () => {
    setPrintQueue([]);
  };

  // --- Browser & USB Print Handlers ---
  const handleBrowserPrintCurrent = () => {
    if (!selectedItem) return;
    window.print();
  };

  // --- USB Printer Handler with Instant Driver Fallback ---
  const handleUSBPrintCurrent = async () => {
    if (!selectedItem) return;

    // 1. If QZ Tray software is connected, use raw silent TSPL printing
    if (qzConnected && selectedQZPrinter) {
      const toastId = toast.loading(`Sending ${quantity} label sticker(s) to ${selectedQZPrinter}...`);

      try {
        const rawBarcodeId = customBarcodeId || selectedItem.barcode || selectedItem.barcodeId || '1004';
        const weightStr = getFormattedWeightLabel();
        const mrpText = `MRP: ${customPrice}/-`;
        const copyQty = Number(quantity) || 1;

        const tsplCode = `
SIZE ${labelWidth} mm, ${labelHeight} mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 190, 8, "3", 0, 1, 1, 2, "${STORE_NAME}"
TEXT 10, 32, "2", 0, 1, 1, "${selectedItem.name.substring(0, 20)}"
TEXT 320, 32, "2", 0, 1, 1, "${weightStr}"
BARCODE 15, 58, "128", 42, 0, 0, 2, 2, "${barcodeValue}"
TEXT 15, 105, "2", 0, 1, 1, "${rawBarcodeId}"
TEXT 240, 118, "3", 0, 1, 1, "${mrpText}"
PRINT ${copyQty}
`;

        const encoder = new TextEncoder();
        await printRawUSB(encoder.encode(tsplCode));
        toast.success(`Successfully sent ${copyQty} label(s) to USB printer!`, { id: toastId });
        return;
      } catch (err) {
        console.error("USB Raw Print Error:", err);
        toast.error(`Direct USB raw print failed. Launching Windows USB Driver Print...`, { id: toastId });
      }
    }

    // 2. If QZ Tray desktop app is not running/connected:
    // Instantly open Windows USB Printer Driver dialog so printing works without any error!
    toast("Opening Windows USB Printer Print...", { icon: '🖨️' });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // USB Batch Print
  const handleUSBPrintBatch = async () => {
    if (printQueue.length === 0) {
      toast.error("Print queue is empty!");
      return;
    }

    if (!qzConnected || !selectedQZPrinter) {
      toast.error("Please connect USB Printer first");
      connectQZTray();
      return;
    }

    const toastId = toast.loading(`Sending batch (${printQueue.reduce((a, c) => a + c.quantity, 0)} stickers) to USB printer...`);

    try {
      let combinedTSPL = '';
      printQueue.forEach(item => {
        combinedTSPL += `
SIZE ${labelWidth} mm, ${labelHeight} mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 190, 8, "3", 0, 1, 1, 2, "${STORE_NAME}"
TEXT 10, 32, "2", 0, 1, 1, "${item.itemName.substring(0, 20)}"
TEXT 320, 32, "2", 0, 1, 1, "${item.weightLabel}"
BARCODE 15, 58, "128", 42, 0, 0, 2, 2, "${item.barcodeValue}"
TEXT 15, 105, "2", 0, 1, 1, "${item.barcodeId}"
TEXT 240, 118, "3", 0, 1, 1, "MRP: ${item.mrp}/-"
PRINT ${item.quantity}
`;
      });

      const encoder = new TextEncoder();
      await printRawUSB(encoder.encode(combinedTSPL));
      toast.success(`Batch printed successfully!`, { id: toastId });
    } catch (err) {
      console.error("Batch USB Print Error:", err);
      toast.error(`Batch USB Print failed: ${err.message}`, { id: toastId });
    }
  };

  return (
    <div className="barcode-generator-page">
      {/* Printable Area for Window Print (@media print hides everything else) */}
      <div className="printable-stickers-area" ref={printAreaRef}>
        {printQueue.length > 0 ? (
          printQueue.map((item) => (
            Array.from({ length: item.quantity }).map((_, idx) => (
              <div key={`${item.queueId}-${idx}`} className="print-sticker-card">
                <div className="sticker-header-title">{STORE_NAME}</div>
                <div className="sticker-sub-row">
                  <span className="sticker-item-name">{item.itemName}</span>
                  <span className="sticker-weight-tag">{item.weightLabel}</span>
                </div>
                <div className="sticker-barcode-wrapper">
                  <svg 
                    ref={node => {
                      if (node) {
                        try {
                          JsBarcode(node, item.barcodeValue, {
                            format: "CODE128",
                            lineColor: "#000000",
                            width: 1.5,
                            height: 34,
                            displayValue: false,
                            margin: 0
                          });
                        } catch(e) {}
                      }
                    }} 
                  />
                </div>
                <div className="sticker-footer-row">
                  <span className="sticker-code-id">{item.barcodeId}</span>
                  <span className="sticker-mrp-price">MRP: {item.mrp}/-</span>
                </div>
              </div>
            ))
          ))
        ) : selectedItem ? (
          Array.from({ length: quantity }).map((_, idx) => (
            <div key={`current-${idx}`} className="print-sticker-card">
              <div className="sticker-header-title">{STORE_NAME}</div>
              <div className="sticker-sub-row">
                <span className="sticker-item-name">{selectedItem.name}</span>
                <span className="sticker-weight-tag">{getFormattedWeightLabel()}</span>
              </div>
              <div className="sticker-barcode-wrapper">
                <svg 
                  ref={node => {
                    if (node) {
                      try {
                        JsBarcode(node, barcodeValue, {
                          format: "CODE128",
                          lineColor: "#000000",
                          width: 1.5,
                          height: 34,
                          displayValue: false,
                          margin: 0
                        });
                      } catch(e) {}
                    }
                  }} 
                />
              </div>
              <div className="sticker-footer-row">
                <span className="sticker-code-id">{customBarcodeId || selectedItem.barcode || selectedItem.barcodeId || '1004'}</span>
                <span className="sticker-mrp-price">MRP: {customPrice}/-</span>
              </div>
            </div>
          ))
        ) : null}
      </div>

      {/* Screen UI Header */}
      <div className="barcode-header-bar">
        <div className="barcode-title-group">
          <div className="barcode-icon-badge">
            <Barcode size={24} />
          </div>
          <div>
            <h1 className="barcode-page-title">Barcode Sticker Generator</h1>
            <p className="barcode-page-subtitle">Select item, weight & quantity to print thermal weight barcodes</p>
          </div>
        </div>

        {/* USB Printer Status Badge */}
        <div className="barcode-header-actions">
          <div className={`usb-status-badge ${qzConnected ? 'connected' : 'disconnected'}`}>
            <Usb size={16} />
            <span>{qzConnected ? (selectedQZPrinter || 'USB Printer Ready') : 'USB Printer Disconnected'}</span>
          </div>

          <button 
            className="barcode-btn barcode-btn-secondary" 
            onClick={() => qzConnected ? setShowQZModal(true) : connectQZTray()}
          >
            <Settings2 size={16} />
            {qzConnected ? 'Printer Settings' : 'Connect USB Printer'}
          </button>

          <button 
            className="barcode-btn barcode-btn-primary" 
            onClick={handleUSBPrintCurrent}
            disabled={!selectedItem}
          >
            <Printer size={16} />
            Print ({quantity} Copies)
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="barcode-main-grid">

        {/* LEFT COLUMN: Item Selector & Configuration */}
        <div className="barcode-card form-section">
          
          {/* Item Selector Header */}
          <div className="card-section-header">
            <Package size={18} />
            <h3>1. Select Product</h3>
          </div>

          {/* Search Box */}
          <div className="barcode-search-box">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search product name or barcode ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          {/* Item Select List */}
          <div className="item-select-list">
            {loading ? (
              <div className="item-loader">Loading catalog items...</div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map(item => {
                const isSelected = selectedItem?.id === item.id;
                const barcodeId = item.barcode || item.barcodeId || '1004';

                return (
                  <div 
                    key={item.id} 
                    className={`item-select-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="item-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-meta">
                        Code: <strong>{barcodeId}</strong> | Price: <strong>₹{item.price}/{item.unit === 'Piece' ? 'pc' : 'kg'}</strong>
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 size={18} className="selected-check" />}
                  </div>
                );
              })
            ) : (
              <div className="no-items-found">No matching products found</div>
            )}
          </div>

          {/* Step 2: Grams & Weight Input */}
          <div className="card-section-header margin-top">
            <Scale size={18} />
            <h3>2. Weight & Grams Selection</h3>
          </div>

          <div className="weight-input-container">
            <div className="form-group">
              <label>Weight in Grams (g)</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  min="1"
                  max="100000"
                  value={grams}
                  onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
                />
                <span className="unit-label">Grams</span>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="form-group">
              <label>Quick Presets</label>
              <div className="weight-presets-grid">
                {WEIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`preset-btn ${grams === preset.value ? 'active' : ''}`}
                    onClick={() => setGrams(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3: Quantity & Price */}
          <div className="card-section-header margin-top">
            <Sliders size={18} />
            <h3>3. Quantity & Pricing</h3>
          </div>

          <div className="form-row-2col">
            <div className="form-group">
              <label>Number of Sticker Copies</label>
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

            <div className="form-group">
              <label>Calculated Sticker MRP (₹)</label>
              <div className="input-with-unit">
                <span className="unit-prefix">₹</span>
                <input 
                  type="number" 
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Step 4: Barcode Format Settings */}
          <div className="form-group margin-top">
            <label>Barcode String Format</label>
            <div className="format-toggle-group">
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'numeric' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('numeric')}
              >
                Numeric (10040400)
              </button>
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'asterisk' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('asterisk')}
              >
                Delimited (1004*0400)
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="form-actions-row">
            <button 
              type="button" 
              className="barcode-btn barcode-btn-outline full-width"
              onClick={handleAddToQueue}
              disabled={!selectedItem}
            >
              <Plus size={16} />
              Add to Print Queue
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Live Sticker Preview & Printer Controls */}
        <div className="barcode-right-column">

          {/* Live Sticker Mockup Card */}
          <div className="barcode-card preview-card">
            <div className="card-section-header">
              <Eye size={18} />
              <h3>Live Sticker Preview</h3>
              <span className="live-tag">Exact Format Match</span>
            </div>

            <div className="sticker-preview-wrapper">
              <div className="physical-sticker-preview">
                {/* Header: SRI RAJU SWEETS */}
                <div className="preview-store-header">{STORE_NAME}</div>
                
                {/* Second Line: Item Name (Left) | Weight (Right) */}
                <div className="preview-item-row">
                  <span className="preview-item-name">{selectedItem?.name || 'Kaju Kalakan'}</span>
                  <span className="preview-weight">{getFormattedWeightLabel()}</span>
                </div>

                {/* Third Line: Barcode Graphics */}
                <div className="preview-barcode-container">
                  <svg ref={barcodeRef} className="preview-barcode-svg" />
                </div>

                {/* Fourth & Fifth Line: Barcode ID (Left) | MRP (Right) */}
                <div className="preview-footer-row">
                  <span className="preview-barcode-id">
                    {customBarcodeId || selectedItem?.barcode || selectedItem?.barcodeId || '1024'}
                  </span>
                  <span className="preview-mrp">MRP: {customPrice || 360}/-</span>
                </div>
              </div>
            </div>

            <div className="preview-info-box">
              <div className="info-item">
                <span className="info-label">Barcode Value:</span>
                <span className="info-val monospace">{barcodeValue}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Print Copies:</span>
                <span className="info-val">{quantity} Sticker(s)</span>
              </div>
            </div>

            {/* Quick Print Action Buttons */}
            <div className="preview-action-buttons">
              <button 
                className="barcode-btn barcode-btn-primary flex-1"
                onClick={handleUSBPrintCurrent}
                disabled={!selectedItem}
              >
                <Printer size={16} />
                USB Direct Print ({quantity})
              </button>

              <button 
                className="barcode-btn barcode-btn-secondary flex-1"
                onClick={handleBrowserPrintCurrent}
                disabled={!selectedItem}
              >
                <FileText size={16} />
                Browser Print / PDF
              </button>
            </div>

          </div>

          {/* Batch Print Queue Section */}
          <div className="barcode-card queue-card">
            <div className="card-section-header">
              <Layers size={18} />
              <h3>Batch Print Queue ({printQueue.length})</h3>
              {printQueue.length > 0 && (
                <button className="clear-queue-btn" onClick={handleClearQueue}>
                  Clear All
                </button>
              )}
            </div>

            {printQueue.length > 0 ? (
              <div className="queue-list-wrapper">
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Weight</th>
                      <th>Copies</th>
                      <th>MRP</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printQueue.map((item) => (
                      <tr key={item.queueId}>
                        <td>
                          <strong>{item.itemName}</strong>
                          <br />
                          <small className="monospace">{item.barcodeValue}</small>
                        </td>
                        <td>{item.weightLabel}</td>
                        <td><span className="queue-qty">{item.quantity}</span></td>
                        <td>₹{item.mrp}</td>
                        <td>
                          <button 
                            className="remove-queue-btn" 
                            onClick={() => handleRemoveFromQueue(item.queueId)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="queue-footer">
                  <div className="queue-total-summary">
                    Total Stickers to Print: <strong>{printQueue.reduce((sum, item) => sum + item.quantity, 0)}</strong>
                  </div>
                  <button 
                    className="barcode-btn barcode-btn-primary full-width"
                    onClick={handleUSBPrintBatch}
                  >
                    <Printer size={16} />
                    Print All Queue Items
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-queue-state">
                <Layers size={28} className="empty-queue-icon" />
                <p>Print Queue is empty.</p>
                <small>Click "Add to Print Queue" to bundle multiple sticker sizes & items together.</small>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default BarcodeGenerator;
