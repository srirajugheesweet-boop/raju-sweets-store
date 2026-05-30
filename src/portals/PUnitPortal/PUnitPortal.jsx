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
  Printer,
  X
} from 'lucide-react';
import { printRawToQZ } from '../../utils/qzTray';
import { usePrinter } from '../../context/PrinterContext';
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
  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

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



  // --- Box Packing Handlers ---
  const handleOpenEditDetails = (order) => {
    setEditingOrderDetails(order);
    setPUnitDescription(order.pUnitDescription || '');
    
    // Check if the order already has dynamic boxes
    if (order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0) {
      setBoxes(order.boxes.map((b, idx) => ({ id: b.id || `box_${Date.now()}_${idx}_${Math.random()}`, ...b })));
    } else if (order.boxContents) {
      setBoxes([{ id: `box_${Date.now()}_0`, boxNum: 1, contents: order.boxContents }]);
    } else {
      setBoxes([{ id: `box_${Date.now()}_0`, boxNum: 1, contents: '' }]);
    }
  };

  const handleAddBox = () => {
    setBoxes(prev => {
      const newBox = { id: `box_${Date.now()}_${Math.random()}`, boxNum: 1, contents: '' };
      const updated = [newBox, ...prev];
      return updated.map((b, idx) => ({
        ...b,
        boxNum: idx + 1
      }));
    });
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
    if (bluetoothConnected) {
      printDirectToBluetooth(order, boxesList, notes);
    } else if (qzConnected && selectedQZPrinter) {
      printDirectToQZ(order, boxesList, notes);
    } else {
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToQZ = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job to USB printer via QZ Tray...", { id: 'qz-print-job' });
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
        await printRawUSB(dataArray);
        await new Promise(resolve => setTimeout(resolve, 800)); // wait between boxes
      }
      toast.dismiss('qz-print-job');
      toast.success("Printed successfully to USB printer!");
    } catch (err) {
      console.error("QZ USB print error: ", err);
      toast.dismiss('qz-print-job');
      toast.error("Failed to print to USB. Opening system print fallback...");
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToBluetooth = async (order, boxesList, notes = '') => {
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
        
        await printRawBLE(dataArray);
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

  const calculateOverallOrderStatus = (items) => {
    if (!items || items.length === 0) return 'new';
    const getStatus = (item) => (item.status || 'preparation_started').toLowerCase().trim();
    const allDelivered = items.every(item => getStatus(item) === 'delivered');
    if (allDelivered) return 'Delivered';
    const allReceived = items.every(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (allReceived) return 'Ready for Delivery';
    const someReceived = items.some(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (someReceived) return 'Partially Ready for Delivery';
    const allMoved = items.every(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (allMoved) return 'Moved to Store';
    const someMoved = items.some(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (someMoved) return 'Partially Moved to Store';
    const hasProgressed = items.some(item => {
      const st = getStatus(item);
      return st !== 'preparation_started' && st !== 'new' && st !== '';
    });
    if (hasProgressed) return 'In Progress';
    return 'new';
  };

  const handleUpdateSingleItemStatus = async (orderDocId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderDocId);
      const order = orders.find(o => o.id === orderDocId);
      if (!order) return;

      const newItems = order.items.map((item, idx) => {
        if (idx === itemIndex) {
          return { ...item, status: newStatus };
        }
        return { ...item };
      });
      const overallStatus = calculateOverallOrderStatus(newItems);
      await updateDoc(orderRef, { 
        items: newItems,
        status: overallStatus
      });
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
                                        <option value="received_at_store">Received at Store</option>
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
                      <div key={box.id || index} className="pu-modal-box-row animate-fade-in">
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

          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default PUnitPortal;
