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
  ChevronUp
} from 'lucide-react';
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
const CustomDropdown = ({ label, options, onSelect, selectedValue, placeholder, icon: Icon }) => {
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
                <div style={{ padding: '15px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>No results found</div>
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
  const [cart, setCart] = useState([]);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

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
          getDocs(query(collection(db, 'customer_items'), orderBy('name', 'asc'))),
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
    if (existingIndex > -1 && item.unit !== 'Weight') {
      const newCart = [...cart];
      newCart[existingIndex].quantity += quantity;
      newCart[existingIndex].total = newCart[existingIndex].quantity * item.price;
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
    if (cart.length === 0) return toast.error("Cart is empty");

    setSubmitting(true);
    try {
      const orderId = generateOrderId();
      const customer = customers.find(c => c.id === selectedCustomer);
      const store = stores.find(s => s.id === selectedStore);

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
        totalAmount: cart.reduce((sum, item) => sum + item.total, 0),
        paymentMode,
        status: 'new', // new, moved_to_manufacturing, etc.
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (editingOrderId) {
        await updateDoc(doc(db, 'orders', editingOrderId), orderData);
        toast.success(`Order #${orderId} updated successfully!`);
      } else {
        await addDoc(collection(db, 'orders'), orderData);
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

  const handlePrint = (order) => {
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
          <div class="total">Total: ₹${order.totalAmount.toFixed(2)}</div>
          <div class="divider"></div>
          <div class="center" style="font-size: 12px;">Thank you for your business!</div>
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

  const toggleOrderAccordion = (id) => {
    setExpandedOrders(prev => prev.includes(id) ? prev.filter(oId => oId !== id) : [...prev, id]);
  };

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      const newItems = [...order.items];
      newItems[itemIndex].status = newStatus;
      await updateDoc(orderRef, { items: newItems });
      toast.success("Item status updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const getStatusLabel = (status) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="orders-container">
      <div className="orders-header">
        <div className="orders-header-info">
          <h1>Customer Orders</h1>
          <p>Track and manage customer sweet orders and factory production</p>
        </div>
        <button className="add-order-btn" onClick={() => {
          resetForm();
          setShowAddModal(true);
        }}>
          <Plus size={20} /> Create New Order
        </button>
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
              <th>Status</th>
              <th>Date</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '100px' }}><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></td></tr>
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
                      <span className={`ord-status-badge ${order.status}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Pending'}
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
                      <td colSpan="8" style={{ padding: 0 }}>
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
              <tr><td colSpan="7" className="ord-orders-empty">No orders found. Click "Create New Order" to start.</td></tr>
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
                        <div className="ord-item-price">
                          <span className="amt">₹{item.total.toFixed(2)}</span>
                        </div>
                        <button onClick={() => removeFromCart(item.id)} style={{ color: 'var(--error-color)', background: 'none' }}>
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

                <div className="ord-desc-fields">
                  <div className="ord-desc-group">
                    <label>Manufacturing Unit Description</label>
                    <textarea 
                      placeholder="Special instructions for manufacturing..."
                      value={mUnitDescription}
                      onChange={(e) => setMUnitDescription(e.target.value)}
                    />
                  </div>
                  <div className="ord-desc-group">
                    <label>Packing Unit Description</label>
                    <textarea 
                      placeholder="Packaging and gift wrapping notes..."
                      value={pUnitDescription}
                      onChange={(e) => setPUnitDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="ord-summary-totals">
                  <div className="ord-total-row">
                    <span>Total Amount</span>
                    <span>₹{cart.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</span>
                  </div>
                  
                  <div className="ord-payment-modes">
                    {['Cash', 'UPI', 'Card'].map(mode => (
                      <button 
                        key={mode} 
                        className={`ord-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                        onClick={() => setPaymentMode(mode)}
                      >
                        {mode}
                      </button>
                    ))}
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
    </div>
  );
};

export default Orders;
