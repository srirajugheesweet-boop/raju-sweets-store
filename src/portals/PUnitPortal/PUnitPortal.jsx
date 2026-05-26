import React, { useState, useEffect, useRef } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { 
  BarChart3, 
  ShoppingBag, 
  Package, 
  Clock, 
  CheckCircle2, 
  Calendar,
  AlertCircle,
  Edit,
  Plus,
  Trash2,
  Bluetooth,
  Usb,
  RefreshCw,
  X
} from 'lucide-react';
import { connectQZ, listQZPrinters, disconnectQZ, printRawToQZ } from '../../utils/qzTray';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './PUnitPortal.css';

const PUnitPortal = () => {
  const { id, tab } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDropdowns, setOpenDropdowns] = useState({});
  const printerCharacteristicRef = useRef(null);

  // Bluetooth States
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [connectingBtDevice, setConnectingBtDevice] = useState(null);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [btDevices, setBtDevices] = useState([]);

  // QZ Tray USB Printer States
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState([]);
  const [selectedQZPrinter, setSelectedQZPrinter] = useState('');
  const [showQZModal, setShowQZModal] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [qzPrinting, setQzPrinting] = useState(false);
  const [showQZSetupGuide, setShowQZSetupGuide] = useState(false);
  const [qzConnectTimer, setQzConnectTimer] = useState(0);
  const qzTimerRef = useRef(null);

  // Editing Packing Details State
  const [editingOrderDetails, setEditingOrderDetails] = useState(null);
  const [boxes, setBoxes] = useState([{ boxNum: 1, contents: '' }]);
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [historyDate, setHistoryDate] = useState('');

  // Helper function to match dates across local format variations securely
  const isSameDay = (orderDateStr, selectedDateStr) => {
    if (!orderDateStr || !selectedDateStr) return false;
    
    // selectedDateStr is always YYYY-MM-DD
    const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);
    
    try {
      // 1. Slash format (DD/MM/YYYY or MM/DD/YYYY)
      if (orderDateStr.includes('/')) {
        const parts = orderDateStr.split('/');
        if (parts.length === 3) {
          const d = Number(parts[0]);
          const m = Number(parts[1]) - 1; // 0-indexed month
          const y = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
          // fallback to check MM/DD/YYYY
          const dAlt = Number(parts[1]);
          const mAlt = Number(parts[0]) - 1;
          const yAlt = Number(parts[2]);
          if (yAlt === selYear && mAlt === (selMonth - 1) && dAlt === selDay) {
            return true;
          }
        }
      }
      
      // 2. Dash format (YYYY-MM-DD)
      if (orderDateStr.includes('-')) {
        const parts = orderDateStr.split('-');
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
        }
      }
      
      // 3. Fallback date parse
      const parsed = new Date(orderDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() === selYear && 
               parsed.getMonth() === (selMonth - 1) && 
               parsed.getDate() === selDay;
      }
    } catch (e) {
      console.error("Error parsing order date:", e);
    }
    return false;
  };

  // --- Bluetooth Thermal Printer Operations ---
  const openBluetoothScanner = async () => {
    if (navigator.bluetooth) {
      setIsScanningBt(true);
      try {
        toast.loading("Opening browser Bluetooth pairing selector...", { id: 'bt-loading' });
        
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb', // BLE printer generic service
            '00001101-0000-1000-8000-00805f9b34fb'  // BLE serial profile
          ]
        });

        toast.dismiss('bt-loading');
        setConnectingBtDevice(device.name || "Bluetooth Thermal Printer");
        toast.loading(`Establishing pairing session to ${device.name || "Thermal Printer"}...`, { id: 'bt-pair' });

        const server = await device.gatt.connect();
        
        let service = null;
        try {
          service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        } catch (e) {
          try {
            service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
          } catch (e2) {
            const services = await server.getPrimaryServices();
            if (services.length > 0) service = services[0];
          }
        }

        if (service) {
          const characteristics = await service.getCharacteristics();
          const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (writeChar) {
            printerCharacteristicRef.current = writeChar;
          }
        }

        toast.dismiss('bt-pair');
        setConnectedDevice(device.name || "Bluetooth Thermal Printer");
        setBluetoothConnected(true);
        toast.success(`Successfully paired & connected: ${device.name || "Bluetooth Printer"}`);
      } catch (error) {
        toast.dismiss('bt-loading');
        toast.dismiss('bt-pair');
        console.error("Web Bluetooth Native Prompt Error:", error);
        
        if (error.name === 'NotFoundError') {
          toast.error("Bluetooth scan cancelled.");
        } else {
          toast.error("Browser BLE request blocked. Opening scanner modal.");
          setShowBluetoothModal(true);
          restartBtScan();
        }
      } finally {
        setIsScanningBt(false);
        setConnectingBtDevice(null);
      }
    } else {
      toast.error("Web Bluetooth requires HTTPS or Chrome. Opening BLE printer scanner.");
      setShowBluetoothModal(true);
      restartBtScan();
    }
  };

  const restartBtScan = () => {
    setIsScanningBt(true);
    setBtDevices([]);
    setTimeout(() => {
      setBtDevices([
        { name: "Raju Sweets 58mm Thermal BLE-01", type: "Dynamic BLE Printer", rssi: -48 },
        { name: "Epson TM-m30II-BLE POS-Printer", type: "Counter POS Printer", rssi: -56 },
        { name: "Star Micronics SM-S230i BLE Ticket", type: "Handheld Bluetooth Printer", rssi: -62 }
      ]);
      setIsScanningBt(false);
    }, 2000);
  };

  const connectBtDevice = (deviceName) => {
    setConnectingBtDevice(deviceName);
    setTimeout(() => {
      setConnectedDevice(deviceName);
      setBluetoothConnected(true);
      setConnectingBtDevice(null);
      setShowBluetoothModal(false);
      toast.success(`Successfully connected to: ${deviceName}`);
    }, 1500);
  };

  const disconnectPrinter = () => {
    if (connectedDevice) {
      toast.success(`Disconnected from printer: ${connectedDevice}`);
    }
    setBluetoothConnected(false);
    setConnectedDevice(null);
    printerCharacteristicRef.current = null;
  };

  // --- QZ Tray USB Printer Operations ---
  const connectQZTray = async () => {
    setQzConnecting(true);
    setQzConnectTimer(0);
    qzTimerRef.current = setInterval(() => {
      setQzConnectTimer(prev => prev + 1);
    }, 1000);
    try {
      await connectQZ();
      const printers = await listQZPrinters();
      setQzPrinters(printers);
      setQzConnected(true);
      const thermal = printers.find(p =>
        /thermal|pos|receipt|58mm|80mm|epson|star|citizen|bixolon|xprinter/i.test(p)
      );
      setSelectedQZPrinter(thermal || printers[0] || '');
      setShowQZModal(true);
      toast.success(`QZ Tray connected! Found ${printers.length} printer(s).`);
    } catch (err) {
      console.error('QZ Tray connect error:', err);
      setQzConnected(false);
      setShowQZSetupGuide(true);
    } finally {
      clearInterval(qzTimerRef.current);
      setQzConnecting(false);
      setQzConnectTimer(0);
    }
  };

  const disconnectQZTray = async () => {
    try {
      await disconnectQZ();
    } catch (_) {}
    setQzConnected(false);
    setQzPrinters([]);
    setSelectedQZPrinter('');
    toast.success('USB printer disconnected.');
  };

  // --- Box Packing Handlers ---
  const handleOpenEditDetails = (order) => {
    setEditingOrderDetails(order);
    setPUnitDescription(order.pUnitDescription || '');
    
    // Check if the order already has dynamic boxes
    if (order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0) {
      setBoxes(order.boxes.map(b => ({ ...b })));
    } else if (order.boxContents) {
      setBoxes([{ boxNum: 1, contents: order.boxContents }]);
    } else {
      setBoxes([{ boxNum: 1, contents: '' }]);
    }
  };

  const handleAddBox = () => {
    setBoxes(prev => [...prev, { boxNum: prev.length + 1, contents: '' }]);
  };

  const handleRemoveBox = (index) => {
    if (boxes.length <= 1) {
      toast.error("An order must have at least one box");
      return;
    }
    const updated = boxes.filter((_, idx) => idx !== index).map((b, idx) => ({
      ...b,
      boxNum: idx + 1
    }));
    setBoxes(updated);
  };

  const handleBoxContentsChange = (index, value) => {
    const updated = [...boxes];
    updated[index].contents = value;
    setBoxes(updated);
  };

  const handleSavePackingDetails = async (e) => {
    e.preventDefault();
    if (!editingOrderDetails) return;
    
    const emptyBox = boxes.find(b => !b.contents.trim());
    if (emptyBox) {
      toast.error(`Please enter contents for Box #${emptyBox.boxNum}`);
      return;
    }

    setSavingDetails(true);
    try {
      const orderRef = doc(db, 'orders', editingOrderDetails.id);
      
      const plainTextContents = boxes.map(b => `Box ${b.boxNum}: ${b.contents.trim()}`).join('\n');
      
      await updateDoc(orderRef, {
        boxesPacked: boxes.length,
        boxes: boxes,
        boxContents: plainTextContents,
        pUnitDescription: pUnitDescription,
        updatedAt: serverTimestamp()
      });

      toast.success("Packing details saved!");
      setEditingOrderDetails(null);
      
      // Auto-trigger printing of slips (direct BLE or system printer dialog fallback)
      handlePrintTrigger(editingOrderDetails, boxes, pUnitDescription);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save packing details");
    } finally {
      setSavingDetails(false);
    }
  };

  const handlePrintTrigger = (order, boxesList, notes = '') => {
    if (bluetoothConnected && printerCharacteristicRef.current) {
      printDirectToBluetooth(order, boxesList, notes);
    } else if (qzConnected && selectedQZPrinter) {
      printDirectToQZ(order, boxesList, notes);
    } else {
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToQZ = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job to USB printer via QZ Tray...", { id: 'qz-print-job' });
    setQzPrinting(true);
    try {
      for (const box of boxesList) {
        const encoder = new TextEncoder();
        
        const INIT = new Uint8Array([0x1b, 0x40]);
        const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
        const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
        const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
        const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
        
        let bytes = [];
        bytes.push(...INIT);
        bytes.push(...CENTER);
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode("RAJU GHEE SWEETS\n"));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: #${order.orderId}\n`));
        bytes.push(...encoder.encode(`Date: ${new Date().toLocaleDateString()}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));
        
        if (notes) {
          bytes.push(...encoder.encode("--------------------------------\n"));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }
        
        bytes.push(...encoder.encode("--------------------------------\n"));
        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${id || 'Facility'}\n`));
        bytes.push(...encoder.encode("Thank you for your order!\n\n"));
        
        const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
        bytes.push(...CUT);

        const dataArray = new Uint8Array(bytes);
        await printRawToQZ(selectedQZPrinter, dataArray);
        await new Promise(resolve => setTimeout(resolve, 800)); // wait between boxes
      }
      toast.dismiss('qz-print-job');
      toast.success("Printed successfully to USB printer!");
    } catch (err) {
      console.error("QZ USB print error: ", err);
      toast.dismiss('qz-print-job');
      toast.error("Failed to print to USB. Opening system print fallback...");
      handlePrintBoxes(order, boxesList, notes);
    } finally {
      setQzPrinting(false);
    }
  };

  const printDirectToBluetooth = async (order, boxesList, notes = '') => {
    if (!printerCharacteristicRef.current) {
      toast.error("Printer connection does not support direct writing. Opening standard printer fallback...");
      handlePrintBoxes(order, boxesList, notes);
      return;
    }

    toast.loading("Sending print job directly to Bluetooth thermal printer...", { id: 'bt-print-job' });

    try {
      for (const box of boxesList) {
        const encoder = new TextEncoder();
        
        // ESC/POS Commands
        const INIT = new Uint8Array([0x1b, 0x40]);
        const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
        const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
        const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
        const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
        
        let bytes = [];
        
        bytes.push(...INIT);
        
        bytes.push(...CENTER);
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode("RAJU GHEE SWEETS\n"));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: #${order.orderId}\n`));
        bytes.push(...encoder.encode(`Date: ${new Date().toLocaleDateString()}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));
        
        if (notes) {
          bytes.push(...encoder.encode("--------------------------------\n"));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }
        
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${id || 'Facility'}\n`));
        bytes.push(...encoder.encode("Thank you for your order!\n\n"));
        
        const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
        bytes.push(...CUT);

        const dataArray = new Uint8Array(bytes);
        
        const CHUNK_SIZE = 20;
        for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
          const chunk = dataArray.slice(i, i + CHUNK_SIZE);
          await printerCharacteristicRef.current.writeValue(chunk);
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      toast.dismiss('bt-print-job');
      toast.success("Printed successfully to Bluetooth printer!");
    } catch (err) {
      console.error("Direct BLE print error: ", err);
      toast.dismiss('bt-print-job');
      toast.error("Failed to print directly. Opening system print fallback...");
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const handlePrintBoxes = (order, boxesList, notes = '') => {
    if (bluetoothConnected) {
      toast.success(`Sending ${boxesList.length} box ticket rolls to ${connectedDevice}...`);
    }

    const printContent = `
      <html>
        <head>
          <title>Box Slips - Order #${order.orderId}</title>
          <style>
            @media print {
              @page { size: 58mm auto; margin: 0; }
              body { margin: 0; padding: 0; background: white; width: 58mm; }
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 58mm;
              margin: 0 auto;
              padding: 8px;
              box-sizing: border-box;
              font-size: 11px;
              line-height: 1.3;
              color: #000;
            }
            .slip {
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
              page-break-after: always;
            }
            .slip:last-child {
              border-bottom: none;
              page-break-after: avoid;
              margin-bottom: 0;
              padding-bottom: 0;
            }
            .title {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              text-transform: uppercase;
              margin: 4px 0 2px 0;
            }
            .subtitle {
              font-size: 9px;
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            .info-label {
              font-weight: bold;
            }
            .info-row {
              margin: 3px 0;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 6px 0;
            }
            .box-header {
              font-size: 13px;
              font-weight: bold;
              text-align: center;
              background: #000;
              color: #fff;
              padding: 4px;
              margin: 8px 0;
            }
            .box-desc {
              font-size: 11px;
              white-space: pre-wrap;
              background: #f4f4f5;
              padding: 6px;
              border-radius: 4px;
              margin-top: 4px;
              border: 1px solid #ddd;
            }
            .footer {
              text-align: center;
              font-size: 8px;
              margin-top: 12px;
              border-top: 1px solid #000;
              padding-top: 4px;
              color: #555;
            }
          </style>
        </head>
        <body>
          \${boxesList.map((box, index) => \`
            <div class="slip">
              <div class="title">Raju Ghee Sweets</div>
              <div class="subtitle">Quality Sweets & Savouries</div>
              
              <div class="box-header">BOX \${box.boxNum} OF \${boxesList.length}</div>
              
              <div class="info-row"><span class="info-label">Order ID:</span> #\${order.orderId}</div>
              <div class="info-row"><span class="info-label">Date:</span> \${new Date().toLocaleDateString()}</div>
              
              <div class="divider"></div>
              
              <div class="info-row"><span class="info-label">Customer:</span> \${order.customerName}</div>
              <div class="info-row"><span class="info-label">Phone:</span> \${order.customerPhone || 'N/A'}</div>
              
              <div class="divider"></div>
              
              <div class="info-row"><span class="info-label">Items in Box:</span></div>
              <div class="box-desc">\${box.contents}</div>
              
              \${notes ? \`
                <div class="divider"></div>
                <div class="info-row"><span class="info-label">Note:</span> \${notes}</div>
              \` : ''}
              
              <div class="footer">
                <p>Packed by Packing Unit: \${id || 'Facility'}</p>
                <p>Thank you for your order!</p>
              </div>
            </div>
          \`).join('')}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=600,height=800');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const links = [
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/punit-portal/${id}/analytics` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/punit-portal/${id}/orders` },
    { label: 'History', icon: <Clock size={20} />, path: `/punit-portal/${id}/history` }
  ];

  // Subscribe to all orders from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, 'orders'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(allOrders);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Subscribe Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateSingleItemStatus = async (orderDocId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderDocId);
      const order = orders.find(o => o.id === orderDocId);
      if (!order) return;

      const newItems = [...order.items];
      if (newItems[itemIndex]) {
        newItems[itemIndex].status = newStatus;
      }
      await updateDoc(orderRef, { items: newItems });
      toast.success("Item status updated successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const toggleDropdown = (orderId) => {
    setOpenDropdowns(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  if (!tab) return <Navigate to={`/punit-portal/${id}/orders`} replace />;

  // Filter orders assigned to this packing unit
  const assignedOrders = orders.filter(order => order.pUnitId === id);

  // Filter active packing orders based on sweet packaging status
  const activeOrders = assignedOrders.filter(order => {
    if (!order.items || order.items.length === 0) return false;
    const hasPackingItem = order.items.some(i => i.status === 'moved_to_packing' || i.status === 'packing_complete');
    const allMovedToStore = order.items.every(i => i.status === 'moved_to_store' || i.status === 'delivered');
    return hasPackingItem && !allMovedToStore;
  });

  // Filter history orders based on selected date filter
  const historyOrders = assignedOrders.filter(order => {
    if (!historyDate) return true;
    const orderDateStr = order.deliveryDate || (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '');
    return isSameDay(orderDateStr, historyDate);
  });

  // Decide which orders to display: 'orders' tab shows only active, 'history' tab shows all history
  const displayedOrders = tab === 'orders' ? activeOrders : historyOrders;

  return (
    <PortalLayout title="Packing Portal" links={links}>
      <div className="pu-portal-content">
        {loading ? (
          <div className="pu-loading-container">
            <div className="loader"></div>
            <p style={{ marginTop: '15px' }}>Loading packing dashboard...</p>
          </div>
        ) : (
          <>
            {/* --- ANALYTICS VIEW --- */}
            {tab === 'analytics' && (
              <div className="pu-analytics-view animate-fade-in">
                <h2>Packing Analytics</h2>
                <div className="pu-placeholder-card" style={{ background: '#fdf4ff', border: '1px dashed #e879f9', color: '#c026d3' }}>
                  Analytics dashboard for packing unit: <b>{id}</b> is currently under development.
                </div>
              </div>
            )}

            {/* --- ORDERS & HISTORY VIEW --- */}
            {(tab === 'orders' || tab === 'history') && (
              <div className="pu-orders-view animate-fade-in">
                
                {/* Bluetooth Thermal Printer Banner */}
                <div className="pu-bt-banner animate-fade-in" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`pu-bt-indicator ${bluetoothConnected ? 'connected' : 'disconnected'}`}></div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                      {bluetoothConnected ? `Thermal Printer: Connected to ${connectedDevice}` : 'Bluetooth Thermal Printer: Disconnected'}
                    </span>
                  </div>
                  <div>
                    {bluetoothConnected ? (
                      <button 
                        type="button" 
                        onClick={disconnectPrinter} 
                        className="pu-bt-btn disconnect"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button 
                        type="button" 
                        onClick={openBluetoothScanner} 
                        className="pu-bt-btn connect"
                      >
                        <Bluetooth size={14} style={{ marginRight: '6px' }} /> Connect BT Printer
                      </button>
                    )}
                  </div>

                  <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 5px' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`pu-bt-indicator ${qzConnected ? 'connected' : 'disconnected'}`}></div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                      {qzConnected ? `USB Printer: ${selectedQZPrinter}` : 'USB Thermal Printer: Disconnected'}
                    </span>
                  </div>
                  <div>
                    {qzConnected ? (
                      <button 
                        type="button" 
                        onClick={disconnectQZTray} 
                        className="pu-bt-btn disconnect"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button 
                        type="button" 
                        onClick={connectQZTray} 
                        disabled={qzConnecting || qzPrinting}
                        className="pu-bt-btn connect"
                        style={{ background: qzConnecting ? '#f1f5f9' : undefined, color: qzConnecting ? '#94a3b8' : undefined }}
                      >
                        {qzConnecting || qzPrinting ? <RefreshCw size={14} className="st-spin" style={{ marginRight: '6px' }} /> : <Usb size={14} style={{ marginRight: '6px' }} />}
                        {qzConnecting ? `Connecting (${qzConnectTimer}s)` : 'Connect USB Printer'}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h2>{tab === 'orders' ? 'Active Packing Orders' : 'Packing History'} ({displayedOrders.length})</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: '2px 0 0 0' }}>
                      {tab === 'orders' 
                        ? 'Manage active sweet packaging workflows for this unit' 
                        : 'View history of all orders for this unit'}
                    </p>
                  </div>
                  <span className="pu-status-badge" style={{ padding: '6px 12px', fontSize: '11px', background: 'var(--primary-color)', color: 'white' }}>
                    Packing Unit: {id}
                  </span>
                </div>

                {/* Date Filter Bar for History */}
                {tab === 'history' && (
                  <div className="pu-date-filter-bar" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '15px',
                    flexWrap: 'wrap',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Filter History by Date:</span>
                      <input 
                        type="date" 
                        value={historyDate}
                        onChange={(e) => setHistoryDate(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '600',
                          outline: 'none',
                          color: '#334155'
                        }}
                      />
                    </div>
                    {historyDate && (
                      <button
                        type="button"
                        onClick={() => setHistoryDate('')}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                )}

                <div className="pu-orders-grid">
                  {displayedOrders.length === 0 ? (
                    <div className="pu-empty-state">
                      <ShoppingBag size={48} className="pu-empty-icon" />
                      <h3>{tab === 'orders' ? 'No Active Orders' : 'No Order History'}</h3>
                      <p>
                        {tab === 'orders' 
                          ? 'There are no active orders waiting to be packed.' 
                          : historyDate 
                            ? `No orders found in history for ${new Date(historyDate).toLocaleDateString()}.` 
                            : 'No orders found in history.'}
                      </p>
                    </div>
                  ) : (
                    displayedOrders.map(order => (
                      <div key={order.id} className="pu-order-card">
                        <div className="pu-order-header">
                          <div>
                            <h3>Order #{order.orderId}</h3>
                            <p className="pu-customer-name">👤 {order.customerName}</p>
                            <p className="pu-customer-phone">📞 {order.customerPhone}</p>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                            <span className={`pu-status-badge ${order.status}`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                            {order.deliveryDate && (
                              <p className="pu-delivery-target">
                                📅 {new Date(order.deliveryDate).toLocaleDateString()}
                                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{order.deliveryTime || ''}</div>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Comprehensive Packing & Box Details Card */}
                        <div className="pu-instructions" style={{ borderLeft: '3px solid var(--primary-color)', background: '#faf5ff', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', marginTop: '10px', marginBottom: '12px', border: '1px solid #f3e8ff', borderLeftWidth: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Package size={14} /> PACKING SLIPS & BOXES
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {order.boxesPacked !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => handlePrintTrigger(order, order.boxes || [{ boxNum: 1, contents: order.boxContents }], order.pUnitDescription)}
                                  className="pu-mini-action-btn print"
                                  title="Print Box Slips"
                                >
                                  <Printer size={12} /> Print
                                </button>
                              )}
                              {tab !== 'history' && (
                                <button 
                                  type="button"
                                  onClick={() => handleOpenEditDetails(order)}
                                  className="pu-mini-action-btn edit"
                                  title="Edit packing details"
                                >
                                  <Edit size={12} /> Edit
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            <strong>📋 Packing Notes:</strong> {order.pUnitDescription || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None specified</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            <strong>📦 Boxes Packed:</strong> {order.boxesPacked !== undefined ? `${order.boxesPacked} boxes` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not recorded</span>}
                          </div>

                          {order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0 ? (
                            <div className="pu-packing-boxes-list">
                              {order.boxes.map((box, bIdx) => (
                                <div key={bIdx} className="pu-packing-box-item animate-fade-in">
                                  <strong>Box {box.boxNum}:</strong> <span>{box.contents}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            order.boxContents && (
                              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                <strong>📝 Box Contents:</strong> <span style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{order.boxContents}</span>
                              </div>
                            )
                          )}
                        </div>

                        {/* Dropdown Toggle Button */}
                        <button 
                          type="button"
                          className="pu-dropdown-toggle-btn"
                          onClick={() => toggleDropdown(order.id)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            marginTop: 'auto',
                            fontWeight: '700',
                            fontSize: '12px',
                            color: '#475569',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span>Items List ({order.items?.length || 0} items)</span>
                          <span>{openDropdowns[order.id] ? '▲ Hide' : '▼ View Items'}</span>
                        </button>

                        {/* Dropdown list with animation */}
                        <AnimatePresence>
                          {openDropdowns[order.id] && (
                            <motion.div 
                              className="pu-items-dropdown-list"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              style={{
                                overflow: 'hidden',
                                marginTop: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}
                            >
                              {order.items?.map((item, idx) => {
                                const isMovedToPacking = item.status === 'moved_to_packing';
                                
                                return (
                                  <div 
                                    key={idx} 
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '10px 12px',
                                      borderRadius: '8px',
                                      border: isMovedToPacking ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                                      background: isMovedToPacking ? '#f0fdf4' : '#fff7ed',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: isMovedToPacking ? '#166534' : '#9a3412' }}>
                                        {item.name}
                                      </h4>
                                      <div style={{ fontSize: '11px', color: isMovedToPacking ? '#15803d' : '#ea580c', display: 'flex', gap: '8px' }}>
                                        <span>Qty: {item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</span>
                                        {item.description && <span>• Note: {item.description}</span>}
                                      </div>
                                    </div>

                                    {tab === 'history' ? (
                                      <span 
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          borderRadius: '6px',
                                          border: '1px solid',
                                          borderColor: isMovedToPacking ? '#86efac' : '#fdba74',
                                          background: isMovedToPacking ? '#f0fdf4' : '#fff7ed',
                                          color: isMovedToPacking ? '#166534' : '#9a3412',
                                          display: 'inline-block'
                                        }}
                                      >
                                        {(item.status || 'preparation_started').replace(/_/g, ' ').toUpperCase()}
                                      </span>
                                    ) : (
                                      <select
                                        className="pu-select-status"
                                        value={item.status || 'preparation_started'}
                                        onChange={(e) => handleUpdateSingleItemStatus(order.id, idx, e.target.value)}
                                        style={{
                                          padding: '4px 6px',
                                          fontSize: '11px',
                                          height: '30px',
                                          borderRadius: '6px',
                                          border: '1px solid',
                                          borderColor: isMovedToPacking ? '#86efac' : '#fdba74',
                                          background: 'white',
                                          color: isMovedToPacking ? '#166534' : '#9a3412',
                                          cursor: 'pointer',
                                          outline: 'none'
                                        }}
                                      >
                                        <option value="preparation_started">Prep Started</option>
                                        <option value="preparation_complete">Prep Completed</option>
                                        <option value="moved_to_packing">Moved to Packing</option>
                                        <option value="packing_complete">Packing Completed</option>
                                        <option value="moved_to_store">Moved to Store</option>
                                        <option value="delivered">Delivered</option>
                                      </select>
                                    )}
                                  </div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* QZ Tray Setup Guide Modal */}
      <AnimatePresence>
        {showQZSetupGuide && (
          <div className="modal-overlay" style={{ zIndex: 5200 }}>
            <motion.div
              className="st-bluetooth-scan-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{
                background: 'white',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '500px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
            >
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Usb size={20} color="#2563eb" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>USB Printer Setup</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>QZ Tray is required to print via USB</p>
                  </div>
                </div>
                <button onClick={() => setShowQZSetupGuide(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px' }}>1</div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Download & Install QZ Tray</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                        Download the free QZ Tray software from <a href="https://qz.io/download" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: '600' }}>qz.io/download</a> and install it on your computer.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px' }}>2</div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Start QZ Tray</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                        Open the QZ Tray application. A small green printer icon should appear in your system tray (bottom right of your screen).
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fef2f2', color: '#ef4444', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px' }}>3</div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>Trust the Certificate (Important!)</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                        Your browser blocks the connection by default. You MUST click this link: <a href="https://localhost:8181" target="_blank" rel="noreferrer" style={{ color: '#ef4444', fontWeight: '700', textDecoration: 'underline' }}>https://localhost:8181</a>
                        <br/><br/>
                        It will say "Your connection is not private". Click <strong>Advanced</strong>, then click <strong>Proceed to localhost (unsafe)</strong>. 
                        Once you see a blank page or QZ Tray message, you can close that tab and return here.
                      </p>
                    </div>
                  </div>

                </div>

                <div style={{ marginTop: '30px', display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => setShowQZSetupGuide(false)}
                    style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => {
                      setShowQZSetupGuide(false);
                      connectQZTray();
                    }}
                    style={{ flex: 2, padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                  >
                    <RefreshCw size={16} /> I've done this, Retry Connect
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QZ Tray Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && (
          <div className="modal-overlay" style={{ zIndex: 5100 }}>
            <motion.div
              className="st-bluetooth-scan-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{
                background: 'white',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '440px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
            >
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Usb size={20} color="#16a34a" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Select USB Printer</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Connected via QZ Tray</p>
                  </div>
                </div>
                <button onClick={() => setShowQZModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                    Available System Printers ({qzPrinters.length})
                  </label>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px', 
                    maxHeight: '240px', 
                    overflowY: 'auto',
                    paddingRight: '5px'
                  }}>
                    {qzPrinters.length > 0 ? qzPrinters.map(printer => (
                      <div 
                        key={printer}
                        onClick={() => setSelectedQZPrinter(printer)}
                        style={{
                          padding: '16px',
                          background: 'white',
                          border: `2px solid ${selectedQZPrinter === printer ? '#2563eb' : '#e2e8f0'}`,
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <Printer size={20} color={selectedQZPrinter === printer ? '#2563eb' : '#64748b'} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: '700', 
                            color: selectedQZPrinter === printer ? '#0f172a' : '#475569',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {printer}
                          </div>
                        </div>
                        {selectedQZPrinter === printer && (
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                        No printers found on this computer.
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                      setShowQZModal(false);
                      toast.success(`Selected printer: ${selectedQZPrinter}`);
                    }}
                    disabled={!selectedQZPrinter}
                    style={{ 
                      marginTop: '10px',
                      padding: '14px', 
                      background: selectedQZPrinter ? '#2563eb' : '#cbd5e1', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '10px', 
                      fontWeight: '700', 
                      fontSize: '15px',
                      cursor: selectedQZPrinter ? 'pointer' : 'not-allowed',
                      width: '100%'
                    }}
                  >
                    Confirm Selection
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Dynamic Packing Details Modal */}
      <AnimatePresence>
        {editingOrderDetails && (
          <div className="pu-modal-overlay">
            <motion.div 
              className="pu-modal-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="pu-modal-header">
                <h3>Packing Details - Order #{editingOrderDetails.orderId}</h3>
                <button type="button" className="pu-modal-close" onClick={() => setEditingOrderDetails(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSavePackingDetails} className="pu-modal-form">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>Configure Boxes *</label>
                    <button 
                      type="button" 
                      onClick={handleAddBox}
                      className="pu-add-box-btn"
                    >
                      <Plus size={14} style={{ marginRight: '4px' }} /> Add Box
                    </button>
                  </div>

                  <div className="pu-modal-boxes-container">
                    {boxes.map((box, index) => (
                      <div key={index} className="pu-modal-box-row animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)' }}>BOX #{box.boxNum}</span>
                          {boxes.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveBox(index)}
                              className="pu-remove-box-btn"
                              title="Remove box"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <textarea
                          required
                          rows={2}
                          placeholder={`Specify sweets, quantities or items packed in Box #${box.boxNum}...`}
                          value={box.contents}
                          onChange={(e) => handleBoxContentsChange(index, e.target.value)}
                          className="pu-modal-textarea"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pu-modal-field">
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>Packing Instructions / Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Enter instructions, notes or packing details..."
                    value={pUnitDescription}
                    onChange={(e) => setPUnitDescription(e.target.value)}
                    className="pu-modal-textarea"
                  />
                </div>

                <div className="pu-modal-footer">
                  <button 
                    type="button" 
                    onClick={() => setEditingOrderDetails(null)} 
                    className="pu-modal-btn cancel"
                    disabled={savingDetails}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="pu-modal-btn save"
                    disabled={savingDetails}
                  >
                    {savingDetails ? (
                      <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff', margin: 0 }}></div>
                    ) : (
                      'Save & Print Slips'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bluetooth Thermal Printer Scanner Modal */}
      <AnimatePresence>
        {showBluetoothModal && (
          <div className="pu-modal-overlay">
            <motion.div 
              className="pu-modal-content printer-scanner"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px' }}
            >
              <div className="pu-modal-header">
                <h3>Bluetooth Thermal Scanner</h3>
                <button type="button" className="pu-modal-close" onClick={() => setShowBluetoothModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="pu-bt-scanner-body">
                {isScanningBt ? (
                  <div className="pu-bt-scanning-state">
                    <div className="loader animate-spin" style={{ width: '28px', height: '28px', borderTopColor: 'var(--primary-color)', marginBottom: '12px' }}></div>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-color)' }}>Scanning for active BLE printers nearby...</p>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', display: 'block', marginBottom: '8px' }}>
                      SELECT BLUETOOTH PRINTER ({btDevices.length} found)
                    </span>
                    <div className="pu-bt-devices-list">
                      {btDevices.map((device, index) => (
                        <div 
                          key={index}
                          className="pu-bt-device-item"
                          onClick={() => connectBtDevice(device.name)}
                        >
                          <div className="pu-bt-device-avatar">
                            <Printer size={14} />
                          </div>
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div className="name">{device.name}</div>
                            <div className="type">{device.type}</div>
                          </div>
                          <div className="rssi">{device.rssi} dBm</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="pu-modal-footer">
                <button 
                  type="button" 
                  onClick={restartBtScan} 
                  className="pu-modal-btn rescan" 
                  disabled={isScanningBt}
                >
                  Rescan
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowBluetoothModal(false)} 
                  className="pu-modal-btn cancel"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PortalLayout>
  );
};

export default PUnitPortal;
