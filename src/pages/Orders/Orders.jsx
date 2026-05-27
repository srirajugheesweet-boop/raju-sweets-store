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
import { buildOrderESCPOS } from '../../utils/qzTray';
import { usePrinter } from '../../context/PrinterContext';
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
  const [activeModalTab, setActiveModalTab] = useState('items'); // 'items' or 'summary'
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [expandedOrders, setExpandedOrders] = useState([]);

  // Date helper functions for filter shortcuts
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getTomorrowStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };
  const [previewOrder, setPreviewOrder] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);

  // Form State
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [pUnits, setPUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [previewTab, setPreviewTab] = useState('payment');
  const [previewInstallments, setPreviewInstallments] = useState([]);
  const [addPayAmount, setAddPayAmount] = useState('');
  const [addPayMode, setAddPayMode] = useState('UPI');
  const [addPayNotes, setAddPayNotes] = useState('');
  const [addingPayment, setAddingPayment] = useState(false);

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

  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

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
      const fetchModalData = async () => {
        const [custSnap, storeSnap, itemSnap, muSnap, puSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('firstName', 'asc'))),
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'items'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'packing_units'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
        ]);

        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setItems(itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setMUnits(muSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setPUnits(puSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCategories(catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      };
      fetchModalData();
    }
  }, [showAddModal]);

  // Fetch installments dynamic subcollection for order preview
  useEffect(() => {
    if (previewOrder) {
      const remaining = previewOrder.totalAmount - (previewOrder.receivedAmount || 0);
      setAddPayAmount(remaining > 0 ? remaining.toFixed(2) : '');
      setAddPayMode('UPI');
      setAddPayNotes('');

      const fetchInstallments = async () => {
        try {
          const snap = await getDocs(query(collection(db, 'orders', previewOrder.id, 'installments'), orderBy('createdAt', 'asc')));
          setPreviewInstallments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Failed to load installments:", err);
          setPreviewInstallments([]);
        }
      };
      fetchInstallments();
    } else {
      setPreviewInstallments([]);
    }
  }, [previewOrder]);

  const handleAddPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!previewOrder) return;

    const amountVal = parseFloat(addPayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    const remaining = previewOrder.totalAmount - (previewOrder.receivedAmount || 0);
    if (amountVal > remaining + 0.01) {
      toast.error(`Payment amount cannot exceed the remaining balance of ₹${remaining.toFixed(2)}`);
      return;
    }

    setAddingPayment(true);
    try {
      const orderRef = doc(db, 'orders', previewOrder.id);
      const newReceived = (previewOrder.receivedAmount || 0) + amountVal;
      let newStatus = 'Pending';
      if (newReceived >= previewOrder.totalAmount - 0.01) {
        newStatus = 'Done';
      } else if (newReceived > 0) {
        newStatus = 'Partial';
      }

      // 1. Write the installment record
      await addDoc(collection(db, 'orders', previewOrder.id, 'installments'), {
        amount: amountVal,
        paymentMode: addPayMode,
        notes: addPayNotes || 'Subsequent Installment',
        createdAt: serverTimestamp()
      });

      // 2. Update parent order in Firestore
      await updateDoc(orderRef, {
        receivedAmount: newReceived,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp()
      });

      // 3. Responsive state update
      setPreviewOrder(prev => ({
        ...prev,
        receivedAmount: newReceived,
        paymentStatus: newStatus
      }));

      toast.success(`Payment of ₹${amountVal.toFixed(2)} recorded successfully!`);
    } catch (error) {
      console.error("Save Preview Payment Error:", error);
      toast.error("Failed to save payment installment");
    } finally {
      setAddingPayment(false);
    }
  };

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
    setItemSearchQuery('');
    setSelectedCategoryFilter('All');
    setActiveModalTab('items');
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
    setActiveModalTab('items');
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

      // Totals
      const totalStr = `Rs.${Number(order.totalAmount || 0).toFixed(2)}`;
      const paidStr = `Rs.${Number(order.receivedAmount || 0).toFixed(2)}`;
      const balanceStr = `Rs.${(Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)).toFixed(2)}`;

      const totalLabel = "TOTAL AMOUNT:".padEnd(14, ' ');
      const paidLabel = "PAID:".padEnd(14, ' ');
      const balanceLabel = "BALANCE DUE:".padEnd(14, ' ');

      bytes.push(...encoder.encode(`${totalLabel}${totalStr.padStart(18, ' ')}\n`));
      bytes.push(...encoder.encode(`${paidLabel}${paidStr.padStart(18, ' ')}\n`));
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode(`${balanceLabel}${balanceStr.padStart(18, ' ')}\n`));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));

      // Footer
      bytes.push(...CENTER);
      bytes.push(...encoder.encode("Thank you for your business!\n"));
      bytes.push(...encoder.encode("Please visit again.\n\n"));

      const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
      bytes.push(...CUT);

      const dataArray = new Uint8Array(bytes);

      await printRawBLE(dataArray);

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
    if (bluetoothConnected) {
      printOrderDirectToBluetooth(order);
    } else if (qzConnected && selectedQZPrinter) {
      try {
        toast.loading("Printing to USB printer via QZ Tray...", { id: 'qz-print' });
        const bytes = buildOrderESCPOS(order);
        await printRawUSB(bytes);
        toast.dismiss('qz-print');
        toast.success("Order printed successfully (USB)!");
      } catch (err) {
        console.error('QZ Print error:', err);
        toast.dismiss('qz-print');
        toast.error("USB print failed. Opening system print fallback...");
        handlePrintReceipt(order);
      }
    } else {
      handlePrintReceipt(order);
    }
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

  const filteredItemsForOrder = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(itemSearchQuery.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'All' || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

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

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerPhone && o.customerPhone.includes(searchQuery));
    const matchesDate = !deliveryDateFilter || o.deliveryDate === deliveryDateFilter;
    return matchesSearch && matchesDate;
  });

  return (
    <div className="orders-container">
      <div className="orders-header">
        <div className="orders-header-info">
          <h1>Customer Orders</h1>
          <p>Track and manage customer sweet orders and factory production</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="add-order-btn" onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}>
            <Plus size={20} /> Create New Order
          </button>
        </div>
      </div>

      <div className="ord-table-wrapper">
        <div style={{ 
          padding: '16px 20px', 
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div className="items-search-bar" style={{ maxWidth: '350px', flex: 1, margin: 0 }}>
            <Search size={18} className="items-search-icon" />
            <input
              type="text"
              placeholder="Search by Order ID or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="ord-date-filter-container" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14} color="var(--primary-color)" /> Delivery Date:
              </span>
              <input
                type="date"
                value={deliveryDateFilter}
                onChange={(e) => setDeliveryDateFilter(e.target.value)}
                style={{
                  height: '38px',
                  padding: '0 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  fontWeight: '600'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setDeliveryDateFilter(getTodayStr())}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: '1px solid ' + (deliveryDateFilter === getTodayStr() ? 'var(--primary-color)' : 'var(--border-color)'),
                  background: deliveryDateFilter === getTodayStr() ? 'var(--primary-color)' : '#f8fafc',
                  color: deliveryDateFilter === getTodayStr() ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDeliveryDateFilter(getTomorrowStr())}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: '1px solid ' + (deliveryDateFilter === getTomorrowStr() ? 'var(--primary-color)' : 'var(--border-color)'),
                  background: deliveryDateFilter === getTomorrowStr() ? 'var(--primary-color)' : '#f8fafc',
                  color: deliveryDateFilter === getTomorrowStr() ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Tomorrow
              </button>
              {deliveryDateFilter && (
                <button
                  type="button"
                  onClick={() => setDeliveryDateFilter('')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: '1px dashed var(--error-color)',
                    background: '#fef2f2',
                    color: 'var(--error-color)',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
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
            ) : filteredOrders.length > 0 ? (
              filteredOrders.map(order => (
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
                        <button className="ord-action-btn view" title="Preview" onClick={() => { setPreviewTab('payment'); setPreviewOrder(order); }}><Eye size={16} /></button>
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
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                  <Calendar size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--primary-color)' }} />
                  <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>No Orders Found</div>
                  <div style={{ fontSize: '12px' }}>Try clearing the filters or selecting another delivery date.</div>
                  {(searchQuery || deliveryDateFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setDeliveryDateFilter('');
                      }}
                      style={{
                        marginTop: '15px',
                        padding: '6px 16px',
                        background: 'var(--primary-color)',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        color: '#ffffff'
                      }}
                    >
                      Clear All Filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile & Tablet Card View */}
      <div className="ord-mobile-cards-list">
        {loading ? (
          <div className="ord-portal-loading"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map(order => {
            const isExpanded = expandedOrders.includes(order.id);
            return (
              <div key={order.id} className={`ord-mobile-card ${isExpanded ? 'expanded' : ''}`}>
                {/* Card Header */}
                <div className="ord-mobile-card-header" onClick={() => toggleOrderAccordion(order.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span className="ord-mobile-id">#{order.orderId}</span>
                  </div>
                  <span className={`ord-status-badge ${(order.status || 'new').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')}`}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>

                {/* Card Body */}
                <div className="ord-mobile-card-body">
                  <div className="ord-mobile-row">
                    <span className="label">Customer:</span>
                    <span className="val bold">{order.customerName}</span>
                  </div>
                  <div className="ord-mobile-row">
                    <span className="label">Phone:</span>
                    <span className="val">{order.customerPhone}</span>
                  </div>
                  <div className="ord-mobile-row">
                    <span className="label">Outlet:</span>
                    <span className="val">{order.storeName}</span>
                  </div>
                  <div className="ord-mobile-row">
                    <span className="label">Total Amount:</span>
                    <span className="val bold accent-color" style={{ color: 'var(--primary-color)' }}>₹{order.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="ord-mobile-row">
                    <span className="label">Payment:</span>
                    <span className={`ord-status-badge ${order.paymentStatus || 'Pending'}`}>
                      {order.paymentStatus || 'Pending'}
                    </span>
                  </div>
                  <div className="ord-mobile-row">
                    <span className="label">Delivery Date:</span>
                    <span className="val">
                      {order.deliveryDate ? (
                        <>
                          <strong>{new Date(order.deliveryDate).toLocaleDateString()}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '700', marginLeft: '6px' }}>
                            {order.deliveryTime || ''}
                          </span>
                        </>
                      ) : (
                        'Pending'
                      )}
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="ord-mobile-card-actions">
                  <button className="ord-mobile-action-btn view" title="Preview" onClick={() => { setPreviewTab('payment'); setPreviewOrder(order); }}><Eye size={14} /> Preview</button>
                  <button className="ord-mobile-action-btn print" title="Print" onClick={() => handlePrint(order)}><Printer size={14} /> Print</button>
                  <button className="ord-mobile-action-btn edit" title="Edit" onClick={() => handleEditOrder(order)}><Edit size={14} /> Edit</button>
                  <button className="ord-mobile-action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}><Trash2 size={14} /> Delete</button>
                </div>

                {/* Accordion / Expanded Details */}
                {isExpanded && (
                  <div className="ord-mobile-card-accordion animate-fade-in">
                    <h4>Order Items</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="ord-items-subtable">
                        <thead>
                          <tr>
                            <th>Item Name</th>
                            <th>Qty</th>
                            <th>Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: '700' }}>
                                {item.name}
                                {item.description && (
                                  <div style={{ fontSize: '11px', color: '#f59e0b', fontStyle: 'italic', marginTop: '2px' }}>
                                    Note: {item.description}
                                  </div>
                                )}
                              </td>
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
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="ord-orders-empty">
            <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--primary-color)' }} />
            <h3>No Orders Found</h3>
            <p>Try adjusting your filters or date selection.</p>
          </div>
        )}
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

            {/* Mobile Modal Tabs */}
            <div className="ord-modal-tabs-mobile">
              <button 
                type="button" 
                className={`ord-modal-tab-btn-mobile ${activeModalTab === 'items' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('items')}
              >
                <Plus size={16} /> 1. Select Items
              </button>
              <button 
                type="button" 
                className={`ord-modal-tab-btn-mobile ${activeModalTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('summary')}
                style={{ position: 'relative' }}
              >
                <ShoppingBag size={16} /> 2. Checkout
                {cart.length > 0 && (
                  <span className="cart-badge-dot">{cart.length}</span>
                )}
              </button>
            </div>

            <div className="ord-modal-content">
              {/* Left Panel: Form & Selection */}
              <div className={`ord-items-panel ${activeModalTab === 'items' ? 'show-mobile' : 'hide-mobile'}`}>
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

                {/* Item Search and Category Filter Row */}
                <div className="ord-search-filter-row">
                  <div className="ord-item-search-wrapper">
                    <Search size={16} className="ord-item-search-icon" />
                    <input
                      type="text"
                      className="ord-item-search-input"
                      placeholder="Search item by name..."
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="ord-category-pills-row">
                    <button
                      type="button"
                      className={`ord-category-pill ${selectedCategoryFilter === 'All' ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryFilter('All')}
                    >
                      All
                    </button>
                    {categories.map(cat => (
                      <button
                        type="button"
                        key={cat.id}
                        className={`ord-category-pill ${selectedCategoryFilter === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategoryFilter(cat.id)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ord-items-grid">
                  {filteredItemsForOrder.length > 0 ? (
                    filteredItemsForOrder.map(item => (
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
                    ))
                  ) : (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                      <Package size={32} style={{ margin: '0 auto 10px' }} />
                      <p>No matching items found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Summary */}
              <div className={`ord-summary-panel ${activeModalTab === 'summary' ? 'show-mobile' : 'hide-mobile'}`}>
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
        {previewOrder && (() => {
          const balanceDue = Number(previewOrder.totalAmount || 0) - Number(previewOrder.receivedAmount || 0);
          return (
            <div className="modal-overlay" style={{ zIndex: 3000 }}>
              <motion.div
                className="custom-modal ord-preview-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="ord-preview-header" style={{ marginBottom: '15px', paddingBottom: '10px' }}>
                  <h2>Order Invoice Preview</h2>
                  <button className="items-close-btn" onClick={() => setPreviewOrder(null)}><X size={24} /></button>
                </div>

                <div className="ord-preview-body">
                  <div className="ord-preview-top" style={{ marginBottom: '15px' }}>
                    <div>
                      <h3>Raju Ghee Sweets</h3>
                      <p>{previewOrder.storeName}</p>
                      <p style={{ marginTop: '6px' }}><strong>Order:</strong> #{previewOrder.orderId}</p>
                      <p><strong>Date:</strong> {previewOrder.createdAt?.toDate ? previewOrder.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                      {previewOrder.deliveryDate && (
                        <p style={{ color: 'var(--primary-color)', fontWeight: '700', marginTop: '2px' }}>
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

                  <div className="ord-preview-desc" style={{ marginBottom: '15px', padding: '10px' }}>
                    {previewOrder.globalDescription && <p><strong>Global Note:</strong> {previewOrder.globalDescription}</p>}
                    {previewOrder.mUnitDescription && <p><strong>Mfg Note:</strong> {previewOrder.mUnitDescription}</p>}
                    {previewOrder.pUnitDescription && <p><strong>Pack Note:</strong> {previewOrder.pUnitDescription}</p>}
                  </div>

                  {/* Tabs Header */}
                  <div className="ord-preview-tabs">
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'payment' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('payment')}
                    >
                      Payment History
                    </button>
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'items' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('items')}
                    >
                      Items Included
                    </button>
                  </div>

                  {/* Tab Panel: Payment History */}
                  {previewTab === 'payment' && (
                    <div className="ord-tab-panel">
                      <div className="ord-payment-summary-grid">
                        <div className="ord-payment-summary-card">
                          <h4>Total Bill</h4>
                          <p>₹{previewOrder.totalAmount.toFixed(2)}</p>
                        </div>
                        <div className="ord-payment-summary-card">
                          <h4>Total Paid</h4>
                          <p>₹{previewOrder.receivedAmount.toFixed(2)}</p>
                        </div>
                        <div className={`ord-payment-summary-card due ${balanceDue <= 0 ? 'paid' : ''}`}>
                          <h4>Balance Due</h4>
                          <p>₹{Math.max(0, balanceDue).toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Add Inline Installment Form */}
                      {balanceDue > 0.01 && (
                        <form onSubmit={handleAddPaymentSubmit} style={{ marginTop: '0', marginBottom: '24px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                          <h4 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--primary-color)', marginTop: '0' }}>Record New Payment</h4>
                          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Amount (₹) *</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                required
                                value={addPayAmount}
                                onChange={(e) => setAddPayAmount(e.target.value)}
                                max={balanceDue}
                                min="0.01"
                                style={{
                                  height: '36px',
                                  padding: '0 10px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  fontWeight: '700',
                                  boxSizing: 'border-box',
                                  width: '100%',
                                  background: '#FFFFFF'
                                }}
                              />
                            </div>
                            <div style={{ flex: 1.5, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                              <div style={{ display: 'flex', gap: '4px', height: '36px' }}>
                                {['UPI', 'Cash', 'Card'].map(mode => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setAddPayMode(mode)}
                                    style={{
                                      flex: 1,
                                      border: '1.5px solid ' + (addPayMode === mode ? 'var(--primary-color)' : 'var(--border-color)'),
                                      background: addPayMode === mode ? 'var(--primary-color)' : '#FFFFFF',
                                      color: addPayMode === mode ? '#FFFFFF' : 'var(--text-secondary)',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {mode}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 2, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Notes / Reference</label>
                              <input
                                type="text"
                                placeholder="e.g. UPI ID or Installment note"
                                value={addPayNotes}
                                onChange={(e) => setAddPayNotes(e.target.value)}
                                style={{
                                  height: '36px',
                                  padding: '0 10px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  boxSizing: 'border-box',
                                  width: '100%',
                                  background: '#FFFFFF'
                                }}
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={addingPayment}
                              style={{
                                flex: 1,
                                minWidth: '120px',
                                height: '36px',
                                background: 'var(--primary-color)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {addingPayment ? (
                                <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff' }}></div>
                              ) : (
                                <>
                                  <Plus size={14} /> Record Payment
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="ord-installment-section">
                        <h3>Installment timeline</h3>
                        <div className="ord-installment-timeline">
                          {previewInstallments.length > 0 ? (
                            previewInstallments.map((inst, idx) => (
                              <div key={inst.id || idx} className="ord-installment-card">
                                <div className="ord-inst-left">
                                  <span className="ord-inst-date">
                                    {inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    }) : 'Just now'}
                                  </span>
                                  {inst.notes && <span className="ord-inst-note">{inst.notes}</span>}
                                </div>
                                <div className="ord-inst-right">
                                  <span className="ord-inst-amount">₹{Number(inst.amount).toFixed(2)}</span>
                                  <div>
                                    <span className="ord-inst-mode">{inst.paymentMode || 'Cash'}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="ord-timeline-empty">
                              No installment payments recorded.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab Panel: Items Included */}
                  {previewTab === 'items' && (
                    <div className="ord-tab-panel">
                      <table className="ord-preview-table">
                        <thead>
                          <tr>
                            <th>Item Description</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
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
                              <td style={{ textAlign: 'center' }}>
                                <span className={`ord-status-badge ${(item.status || 'preparation_started').toLowerCase().replace(/_/g, '-')}`} style={{ fontSize: '10px', padding: '3px 8px' }}>
                                  {getStatusLabel(item.status || 'preparation_started')}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '24px', justifyContent: 'flex-end', gap: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setPreviewOrder(null)}>Close</button>
                  <button
                    className="ord-modal-print-btn"
                    onClick={() => {
                      handlePrint(previewOrder);
                    }}
                  >
                    <Printer size={16} /> Print Receipt
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
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


    </div>
  );
};

export default Orders;
