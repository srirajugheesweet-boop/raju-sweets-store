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
  Factory
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
  where
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

  // Form State
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
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
        const [custSnap, storeSnap, itemSnap, muSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('firstName', 'asc'))),
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'customer_items'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'manufacturing_units'), orderBy('name', 'asc')))
        ]);

        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setItems(itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setMUnits(muSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

      // Add to main orders collection
      await addDoc(collection(db, 'orders'), orderData);
      
      // Also potentially add to manufacturing unit specific task queues
      // For each item, if it belongs to a manufacturing unit, we can create a sub-task
      // But based on user request, it's displayed in a "manufacturing details page"
      
      toast.success(`Order #${orderId} saved successfully!`);
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
    setGlobalDescription('');
    setMUnitDescription('');
    setPUnitDescription('');
    setCart([]);
    setPaymentMode('Cash');
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
        <button className="add-order-btn" onClick={() => setShowAddModal(true)}>
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
                <tr key={order.id}>
                  <td className="ord-id-cell">#{order.orderId}</td>
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
                </tr>
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
                  <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Create New Customer Order</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Fill in customer details and select items</p>
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
    </div>
  );
};

export default Orders;
