import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  FileText,
  HelpCircle,
  ExternalLink,
  X,
  RotateCw,
  Move,
  Columns,
  Hash
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
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

// Helper to extract clean numeric Barcode ID (e.g. 1004) instead of Firestore auto hashes (e.g. 7bnW...)
export const extractCleanNumericBarcodeId = (item) => {
  if (!item) return '1004';
  const raw = (item.barcode || item.barcodeId || item.code || item.itemCode || '').toString().trim();
  
  // If item has an explicit custom barcode/code (e.g. 1004, 1024), use it
  if (raw && !/^[a-zA-Z0-9]{15,30}$/.test(raw)) {
    return raw;
  }

  // If candidate is a 20-char Firestore auto hash (like 7bnW9x...), extract numbers or default to 1004
  const digits = (raw || item.id || '').replace(/[^0-9]/g, '');
  if (digits.length >= 4) {
    return digits.substring(0, 4);
  }

  return '1004';
};

const BarcodeGenerator = () => {
  const { 
    qzConnected, 
    qzPrinters,
    selectedQZPrinter, 
    showQZModal,
    showQZSetupGuide,
    qzConnecting,
    qzConnectTimer,
    setShowQZModal,
    setShowQZSetupGuide,
    connectQZTray, 
    confirmQZPrinter,
    disconnectQZTray,
    printRawUSB,
    printHTMLContent
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
  const [barcodeFormatOption, setBarcodeFormatOption] = useState('asterisk'); // Default 'asterisk' (1004*0400)
  const [customBarcodeId, setCustomBarcodeId] = useState('1004');

  // Sticker Dimensions & Printer Calibration (with localStorage persistence)
  const savedSettings = (() => {
    try {
      const s = localStorage.getItem('raju_barcode_settings');
      return s ? JSON.parse(s) : null;
    } catch (_) { return null; }
  })();

  const [labelColumns, setLabelColumns] = useState(savedSettings?.columns ?? 2); // 2 Columns per row (2-Up Sticker Roll)
  const [labelWidth, setLabelWidth] = useState(savedSettings?.width ?? 50); // 50mm per sticker
  const [labelHeight, setLabelHeight] = useState(savedSettings?.height ?? 25); // 25mm per sticker
  const [labelGap, setLabelGap] = useState(savedSettings?.gap ?? 3); // 3mm horizontal gap between stickers
  const [printMode, setPrintMode] = useState(savedSettings?.mode ?? 'tspl'); // 'tspl' or 'image'
  const [labelDirection, setLabelDirection] = useState(savedSettings?.direction ?? 0); // 0 = Standard, 1 = 180° Inverted
  const [xOffset, setXOffset] = useState(savedSettings?.xOffset ?? 0);
  const [yOffset, setYOffset] = useState(savedSettings?.yOffset ?? 0);
  const [showCalibration, setShowCalibration] = useState(false);

  // Save settings when changed
  useEffect(() => {
    try {
      localStorage.setItem('raju_barcode_settings', JSON.stringify({
        columns: labelColumns,
        width: labelWidth,
        height: labelHeight,
        gap: labelGap,
        mode: printMode,
        direction: labelDirection,
        xOffset,
        yOffset
      }));
    } catch (_) {}
  }, [labelColumns, labelWidth, labelHeight, labelGap, printMode, labelDirection, xOffset, yOffset]);

  // Batch Print Queue
  const [printQueue, setPrintQueue] = useState([]);

  // Barcode SVG Ref for rendering live preview
  const barcodeRef = useRef(null);
  const barcodeRightRef = useRef(null);
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

  // Update custom price & barcode ID when selected item or grams changes
  useEffect(() => {
    if (selectedItem) {
      const basePrice = Number(selectedItem.price) || 0;
      if (selectedItem.unit === 'Piece') {
        setCustomPrice(basePrice);
      } else {
        const calculated = Math.round((basePrice * grams) / 1000);
        setCustomPrice(calculated);
      }
      const cleanId = extractCleanNumericBarcodeId(selectedItem);
      setCustomBarcodeId(cleanId);
    }
  }, [selectedItem, grams]);

  // Generate Barcode Encoded String (e.g. 1004*0400)
  const getBarcodeValue = () => {
    const rawBarcodeId = (customBarcodeId || (selectedItem ? extractCleanNumericBarcodeId(selectedItem) : '1004')).trim();
    const paddedWeight = String(grams || 0).padStart(4, '0');

    if (barcodeFormatOption === 'numeric') {
      return `${rawBarcodeId}${paddedWeight}`;
    }
    // Delimited Format: 1004*0400
    return `${rawBarcodeId}*${paddedWeight}`;
  };

  const barcodeValue = getBarcodeValue();

  // Render Barcode in preview using JsBarcode
  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 1.5,
          height: 34,
          displayValue: false,
          margin: 0,
          background: "transparent"
        });
      } catch (err) {
        console.warn("JsBarcode preview render notice:", err);
      }
    }
    if (barcodeRightRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRightRef.current, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 1.5,
          height: 34,
          displayValue: false,
          margin: 0,
          background: "transparent"
        });
      } catch (_) {}
    }
  }, [barcodeValue, barcodeRef.current, barcodeRightRef.current]);

  // Helper to generate standalone SVG markup for any barcode
  const generateBarcodeSVGString = (val) => {
    try {
      const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svgNode, val || barcodeValue, {
        format: "CODE128",
        lineColor: "#000000",
        width: 1.4,
        height: 30,
        displayValue: false,
        margin: 0,
        background: "transparent"
      });
      return svgNode.outerHTML;
    } catch (err) {
      console.warn("Barcode SVG generation fallback:", err);
      return `<svg width="140" height="30"><text x="10" y="20" font-size="12" font-family="monospace">${val}</text></svg>`;
    }
  };

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
      barcodeId: customBarcodeId || extractCleanNumericBarcodeId(selectedItem),
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

  // Get flattened list of all stickers to print
  const getStickersList = (isBatch = false) => {
    if (isBatch) {
      const flat = [];
      printQueue.forEach(item => {
        const count = Number(item.quantity) || 1;
        for (let i = 0; i < count; i++) {
          flat.push({
            itemName: item.itemName,
            weightLabel: item.weightLabel,
            barcodeValue: item.barcodeValue,
            barcodeId: item.barcodeId,
            mrp: item.mrp
          });
        }
      });
      return flat;
    } else {
      if (!selectedItem) return [];
      const count = Number(quantity) || 1;
      const singleObj = {
        itemName: selectedItem.name,
        weightLabel: getFormattedWeightLabel(),
        barcodeValue,
        barcodeId: customBarcodeId || extractCleanNumericBarcodeId(selectedItem),
        mrp: Number(customPrice) || 0
      };
      return Array.from({ length: count }).map(() => singleObj);
    }
  };

  // --- TSPL 2-Column Buffer Generator ---
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

      // --- COLUMN 1 (LEFT STICKER: X = 0 to 400 dots) ---
      const x1 = 12 + Number(xOffset);
      const y1 = 6 + Number(yOffset);
      tspl += `
TEXT ${100 + x1}, ${y1}, "2", 0, 1, 1, "${STORE_NAME}"
TEXT ${10 + x1}, ${28 + y1}, "2", 0, 1, 1, "${col1.itemName.substring(0, 16)}"
TEXT ${280 + x1}, ${28 + y1}, "2", 0, 1, 1, "${col1.weightLabel}"
BARCODE ${40 + x1}, ${52 + y1}, "128", 38, 0, 0, 2, 2, "${col1.barcodeValue}"
TEXT ${15 + x1}, ${96 + y1}, "2", 0, 1, 1, "${col1.barcodeId}"
TEXT ${240 + x1}, ${96 + y1}, "2", 0, 1, 1, "MRP: ${col1.mrp}/-"
`;

      // --- COLUMN 2 (RIGHT STICKER: X = 425 to 825 dots) ---
      if (col2) {
        const x2 = 430 + Number(xOffset);
        const y2 = 6 + Number(yOffset);
        tspl += `
TEXT ${100 + x2}, ${y2}, "2", 0, 1, 1, "${STORE_NAME}"
TEXT ${10 + x2}, ${28 + y2}, "2", 0, 1, 1, "${col2.itemName.substring(0, 16)}"
TEXT ${280 + x2}, ${28 + y2}, "2", 0, 1, 1, "${col2.weightLabel}"
BARCODE ${40 + x2}, ${52 + y2}, "128", 38, 0, 0, 2, 2, "${col2.barcodeValue}"
TEXT ${15 + x2}, ${96 + y2}, "2", 0, 1, 1, "${col2.barcodeId}"
TEXT ${240 + x2}, ${96 + y2}, "2", 0, 1, 1, "MRP: ${col2.mrp}/-"
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

    // Group stickers into Rows (2 stickers per row if 2-columns)
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
      const leftSvg = generateBarcodeSVGString(row.left.barcodeValue);
      const rightSvg = row.right ? generateBarcodeSVGString(row.right.barcodeValue) : '';

      return `
        <div class="sticker-print-row" key="row-${rIdx}">
          <!-- LEFT STICKER -->
          <div class="print-sticker-card">
            <div class="sticker-header-title">${STORE_NAME}</div>
            <div class="sticker-sub-row">
              <span class="sticker-item-name">${row.left.itemName}</span>
              <span class="sticker-weight-tag">${row.left.weightLabel}</span>
            </div>
            <div class="sticker-barcode-wrapper">
              ${leftSvg}
            </div>
            <div class="sticker-footer-row">
              <span class="sticker-code-id">${row.left.barcodeId}</span>
              <span class="sticker-mrp-price">MRP: ${row.left.mrp}/-</span>
            </div>
          </div>

          ${cols === 2 ? (
            row.right ? `
              <!-- RIGHT STICKER -->
              <div class="print-sticker-card">
                <div class="sticker-header-title">${STORE_NAME}</div>
                <div class="sticker-sub-row">
                  <span class="sticker-item-name">${row.right.itemName}</span>
                  <span class="sticker-weight-tag">${row.right.weightLabel}</span>
                </div>
                <div class="sticker-barcode-wrapper">
                  ${rightSvg}
                </div>
                <div class="sticker-footer-row">
                  <span class="sticker-code-id">${row.right.barcodeId}</span>
                  <span class="sticker-mrp-price">MRP: ${row.right.mrp}/-</span>
                </div>
              </div>
            ` : `
              <!-- BLANK RIGHT STICKER PLACEHOLDER (KEEPS LEFT STICKER IN COLUMN 1) -->
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
          <title>Barcodes - Raju Ghee Sweets</title>
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
              padding: 0.8mm 1.5mm !important;
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
            .sticker-header-title {
              text-align: center !important;
              font-size: 8pt !important;
              font-weight: 800 !important;
              line-height: 1 !important;
              letter-spacing: 0.2px !important;
              text-transform: uppercase !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              margin-bottom: 0.4mm !important;
            }
            .sticker-sub-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              font-size: 7.5pt !important;
              font-weight: 700 !important;
              line-height: 1 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              margin-bottom: 0.4mm !important;
            }
            .sticker-item-name {
              max-width: 32mm !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
            }
            .sticker-weight-tag {
              font-weight: 800 !important;
              white-space: nowrap !important;
            }
            .sticker-barcode-wrapper {
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              height: 9.5mm !important;
              max-height: 9.5mm !important;
              overflow: hidden !important;
              margin: 0 auto !important;
              width: 100% !important;
            }
            .sticker-barcode-wrapper svg {
              height: 100% !important;
              max-height: 9.5mm !important;
              width: 100% !important;
              max-width: 44mm !important;
              display: block !important;
            }
            .sticker-footer-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: flex-end !important;
              font-size: 7.5pt !important;
              line-height: 1 !important;
              margin-top: 0.4mm !important;
            }
            .sticker-code-id {
              font-size: 7.5pt !important;
              font-weight: 700 !important;
              font-family: 'Courier New', monospace !important;
            }
            .sticker-mrp-price {
              font-size: 8.5pt !important;
              font-weight: 800 !important;
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

  // --- Browser & USB Print Handlers ---
  const handleBrowserPrintCurrent = () => {
    if (!selectedItem) return;
    printStickersViaIframe(false);
  };

  // --- USB Printer Handler ---
  const handleUSBPrintCurrent = async () => {
    if (!selectedItem) return;

    if (qzConnected && selectedQZPrinter) {
      const copyQty = Number(quantity) || 1;
      const toastId = toast.loading(`Printing ${copyQty} sticker(s) on ${labelColumns}-Column roll to ${selectedQZPrinter}...`);

      try {
        const stickerItems = getStickersList(false);

        if (printMode === 'image') {
          // --- HIGH-PRECISION BITMAP RASTER MODE ---
          const previewElem = document.getElementById('physical-sticker-preview');
          if (!previewElem) throw new Error("Sticker preview element not found");

          const canvas = await html2canvas(previewElem, {
            scale: 3,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
          });

          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

          const qz = window.qz;
          const config = qz.configs.create(selectedQZPrinter, {
            size: { width: Number(labelColumns) === 2 ? 104 : Number(labelWidth), height: Number(labelHeight) },
            units: 'mm',
            density: 203,
            copies: copyQty,
            rotation: Number(labelDirection) === 1 ? 180 : 0
          });

          const data = [{
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: base64Data
          }];

          await qz.print(config, data);
          toast.success(`Printed ${copyQty} sticker(s) successfully!`, { id: toastId });
          return;
        } else {
          // --- TSPL MODE (RECOMMENDED FOR 2-UP ROLL) ---
          const tsplCode = buildTSPLBuffer(stickerItems);
          const encoder = new TextEncoder();
          await printRawUSB(encoder.encode(tsplCode));
          toast.success(`Sent ${copyQty} stickers (${barcodeValue}) to USB printer!`, { id: toastId });
          return;
        }
      } catch (err) {
        console.error("USB Print Error:", err);
        toast.error(`Direct USB print note: ${err.message || 'Check printer'}. Opening Windows Driver...`, { id: toastId });
      }
    }

    // Fallback: Windows Printer Driver Print via isolated iframe
    toast("Opening Windows USB Printer Driver...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe(false);
    }, 150);
  };

  // USB Batch Print
  const handleUSBPrintBatch = async () => {
    if (printQueue.length === 0) {
      toast.error("Print queue is empty!");
      return;
    }

    const totalCount = printQueue.reduce((a, c) => a + c.quantity, 0);

    if (qzConnected && selectedQZPrinter) {
      const toastId = toast.loading(`Printing ${labelColumns}-Column queue batch (${totalCount} stickers) to ${selectedQZPrinter}...`);

      try {
        const flattenedStickers = getStickersList(true);

        if (printMode === 'tspl') {
          const tsplCode = buildTSPLBuffer(flattenedStickers);
          const encoder = new TextEncoder();
          await printRawUSB(encoder.encode(tsplCode));
          toast.success(`Printed ${totalCount} stickers on ${labelColumns}-Column roll!`, { id: toastId });
          return;
        } else {
          const qz = window.qz;
          const config = qz.configs.create(selectedQZPrinter, {
            size: { width: Number(labelColumns) === 2 ? 104 : Number(labelWidth), height: Number(labelHeight) },
            units: 'mm',
            density: 203,
            rotation: Number(labelDirection) === 1 ? 180 : 0
          });

          const previewElem = document.getElementById('physical-sticker-preview');
          const canvas = await html2canvas(previewElem, { scale: 3, backgroundColor: '#ffffff', logging: false });
          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

          const data = flattenedStickers.map(() => ({
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: base64Data
          }));

          await qz.print(config, data);
          toast.success(`Batch printed ${totalCount} sticker(s)!`, { id: toastId });
          return;
        }
      } catch (err) {
        console.error("Batch USB Print Error:", err);
      }
    }

    // Fallback: Trigger Browser Print for entire batch via isolated iframe
    toast("Opening Windows USB Print dialog for batch...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe(true);
    }, 150);
  };

  return (
    <div className="barcode-generator-page">
      {/* Printable Area for Window Print (@media print hides everything else) */}
      <div className="printable-stickers-area" ref={printAreaRef}>
        {(() => {
          const itemsToRender = getStickersList(printQueue.length > 0);
          const cols = Number(labelColumns) || 2;
          const rows = [];
          for (let i = 0; i < itemsToRender.length; i += cols) {
            rows.push({
              left: itemsToRender[i],
              right: cols === 2 ? (itemsToRender[i + 1] || null) : null
            });
          }

          return rows.map((row, rIdx) => (
            <div key={`print-row-${rIdx}`} className="sticker-print-row">
              {/* Left Sticker */}
              <div className="print-sticker-card">
                <div className="sticker-header-title">{STORE_NAME}</div>
                <div className="sticker-sub-row">
                  <span className="sticker-item-name">{row.left.itemName}</span>
                  <span className="sticker-weight-tag">{row.left.weightLabel}</span>
                </div>
                <div className="sticker-barcode-wrapper">
                  <svg 
                    ref={node => {
                      if (node) {
                        try {
                          JsBarcode(node, row.left.barcodeValue, {
                            format: "CODE128",
                            lineColor: "#000000",
                            width: 1.5,
                            height: 30,
                            displayValue: false,
                            margin: 0
                          });
                        } catch(e) {}
                      }
                    }} 
                  />
                </div>
                <div className="sticker-footer-row">
                  <span className="sticker-code-id">{row.left.barcodeId}</span>
                  <span className="sticker-mrp-price">MRP: {row.left.mrp}/-</span>
                </div>
              </div>

              {/* Right Sticker */}
              {cols === 2 && (
                row.right ? (
                  <div className="print-sticker-card">
                    <div className="sticker-header-title">{STORE_NAME}</div>
                    <div className="sticker-sub-row">
                      <span className="sticker-item-name">{row.right.itemName}</span>
                      <span className="sticker-weight-tag">{row.right.weightLabel}</span>
                    </div>
                    <div className="sticker-barcode-wrapper">
                      <svg 
                        ref={node => {
                          if (node) {
                            try {
                              JsBarcode(node, row.right.barcodeValue, {
                                format: "CODE128",
                                lineColor: "#000000",
                                width: 1.5,
                                height: 30,
                                displayValue: false,
                                margin: 0
                              });
                            } catch(e) {}
                          }
                        }} 
                      />
                    </div>
                    <div className="sticker-footer-row">
                      <span className="sticker-code-id">{row.right.barcodeId}</span>
                      <span className="sticker-mrp-price">MRP: {row.right.mrp}/-</span>
                    </div>
                  </div>
                ) : (
                  <div className="print-sticker-card blank-sticker" />
                )
              )}
            </div>
          ));
        })()}
      </div>

      {/* Screen UI Header */}
      <div className="barcode-header-bar">
        <div className="barcode-title-group">
          <div className="barcode-icon-badge">
            <Barcode size={24} />
          </div>
          <div>
            <h1 className="barcode-page-title">Barcode Sticker Generator</h1>
            <p className="barcode-page-subtitle">Select item, weight & quantity to print 2-column thermal barcodes</p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="barcode-header-actions">
          <button 
            className="barcode-btn barcode-btn-secondary" 
            onClick={handleBrowserPrintCurrent}
            disabled={!selectedItem}
          >
            <Printer size={16} />
            Direct Windows Driver Print
          </button>

          <button 
            className="barcode-btn barcode-btn-primary" 
            onClick={handleUSBPrintCurrent}
            disabled={!selectedItem}
          >
            <Usb size={16} />
            Print Stickers ({quantity} Copies)
          </button>
        </div>
      </div>

      {/* USB PRINTER STATUS & SETUP BANNER */}
      {qzConnected && /pdf|fax|onenote|xps|document writer|microsoft/i.test(selectedQZPrinter || '') && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', padding: '14px 20px', borderRadius: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={22} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '800', color: '#991b1b', fontSize: '14px' }}>
                Virtual File Printer Selected: "{selectedQZPrinter}"
              </div>
              <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>
                This is why Windows opens a "Save File" dialog instead of printing to paper. Please select your physical USB Sticker Printer (e.g. TSC, TVS, Xprinter, Zebra).
              </div>
            </div>
          </div>
          <button className="barcode-btn barcode-btn-primary" style={{ background: '#dc2626', border: 'none', whiteSpace: 'nowrap' }} onClick={() => setShowQZModal(true)}>
            Select Physical USB Printer
          </button>
        </div>
      )}

      <div className="usb-printer-control-banner">
        <div className="usb-banner-info">
          <div className={`usb-status-dot ${qzConnected ? 'active' : 'inactive'}`} />
          <div>
            <h4 className="usb-banner-title">
              {qzConnected ? `QZ Tray USB Active: ${selectedQZPrinter || 'Printer Connected'}` : 'USB Thermal Printer Setup'}
            </h4>
            <p className="usb-banner-sub">
              {qzConnected 
                ? '2-Column 2-Up TSPL sticker printing is active.' 
                : 'QZ Tray desktop app is disconnected. You can connect QZ Tray for silent printing OR use Direct Windows Driver print.'}
            </p>
          </div>
        </div>

        <div className="usb-banner-actions">
          {qzConnected ? (
            <>
              <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZModal(true)}>
                <Settings2 size={14} /> Change Printer
              </button>
              <button className="barcode-btn barcode-btn-outline" onClick={disconnectQZTray}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="barcode-btn barcode-btn-primary" onClick={connectQZTray} disabled={qzConnecting}>
                <RefreshCw size={14} className={qzConnecting ? 'animate-spin' : ''} />
                {qzConnecting ? `Connecting (${qzConnectTimer}s)...` : 'Connect QZ Tray USB'}
              </button>

              <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZSetupGuide(true)}>
                <HelpCircle size={14} /> Setup & Download Guide
              </button>
            </>
          )}
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
                const barcodeId = extractCleanNumericBarcodeId(item);

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

          {/* Step 3: Quantity, Pricing & Barcode ID */}
          <div className="card-section-header margin-top">
            <Sliders size={18} />
            <h3>3. Quantity & Barcode Details</h3>
          </div>

          <div className="form-row-2col">
            <div className="form-group">
              <label>Sticker Quantity (Copies)</label>
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
              <label>Item Barcode ID (e.g. 1004)</label>
              <div className="input-with-unit">
                <span className="unit-prefix"><Hash size={14} /></span>
                <input 
                  type="text" 
                  value={customBarcodeId}
                  placeholder="1004"
                  onChange={(e) => setCustomBarcodeId(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-group margin-top">
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

          {/* Step 4: Barcode Format Settings */}
          <div className="form-group margin-top">
            <label>Barcode String Format</label>
            <div className="format-toggle-group">
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'asterisk' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('asterisk')}
              >
                Delimited (1004*0400)
              </button>
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'numeric' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('numeric')}
              >
                Numeric (10040400)
              </button>
            </div>
          </div>

          {/* Step 5: Printer Calibration & 2-Column Settings */}
          <div className="card-section-header margin-top" style={{ cursor: 'pointer' }} onClick={() => setShowCalibration(!showCalibration)}>
            <Settings2 size={18} />
            <h3>4. Printer Calibration & 2-Column Settings</h3>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b' }}>{showCalibration ? '▲ Hide' : '▼ Expand'}</span>
          </div>

          {showCalibration && (
            <motion.div 
              className="calibration-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="form-group">
                <label>Sticker Paper Roll Layout</label>
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

              <div className="form-group margin-top">
                <label>Print Engine Mode</label>
                <div className="format-toggle-group">
                  <button 
                    type="button" 
                    className={`toggle-btn ${printMode === 'tspl' ? 'active' : ''}`}
                    onClick={() => setPrintMode('tspl')}
                  >
                    TSPL Mode (2-Column Align)
                  </button>
                  <button 
                    type="button" 
                    className={`toggle-btn ${printMode === 'image' ? 'active' : ''}`}
                    onClick={() => setPrintMode('image')}
                  >
                    Image Mode (HTML Canvas)
                  </button>
                </div>
              </div>

              <div className="form-row-2col margin-top">
                <div className="form-group">
                  <label>Single Label Width (mm)</label>
                  <input 
                    type="number" 
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
                <div className="form-group">
                  <label>Single Label Height (mm)</label>
                  <input 
                    type="number" 
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
              </div>

              {labelColumns === 2 && (
                <div className="form-group margin-top">
                  <label>Gap Between 2 Columns (mm)</label>
                  <input 
                    type="number" 
                    value={labelGap}
                    onChange={(e) => setLabelGap(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
              )}

              <div className="form-group margin-top">
                <label>Label Feed Orientation / Rotation</label>
                <select 
                  value={labelDirection} 
                  onChange={(e) => setLabelDirection(Number(e.target.value))}
                  className="calibration-select"
                >
                  <option value={0}>0° Standard Top-to-Bottom</option>
                  <option value={1}>180° Inverted (Rotated upside down)</option>
                </select>
              </div>

              {printMode === 'tspl' && (
                <div className="form-row-2col margin-top">
                  <div className="form-group">
                    <label>X-Offset Alignment (dots)</label>
                    <input 
                      type="number" 
                      value={xOffset}
                      onChange={(e) => setXOffset(Number(e.target.value))}
                      className="calibration-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Y-Offset Alignment (dots)</label>
                    <input 
                      type="number" 
                      value={yOffset}
                      onChange={(e) => setYOffset(Number(e.target.value))}
                      className="calibration-input"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="form-actions-row margin-top">
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
              <h3>Live Sticker Preview {labelColumns === 2 ? '(2-Up Side-by-Side Row)' : '(1-Column)'}</h3>
              <span className="live-tag">Exact Thermal Output</span>
            </div>

            <div className="sticker-preview-wrapper">
              <div className="preview-row-container" style={{ display: 'flex', gap: '8px', justifyContent: 'center', width: '100%' }}>
                {/* Column 1 (Left Sticker) */}
                <div className="physical-sticker-preview" id="physical-sticker-preview" style={{ flex: 1 }}>
                  <div className="preview-col-tag">Left Column (1)</div>
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
                      {customBarcodeId || extractCleanNumericBarcodeId(selectedItem)}
                    </span>
                    <span className="preview-mrp">MRP: {customPrice || 360}/-</span>
                  </div>
                </div>

                {/* Column 2 (Right Sticker) if 2-Column Mode */}
                {labelColumns === 2 && (
                  <div className="physical-sticker-preview" style={{ flex: 1 }}>
                    <div className="preview-col-tag">Right Column (2)</div>
                    {/* Header: SRI RAJU SWEETS */}
                    <div className="preview-store-header">{STORE_NAME}</div>
                    
                    {/* Second Line: Item Name (Left) | Weight (Right) */}
                    <div className="preview-item-row">
                      <span className="preview-item-name">{selectedItem?.name || 'Kaju Kalakan'}</span>
                      <span className="preview-weight">{getFormattedWeightLabel()}</span>
                    </div>

                    {/* Third Line: Barcode Graphics */}
                    <div className="preview-barcode-container">
                      <svg ref={barcodeRightRef} className="preview-barcode-svg" />
                    </div>

                    {/* Fourth & Fifth Line: Barcode ID (Left) | MRP (Right) */}
                    <div className="preview-footer-row">
                      <span className="preview-barcode-id">
                        {customBarcodeId || extractCleanNumericBarcodeId(selectedItem)}
                      </span>
                      <span className="preview-mrp">MRP: {customPrice || 360}/-</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="preview-info-box">
              <div className="info-item">
                <span className="info-label">Scanned Barcode:</span>
                <span className="info-val monospace" style={{ fontWeight: '700', color: '#047857' }}>{barcodeValue}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Print Roll Format:</span>
                <span className="info-val">{labelColumns} Stickers Across / Row</span>
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
                Print Labels ({quantity})
              </button>

              <button 
                className="barcode-btn barcode-btn-secondary flex-1"
                onClick={handleBrowserPrintCurrent}
                disabled={!selectedItem}
              >
                <FileText size={16} />
                Windows Print / PDF
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

      {/* ========================================== */}
      {/* IN-PAGE QZ TRAY MODALS                     */}
      {/* ========================================== */}

      {/* 1. Printer Selection Modal */}
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

      {/* 2. QZ Tray Connection & Setup Guide Modal */}
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
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>USB Thermal Printer Setup Guide</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowQZSetupGuide(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0 }}>
                  For <strong>silent direct USB printing</strong> without browser popups, the free <strong>QZ Tray</strong> desktop service must be running on your computer.
                </p>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}>Quick Setup Instructions:</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li>
                      Download QZ Tray (Free for Windows):{' '}
                      <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700', textDecoration: 'underline' }}>
                        qz.io/download <ExternalLink size={12} style={{ display: 'inline' }} />
                      </a>
                    </li>
                    <li>Install and open <strong>QZ Tray</strong> from your Windows Start Menu.</li>
                    <li>If Windows requests permission, select <strong>"Allow Access / Always Trust"</strong>.</li>
                    <li>Click the <strong>Retry Connect</strong> button below.</li>
                  </ol>
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '12px', color: '#166534' }}>
                  <strong>Alternative Option:</strong> You can also print directly to any USB printer using <strong>Windows Printer Driver Direct Print</strong> without installing QZ Tray!
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button className="barcode-btn barcode-btn-secondary" onClick={() => { setShowQZSetupGuide(false); handleBrowserPrintCurrent(); }}>
                  <Printer size={14} /> Use Windows Driver
                </button>
                <button
                  className="barcode-btn barcode-btn-primary"
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await connectQZTray();
                  }}
                >
                  <RefreshCw size={14} /> Retry Connect
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

export default BarcodeGenerator;
