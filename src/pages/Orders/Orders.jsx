import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingBag, 
  User, 
  Store, 
  X, 
  ChevronDown, 
  Scale, 
  Trash2,
  Minus,
  Calendar,
  Clock,
  ArrowRight,
  Package,
  FileText,
  CreditCard,
  Factory,
  Printer,
  Edit,
  Eye,
  ChevronUp,
  Bluetooth,
  Usb,
  RefreshCw
} from 'lucide-react';
import { connectQZ, listQZPrinters, disconnectQZ, printRawToQZ, buildOrderESCPOS } from '../../utils/qzTray';
import logo from '../../assets/logo.png';
import { db } from '../../config/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  deleteDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Orders.css';

// --- Custom Searchable Dropdown ---
const CustomDropdown = ({ label, options, onSelect, selectedValue, placeholder, icon: Icon, onCreateClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    (opt.name || opt.firstName + ' ' + opt.lastName || '').toLowerCase().includes(search.toLowerCase()) ||
    (opt.mobileNumber || opt.phone || '').includes(search)
  );

  const selectedOption = options.find(opt => opt.id === selectedValue);

  return (
    <div className="ord-dropdown" ref={dropdownRef}>
      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>{label}</label>
      <div className="ord-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={18} color="var(--primary-color)" />
          <span>
            {selectedOption 
              ? (selectedOption.name || selectedOption.firstName + ' ' + selectedOption.lastName) 
              : placeholder}
          </span>
        </div>
        <ChevronDown size={18} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="ord-dropdown-popover"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="ord-dropdown-search">
              <input 
                type="text" 
                placeholder="Search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="ord-dropdown-list">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div 
                    key={opt.id} 
                    className="ord-dropdown-item"
                    onClick={() => {
                      onSelect(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="name">{opt.name || opt.firstName + ' ' + opt.lastName}</span>
                    <span className="sub">{opt.mobileNumber || opt.phone || opt.city}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '15px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No results found</div>
                  {onCreateClick && (
                    <button 
                      type="button"
                      className="ord-create-customer-dropdown-btn"
                      onClick={() => {
                        onCreateClick(search);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      style={{
                        background: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      + Create Customer
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [previewOrder, setPreviewOrder] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);

  // Form State
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [pUnits, setPUnits] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedPUnit, setSelectedPUnit] = useState('');
  const [globalDescription, setGlobalDescription] = useState('');
  const [mUnitDescription, setMUnitDescription] = useState('');
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [cart, setCart] = useState([]);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // Bluetooth States
  const printerCharacteristicRef = useRef(null);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [connectingBtDevice, setConnectingBtDevice] = useState(null);
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

  // Create Customer Modal State
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [customerFormData, setCustomerFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    address: '',
    city: '',
    state: ''
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const handleOpenCreateCustomer = (searchVal) => {
    let initialPhone = '';
    let initialFirstName = '';
    
    if (/^\d+$/.test(searchVal)) {
      initialPhone = searchVal;
    } else {
      initialFirstName = searchVal;
    }

    setCustomerFormData({
      firstName: initialFirstName,
      lastName: '',
      mobileNumber: initialPhone,
      address: '',
      city: '',
      state: ''
    });
    setShowCreateCustomerModal(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerFormData.firstName || !customerFormData.lastName || !customerFormData.mobileNumber) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSavingCustomer(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customerFormData,
        createdAt: serverTimestamp()
      });
      
      const newCust = {
        id: docRef.id,
        ...customerFormData
      };
      
      setCustomers(prev => [newCust, ...prev].sort((a, b) => a.firstName.localeCompare(b.firstName)));
      setSelectedCustomer(docRef.id);
      
      toast.success("Customer created and selected!");
      setShowCreateCustomerModal(false);
    } catch (error) {
      console.error("Failed to save customer:", error);
      toast.error("Error creating customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showAddModal) {
      // Fetch data for the modal
      const fetchModalData = async () => {
        const [custSnap, storeSnap, itemSnap, muSnap, puSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('firstName', 'asc'))),
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'items'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'packing_units'), orderBy('name', 'asc')))
        ]);

        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setItems(itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setMUnits(muSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setPUnits(puSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      };
      fetchModalData();
    }
  }, [showAddModal]);

  const handleItemClick = (item) => {
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      setWeightInput({ weight: '', amount: '', description: '' });
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const handleWeightCalc = (type, value, price) => {
    if (type === 'weight') {
      const amt = (parseFloat(value) * price).toFixed(2);
      setWeightInput({ ...weightInput, weight: value, amount: isNaN(amt) ? '' : amt });
    } else {
      const wt = (parseFloat(value) / price).toFixed(3);
      setWeightInput({ ...weightInput, weight: isNaN(wt) ? '' : wt, amount: value });
    }
  };

  const addToCart = (item, quantity, total, itemDescription = '') => {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    
    if (existingIndex > -1) {
      const newCart = [...cart];
      if (item.unit !== 'Weight') {
        newCart[existingIndex].quantity += Number(quantity);
        newCart[existingIndex].total = newCart[existingIndex].quantity * item.price;
      } else {
        newCart[existingIndex].quantity = Number(quantity);
        newCart[existingIndex].total = Number(total);
        newCart[existingIndex].description = itemDescription;
      }
      setCart(newCart);
    } else {
      setCart([...cart, {
        id: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        quantity: Number(quantity),
        total: Number(total),
        description: itemDescription,
        mUnitId: item.mUnitId,
        status: 'preparation_started'
      }]);
    }
    toast.success(`${item.name} added`);
  };

  const updateCartQuantity = (id, delta) => {
    setCart(prev => prev.map(c => {
      if (c.id === id) {
        const newQty = c.quantity + delta;
        if (newQty < 1) return c; // don't decrement below 1
        return { ...c, quantity: newQty, total: newQty * c.price };
      }
      return c;
    }));
  };

  const handleEditCartItem = (item) => {
    const originalItem = items.find(i => i.id === item.id);
    if (!originalItem) return;
    setShowWeightModal(originalItem);
    setWeightInput({
      weight: item.quantity.toString(),
      amount: item.total.toString(),
      description: item.description || ''
    });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(c => c.id !== id));
  };

  const generateOrderId = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `ORD${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const saveOrder = async () => {
    if (!selectedCustomer) return toast.error("Please select a customer");
    if (!selectedStore) return toast.error("Please select a store");
    if (!deliveryDate) return toast.error("Please select a delivery date");
    if (!deliveryTime) return toast.error("Please select a delivery time");
    if (cart.length === 0) return toast.error("Cart is empty");

    setSubmitting(true);
    try {
      const orderId = generateOrderId();
      const customer = customers.find(c => c.id === selectedCustomer);
      const store = stores.find(s => s.id === selectedStore);

      const totalAmt = cart.reduce((sum, item) => sum + item.total, 0);
      const recAmtVal = parseFloat(receivedAmount) || 0;
      let payStatus = 'Pending';
      if (recAmtVal > 0) {
        if (recAmtVal >= totalAmt) {
          payStatus = 'Done';
        } else {
          payStatus = 'Partial';
        }
      }

      const orderData = {
        orderId,
        customerId: selectedCustomer,
        customerName: `${customer.firstName} ${customer.lastName}`,
        customerPhone: customer.mobileNumber,
        storeId: selectedStore,
        storeName: store.name,
        pUnitId: selectedPUnit,
        globalDescription,
        mUnitDescription,
        pUnitDescription,
        items: cart,
        totalAmount: totalAmt,
        receivedAmount: recAmtVal,
        paymentStatus: payStatus,
        paymentMode,
        deliveryDate,
        deliveryTime,
        status: calculateOverallOrderStatus(cart), // new, In Progress, Delivered, etc.
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (editingOrderId) {
        await updateDoc(doc(db, 'orders', editingOrderId), orderData);
        toast.success(`Order #${orderId} updated successfully!`);
      } else {
        const orderRef = await addDoc(collection(db, 'orders'), orderData);
        if (recAmtVal > 0) {
          await addDoc(collection(db, 'orders', orderRef.id, 'installments'), {
            amount: recAmtVal,
            paymentMode: paymentMode,
            notes: 'Initial Down Payment',
            createdAt: serverTimestamp()
          });
        }
        toast.success(`Order #${orderId} saved successfully!`);
      }
      
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error("Save Error:", error);
      toast.error("Failed to save order");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCustomer('');
    setSelectedStore('');
    setSelectedPUnit('');
    setGlobalDescription('');
    setMUnitDescription('');
    setPUnitDescription('');
    setCart([]);
    setPaymentMode('Cash');
    setReceivedAmount('');
    setDeliveryDate('');
    setDeliveryTime('');
    setEditingOrderId(null);
  };

  const handleEditOrder = (order) => {
    setSelectedCustomer(order.customerId);
    setSelectedStore(order.storeId);
    setSelectedPUnit(order.pUnitId || '');
    setGlobalDescription(order.globalDescription || '');
    setMUnitDescription(order.mUnitDescription || '');
    setPUnitDescription(order.pUnitDescription || '');
    setPaymentMode(order.paymentMode || 'Cash');
    setReceivedAmount(order.receivedAmount !== undefined ? order.receivedAmount.toString() : '');
    setDeliveryDate(order.deliveryDate || '');
    setDeliveryTime(order.deliveryTime || '');
    setCart(order.items || []);
    setEditingOrderId(order.id);
    setShowAddModal(true);
  };

  const handleDeleteOrder = async (id) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      try {
        await deleteDoc(doc(db, 'orders', id));
        toast.success("Order deleted successfully");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete order");
      }
    }
  };

  const handlePrintReceipt = (order) => {
    const printContent = `
      <html>
        <head>
          <title>Print Bill</title>
          <style>
            body { font-family: monospace; width: 300px; margin: 0 auto; padding: 20px; color: black; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #ccc; font-size: 12px; }
            .total { margin-top: 10px; text-align: right; font-weight: bold; font-size: 14px; }
            .divider { border-bottom: 1px dashed black; margin: 10px 0; }
            @media print {
              body { width: 100%; margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="center" style="margin-bottom: 8px;">
            <img src="${logo}" alt="Logo" style="max-height: 50px; width: auto; object-fit: contain;" />
          </div>
          <div class="center bold" style="font-size: 18px;">Raju Ghee Sweets</div>
          <div class="center" style="font-size: 12px; margin-bottom: 10px;">${order.storeName}</div>
          <div>Order: #${order.orderId}</div>
          <div>Date: ${order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : ''}</div>
          <div>Customer: ${order.customerName}</div>
          <div>Phone: ${order.customerPhone}</div>
          <div class="divider"></div>
          <table>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amt</th>
            </tr>
            ${order.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.unit === 'Weight' ? item.quantity + 'kg' : item.quantity + 'pcs'}</td>
                <td>₹${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
          <div class="divider"></div>
          <div style="font-size: 13px; line-height: 1.6; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between;">
              <span>TOTAL AMOUNT:</span>
              <span class="bold">₹${Number(order.totalAmount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>ADVANCE PAID:</span>
              <span>₹${Number(order.receivedAmount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
              <span class="bold">BALANCE DUE:</span>
              <span class="bold">₹${(Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)).toFixed(2)}</span>
            </div>
          </div>
          <div class="divider"></div>
          <div class="center" style="font-size: 12px;">Thank you for your business!</div>
          <div class="center" style="font-size: 12px; margin-top: 4px;">Please visit again.</div>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const printOrderDirectToBluetooth = async (order) => {
    if (!printerCharacteristicRef.current) {
      toast.error("Printer connection does not support direct writing. Opening standard printer fallback...");
      handlePrintReceipt(order);
      return;
    }

    toast.loading("Sending order directly to Bluetooth thermal printer...", { id: 'bt-order-print-job' });

    try {
      const encoder = new TextEncoder();
      
      // ESC/POS Commands
      const INIT = new Uint8Array([0x1b, 0x40]);
      const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
      const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
      const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
      const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
      const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
      const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
      
      let bytes = [];
      
      bytes.push(...INIT);
      
      // Header
      bytes.push(...CENTER);
      bytes.push(...DOUBLE_SIZE);
      bytes.push(...encoder.encode("RAJU GHEE SWEETS\n"));
      bytes.push(...NORMAL_SIZE);
      bytes.push(...encoder.encode(`${order.storeName || 'Outlet Store'}\n`));
      bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Order Details
      bytes.push(...LEFT);
      bytes.push(...encoder.encode(`Order ID: #${order.orderId}\n`));
      bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
      bytes.push(...encoder.encode(`Phone: ${order.customerPhone}\n`));
      bytes.push(...encoder.encode(`Date: ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '')}\n`));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Table Header
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("Item            Qty      Total  \n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Items list
      order.items.forEach(item => {
        const qtyPart = (item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pc`).padEnd(8, ' ');
        const pricePart = `Rs.${Number(item.total).toFixed(0)}`.padStart(8, ' ');
        
        if (item.name.length > 14) {
          bytes.push(...encoder.encode(`${item.name}\n`));
          const spacesPart = "".padEnd(14, ' ');
          bytes.push(...encoder.encode(`${spacesPart} ${qtyPart} ${pricePart}\n`));
        } else {
          const namePart = item.name.padEnd(14, ' ');
          bytes.push(...encoder.encode(`${namePart} ${qtyPart} ${pricePart}\n`));
        }
      });
      
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Total
      bytes.push(...BOLD_ON);
      const grandTotalStr = `Rs.${Number(order.totalAmount).toFixed(2)}`;
      bytes.push(...encoder.encode(`TOTAL AMOUNT: ${grandTotalStr.padStart(18, ' ')}\n`));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Footer
      bytes.push(...CENTER);
      bytes.push(...encoder.encode("Thank you for your business!\n"));
      bytes.push(...encoder.encode("Please visit again.\n\n"));
      
      const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
      bytes.push(...CUT);

      const dataArray = new Uint8Array(bytes);
      
      // BLE write chunking
      const CHUNK_SIZE = 20;
      for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
        const chunk = dataArray.slice(i, i + CHUNK_SIZE);
        await printerCharacteristicRef.current.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      toast.dismiss('bt-order-print-job');
      toast.success("Order receipt printed successfully!");
    } catch (err) {
      console.error("Direct BLE order print error: ", err);
      toast.dismiss('bt-order-print-job');
      toast.error("Failed to print directly. Opening system print fallback...");
      handlePrintReceipt(order);
    }
  };

  const handlePrint = async (order) => {
    if (bluetoothConnected && printerCharacteristicRef.current) {
      printOrderDirectToBluetooth(order);
    } else if (qzConnected && selectedQZPrinter) {
      try {
        setQzPrinting(true);
        toast.loading("Printing to USB printer via QZ Tray...", { id: 'qz-print' });
        const bytes = buildOrderESCPOS(order);
        await printRawToQZ(selectedQZPrinter, bytes);
        toast.dismiss('qz-print');
        toast.success("Order printed successfully (USB)!");
      } catch (err) {
        console.error('QZ Print error:', err);
        toast.dismiss('qz-print');
        toast.error("USB print failed. Opening system print fallback...");
        handlePrintReceipt(order);
      } finally {
        setQzPrinting(false);
      }
    } else {
      handlePrintReceipt(order);
    }
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

  // --- Bluetooth Thermal Printer Operations ---
  const openBluetoothScanner = async () => {
    if (navigator.bluetooth) {
      setIsScanningBt(true);
      try {
        toast.loading("Opening browser Bluetooth pairing selector...", { id: 'bt-loading' });
        
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '00001101-0000-1000-8000-00805f9b34fb'
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

  const toggleOrderAccordion = (id) => {
    setExpandedOrders(prev => prev.includes(id) ? prev.filter(oId => oId !== id) : [...prev, id]);
  };

  const calculateOverallOrderStatus = (items) => {
    if (!items || items.length === 0) return 'new';
    
    const getStatus = (item) => (item.status || 'preparation_started').toLowerCase().trim();
    
    // Check if ALL items are delivered
    const allDelivered = items.every(item => getStatus(item) === 'delivered');
    if (allDelivered) return 'Delivered';
    
    // Check if ANY item has progressed beyond preparation_started (or new/empty status)
    const hasProgressed = items.some(item => {
      const st = getStatus(item);
      return st !== 'preparation_started' && st !== 'new' && st !== '';
    });
    
    if (hasProgressed) return 'In Progress';
    
    return 'new';
  };

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
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
      toast.success("Item status updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const getStatusLabel = (status) => {
    if (!status) return 'NEW';
    return status.replace(/_/g, ' ').toUpperCase();
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  const recAmt = parseFloat(receivedAmount) || 0;
  let paymentStatus = 'Pending';
  if (recAmt > 0) {
    if (recAmt >= totalAmount) {
      paymentStatus = 'Done';
    } else {
      paymentStatus = 'Partial';
    }
  }

  return (
    <div className="orders-container">
      <div className="orders-header">
        <div className="orders-header-info">
          <h1>Customer Orders</h1>
          <p>Track and manage customer sweet orders and factory production</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button 
            className="st-compact-bluetooth" 
            onClick={bluetoothConnected ? disconnectPrinter : openBluetoothScanner}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: bluetoothConnected ? '#f0fdf4' : '#f1f5f9',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid ' + (bluetoothConnected ? '#bbf7d0' : '#cbd5e1'),
              color: bluetoothConnected ? '#16a34a' : '#475569',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: '38px',
              boxSizing: 'border-box'
            }}
            title={bluetoothConnected ? `Connected to ${connectedDevice}. Click to disconnect.` : 'Connect Bluetooth Thermal Printer'}
          >
            <Bluetooth size={16} className={bluetoothConnected ? 'connected' : 'disconnected'} />
            <span>{bluetoothConnected ? 'Printer Connected' : 'Connect BT Printer'}</span>
          </button>
          
          {/* USB QZ Tray Printer Button */}
          <button 
            className="st-compact-bluetooth" 
            onClick={qzConnected ? disconnectQZTray : connectQZTray}
            disabled={qzConnecting || qzPrinting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: qzConnected ? '#f0fdf4' : (qzConnecting || qzPrinting ? '#f8fafc' : '#f1f5f9'),
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid ' + (qzConnected ? '#bbf7d0' : '#cbd5e1'),
              color: qzConnected ? '#16a34a' : (qzConnecting || qzPrinting ? '#94a3b8' : '#475569'),
              fontSize: '12px',
              fontWeight: '700',
              cursor: (qzConnecting || qzPrinting) ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              height: '38px',
              boxSizing: 'border-box'
            }}
            title={qzConnected ? `Connected to ${selectedQZPrinter}. Click to disconnect.` : 'Connect USB Thermal Printer'}
          >
            {qzConnecting || qzPrinting ? (
              <RefreshCw size={16} className="st-spin" />
            ) : (
              <Usb size={16} className={qzConnected ? 'connected' : 'disconnected'} />
            )}
            <span>
              {qzConnected ? 'USB Connected' : 
               qzPrinting ? 'Printing...' :
               qzConnecting ? `Connecting (${qzConnectTimer}s)` : 'Connect USB Printer'}
            </span>
          </button>

          <button className="add-order-btn" onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}>
            <Plus size={20} /> Create New Order
          </button>
        </div>
      </div>

      <div className="ord-table-wrapper">
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <div className="items-search-bar" style={{ maxWidth: '400px' }}>
            <Search size={18} className="items-search-icon" />
            <input 
              type="text" 
              placeholder="Search by Order ID or Customer..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <table className="ord-list-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Store</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Date</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '100px' }}><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></td></tr>
            ) : orders.length > 0 ? (
              orders.filter(o => 
                o.orderId.toLowerCase().includes(searchQuery.toLowerCase()) || 
                o.customerName.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(order => (
                <React.Fragment key={order.id}>
                  <tr className={expandedOrders.includes(order.id) ? "row-expanded" : ""}>
                    <td className="ord-id-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => toggleOrderAccordion(order.id)}>
                        {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        #{order.orderId}
                      </div>
                    </td>
                    <td>
                      <div className="ord-customer-cell">
                        <span className="name">{order.customerName}</span>
                        <span className="phone">{order.customerPhone}</span>
                      </div>
                    </td>
                    <td>{order.storeName}</td>
                    <td>{order.items.length} Items</td>
                    <td style={{ fontWeight: '700' }}>₹{order.totalAmount.toFixed(2)}</td>
                    <td>
                      <span className={`ord-status-badge ${order.paymentStatus || 'Pending'}`}>
                        {order.paymentStatus || 'Pending'}
                      </span>
                    </td>
                    <td>
                      <span className={`ord-status-badge ${(order.status || 'new').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {order.deliveryDate ? (
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>{new Date(order.deliveryDate).toLocaleDateString()}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '600', marginTop: '2px' }}>{order.deliveryTime || ''}</div>
                        </div>
                      ) : (
                        order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Pending'
                      )}
                    </td>
                    <td>
                      <div className="ord-actions-cell">
                        <button className="ord-action-btn view" title="Preview" onClick={() => setPreviewOrder(order)}><Eye size={16} /></button>
                        <button className="ord-action-btn print" title="Print" onClick={() => handlePrint(order)}><Printer size={16} /></button>
                        <button className="ord-action-btn edit" title="Edit" onClick={() => handleEditOrder(order)}><Edit size={16} /></button>
                        <button className="ord-action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                  
                  {expandedOrders.includes(order.id) && (
                    <tr className="ord-accordion-row">
                      <td colSpan="9" style={{ padding: 0 }}>
                        <div className="ord-accordion-content">
                          <h4 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--primary-color)' }}>Order Items</h4>
                          <table className="ord-items-subtable">
                            <thead>
                              <tr>
                                <th>Item Name</th>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td style={{ fontWeight: '700' }}>{item.name}</td>
                                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.description || '-'}</td>
                                  <td>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                                  <td style={{ fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                                  <td>
                                    <select 
                                      className="ord-item-status-select"
                                      value={item.status || 'preparation_started'}
                                      onChange={(e) => updateItemStatus(order.id, idx, e.target.value)}
                                    >
                                      <option value="preparation_started">Preparation Started</option>
                                      <option value="preparation_complete">Preparation Complete</option>
                                      <option value="moved_to_packing">Moved to Packing</option>
                                      <option value="packing_complete">Packing Complete</option>
                                      <option value="moved_to_store">Moved to Store</option>
                                      <option value="delivered">Delivered</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr><td colSpan="9" className="ord-orders-empty">No orders found. Click "Create New Order" to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Order Full Screen Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            className="ord-full-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="ord-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <ShoppingBag size={24} color="var(--primary-color)" />
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800' }}>{editingOrderId ? 'Edit Customer Order' : 'Create New Customer Order'}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{editingOrderId ? 'Update customer details and items' : 'Fill in customer details and select items'}</p>
                </div>
              </div>
              <button className="items-close-btn" onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>

            <div className="ord-modal-content">
              {/* Left Panel: Form & Selection */}
              <div className="ord-items-panel">
                <div className="ord-panel-header">
                  <div className="ord-panel-top">
                    <CustomDropdown 
                      label="Select Customer"
                      options={customers}
                      onSelect={setSelectedCustomer}
                      selectedValue={selectedCustomer}
                      placeholder="Search name or number..."
                      icon={User}
                      onCreateClick={handleOpenCreateCustomer}
                    />
                    <CustomDropdown 
                      label="Select Delivery Store"
                      options={stores}
                      onSelect={setSelectedStore}
                      selectedValue={selectedStore}
                      placeholder="Select a store..."
                      icon={Store}
                    />
                    <CustomDropdown 
                      label="Select Packing Unit"
                      options={pUnits}
                      onSelect={setSelectedPUnit}
                      selectedValue={selectedPUnit}
                      placeholder="Optional"
                      icon={Package}
                    />
                  </div>

                  {/* Delivery Date & Time */}
                  <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Delivery Date *</label>
                      <input 
                        type="date"
                        required
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        style={{
                          height: '38px',
                          padding: '0 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Delivery Time *</label>
                      <input 
                        type="time"
                        required
                        value={deliveryTime}
                        onChange={(e) => setDeliveryTime(e.target.value)}
                        style={{
                          height: '38px',
                          padding: '0 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Manufacturing & Packing Descriptions */}
                  <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Manufacturing Unit Description</label>
                      <textarea 
                        placeholder="Special instructions for manufacturing..."
                        value={mUnitDescription}
                        onChange={(e) => setMUnitDescription(e.target.value)}
                        style={{
                          height: '50px',
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                          width: '100%'
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Packing Unit Description</label>
                      <textarea 
                        placeholder="Packaging and gift wrapping notes..."
                        value={pUnitDescription}
                        onChange={(e) => setPUnitDescription(e.target.value)}
                        style={{
                          height: '50px',
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                          width: '100%'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={18} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '16px', fontWeight: '800' }}>Select Items</h3>
                </div>

                <div className="ord-items-grid">
                  {items.map(item => (
                    <div key={item.id} className="ord-selectable-card" onClick={() => handleItemClick(item)}>
                      <img src={item.image} alt={item.name} className="ord-item-img" />
                      <div className="ord-item-details">
                        <h4>{item.name}</h4>
                        <div className="ord-price-row">
                          <span className="price">₹{item.price}</span>
                          <span className="unit">{item.unit === 'Weight' ? '/ kg' : '/ piece'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Panel: Summary */}
              <div className="ord-summary-panel">
                <h2><FileText size={20} /> Order Summary</h2>
                
                <div className="ord-summary-list">
                  {cart.length > 0 ? cart.map((item, idx) => (
                    <div key={idx} className="ord-summary-item">
                      <div className="ord-item-info">
                        <h4>{item.name}</h4>
                        <p>{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`} @ ₹{item.price}</p>
                        {item.description && <p className="item-note">Note: {item.description}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {item.unit === 'Weight' ? (
                          <button onClick={() => handleEditCartItem(item)} className="ord-edit-cart-btn" title="Edit Weight">
                            <Edit size={14} />
                          </button>
                        ) : (
                          <div className="ord-qty-controls">
                            <button onClick={() => updateCartQuantity(item.id, -1)}><Minus size={12} /></button>
                            <span>{item.quantity}</span>
                            <button onClick={() => updateCartQuantity(item.id, 1)}><Plus size={12} /></button>
                          </div>
                        )}
                        <div className="ord-item-price">
                          <span className="amt">₹{item.total.toFixed(2)}</span>
                        </div>
                        <button onClick={() => removeFromCart(item.id)} style={{ color: 'var(--error-color)', background: 'none' }} title="Remove Item">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                      <ShoppingBag size={32} style={{ marginBottom: '10px' }} />
                      <p>Your cart is empty</p>
                    </div>
                  )}
                </div>

                <div className="ord-summary-totals" style={{ borderTop: 'none', paddingTop: '0' }}>
                  <div className="ord-total-row">
                    <span>Total Amount</span>
                    <span>₹{totalAmount.toFixed(2)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                      <div className="ord-payment-modes" style={{ marginTop: '0' }}>
                        {['Cash', 'UPI', 'Card'].map(mode => (
                          <button 
                            type="button"
                            key={mode} 
                            className={`ord-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                            onClick={() => setPaymentMode(mode)}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Received Amount (₹)</label>
                        <input 
                          type="number"
                          placeholder="0.00"
                          value={receivedAmount}
                          onChange={(e) => setReceivedAmount(e.target.value)}
                          style={{
                            height: '38px',
                            padding: '0 12px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '700',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Status</label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                          <span className={`ord-status-badge ${paymentStatus}`} style={{ fontSize: '11px', padding: '5px 12px' }}>
                            {paymentStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="ord-save-btn" onClick={saveOrder} disabled={submitting}>
                    {submitting ? <div className="loader"></div> : 'Confirm & Save Order'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weight Modal */}
      <AnimatePresence>
        {showWeightModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
                <Scale size={32} />
              </div>
              <h3 className="modal-title">Enter Quantity for {showWeightModal.name}</h3>
              
              <div className="ord-weight-form">
                <div className="ord-weight-input-group">
                  <label>Weight (kg)</label>
                  <input 
                    type="number" 
                    step="0.001" 
                    placeholder="0.000"
                    value={weightInput.weight}
                    onChange={(e) => handleWeightCalc('weight', e.target.value, showWeightModal.price)}
                  />
                </div>
                <div style={{ textAlign: 'center', fontWeight: '700', opacity: 0.5 }}>OR</div>
                <div className="ord-weight-input-group">
                  <label>Amount (₹)</label>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={weightInput.amount}
                    onChange={(e) => handleWeightCalc('amount', e.target.value, showWeightModal.price)}
                  />
                </div>

                <div className="ord-weight-input-group">
                  <label>Item Description / Note</label>
                  <textarea 
                    placeholder="e.g. less sugar, extra packing..."
                    value={weightInput.description}
                    onChange={(e) => setWeightInput({ ...weightInput, description: e.target.value })}
                    style={{ 
                      height: '60px', 
                      padding: '10px', 
                      border: '1px solid var(--border-color)', 
                      border_radius: '10px', 
                      font_size: '14px', 
                      resize: 'none' 
                    }}
                  />
                </div>

                <div className="modal-actions" style={{ marginTop: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button 
                    className="modal-btn confirm" 
                    style={{ background: 'var(--primary-color)' }}
                    onClick={() => {
                      if (weightInput.weight && weightInput.amount) {
                        addToCart(showWeightModal, weightInput.weight, weightInput.amount, weightInput.description);
                        setShowWeightModal(null);
                      } else {
                        toast.error("Please enter weight or amount");
                      }
                    }}
                  >
                    Add to Order
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewOrder && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div 
              className="custom-modal ord-preview-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ maxWidth: '600px', width: '90%' }}
            >
              <div className="ord-preview-header">
                <h2>Invoice Details</h2>
                <button className="items-close-btn" onClick={() => setPreviewOrder(null)}><X size={24} /></button>
              </div>
              
              <div className="ord-preview-body">
                <div className="ord-preview-top">
                  <div>
                    <h3>Raju Ghee Sweets</h3>
                    <p>{previewOrder.storeName}</p>
                    <p style={{ marginTop: '10px' }}><strong>Order:</strong> #{previewOrder.orderId}</p>
                    <p><strong>Date:</strong> {previewOrder.createdAt?.toDate ? previewOrder.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                    {previewOrder.deliveryDate && (
                      <p style={{ color: 'var(--primary-color)', fontWeight: '700' }}>
                        <strong>Delivery Target:</strong> {new Date(previewOrder.deliveryDate).toLocaleDateString()} at {previewOrder.deliveryTime || ''}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <h3>Bill To</h3>
                    <p><strong>{previewOrder.customerName}</strong></p>
                    <p>{previewOrder.customerPhone}</p>
                  </div>
                </div>

                <div className="ord-preview-desc">
                  {previewOrder.globalDescription && <p><strong>Global Note:</strong> {previewOrder.globalDescription}</p>}
                  {previewOrder.mUnitDescription && <p><strong>Mfg Note:</strong> {previewOrder.mUnitDescription}</p>}
                  {previewOrder.pUnitDescription && <p><strong>Pack Note:</strong> {previewOrder.pUnitDescription}</p>}
                </div>

                <table className="ord-preview-table">
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th style={{ textAlign: 'center' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <div style={{ fontWeight: '700' }}>{item.name}</div>
                          {item.description && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.description}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pcs`}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="ord-preview-total">
                  <div className="row">
                    <span>Payment Mode</span>
                    <span>{previewOrder.paymentMode}</span>
                  </div>
                  <div className="row total">
                    <span>Total Amount</span>
                    <span>₹{previewOrder.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                <button className="modal-btn cancel" onClick={() => setPreviewOrder(null)}>Close</button>
                <button 
                  className="modal-btn confirm" 
                  style={{ background: 'var(--primary-color)' }}
                  onClick={() => {
                    handlePrint(previewOrder);
                  }}
                >
                  <Printer size={16} /> Print Bill
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Customer Modal */}
      <AnimatePresence>
        {showCreateCustomerModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div 
              className="custom-modal"
              style={{ maxWidth: '500px', width: '90%' }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <User size={32} />
              </div>
              <h3 className="modal-title" style={{ marginBottom: '5px' }}>Create New Customer</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '20px' }}>Fill in customer details to save and select automatically</p>
              
              <form onSubmit={handleSaveCustomer} className="ord-weight-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>First Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="First Name"
                      value={customerFormData.firstName}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, firstName: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Last Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Last Name"
                      value={customerFormData.lastName}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, lastName: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Mobile Number *</label>
                  <input 
                    type="tel" 
                    required
                    placeholder="10-digit mobile number"
                    value={customerFormData.mobileNumber}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, mobileNumber: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Full Address</label>
                  <textarea 
                    placeholder="Enter street address..."
                    value={customerFormData.address}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, address: e.target.value })}
                    style={{ 
                      width: '100%', 
                      height: '60px', 
                      padding: '10px', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '8px', 
                      fontSize: '14px', 
                      resize: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>City</label>
                    <input 
                      type="text" 
                      placeholder="City"
                      value={customerFormData.city}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, city: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>State</label>
                    <input 
                      type="text" 
                      placeholder="State"
                      value={customerFormData.state}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, state: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="modal-btn cancel" onClick={() => setShowCreateCustomerModal(false)} disabled={savingCustomer}>Cancel</button>
                  <button 
                    type="submit" 
                    className="modal-btn confirm" 
                    style={{ background: 'var(--primary-color)' }}
                    disabled={savingCustomer}
                  >
                    {savingCustomer ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Save & Select'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bluetooth Printer Modal */}
      <AnimatePresence>
        {showBluetoothModal && (
          <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <motion.div 
              className="custom-modal st-bluetooth-scan-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ maxWidth: '440px', width: '90%' }}
            >
              <div className="scan-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>Connect Bluetooth Printer</h3>
                <button className="items-close-btn" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowBluetoothModal(false)}><X size={20} /></button>
              </div>
              
              <div className="scan-modal-body" style={{ padding: '24px', minHeight: '200px' }}>
                {isScanningBt ? (
                  <div className="scan-loading-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '15px' }}>
                    <div className="scan-radar" style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#eff6ff', borderRadius: '50%' }}>
                      <Bluetooth size={24} style={{ color: '#2563eb' }} />
                    </div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb', margin: 0 }}>Scanning for local printers...</p>
                  </div>
                ) : (
                  <div className="device-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <span className="results-label" style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', textAlign: 'left', display: 'block' }}>Nearby Devices</span>
                    <div className="devices-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                      {btDevices.map((device, idx) => (
                        <div 
                          key={idx} 
                          className={`device-list-row ${connectingBtDevice === device.name ? 'connecting' : ''}`}
                          onClick={() => connectBtDevice(device.name)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            background: '#f8fafc'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                            <Printer size={18} style={{ color: '#2563eb' }} />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{device.name}</div>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>{device.type}</div>
                            </div>
                          </div>
                          <button className="row-connect-btn" style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                            {connectingBtDevice === device.name ? 'Pairing...' : 'Connect'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </div>
  );
};

export default Orders;
