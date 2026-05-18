import React, { useState, useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import { 
  ShoppingBag, 
  Users, 
  CreditCard, 
  ChevronDown, 
  ChevronUp, 
  Printer, 
  Search, 
  Scale, 
  Minus, 
  Plus, 
  X, 
  Sparkles, 
  Phone, 
  MapPin, 
  User, 
  Check, 
  ArrowRight,
  TrendingUp,
  Receipt,
  FileText,
  AlertCircle,
  Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StorePortal.css';

const DEFAULT_ITEM_IMAGE = 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&q=80&w=200';

const StorePortal = () => {
  const { id, tab } = useParams();
  const navigate = useNavigate();

  // Store metadata
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  // Orders State
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [expandedOrders, setExpandedOrders] = useState([]);

  // Customers State
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(true);

  // Billing & POS State
  const [billingSubTab, setBillingSubTab] = useState('pos'); // 'pos' or 'bills'
  const [billsFilterDate, setBillsFilterDate] = useState(new Date().toISOString().split('T')[0]); // defaults to today's date YYYY-MM-DD
  const [storeItems, setStoreItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [billingSearch, setBillingSearch] = useState('');
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });
  const [submittingBill, setSubmittingBill] = useState(false);
  const [selectedReceiptBill, setSelectedReceiptBill] = useState(null); // receipt preview modal

  const links = [
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/store-portal/${id}/orders` },
    { label: 'Customers', icon: <Users size={20} />, path: `/store-portal/${id}/customers` },
    { label: 'Billing & POS', icon: <CreditCard size={20} />, path: `/store-portal/${id}/billing` }
  ];

  // Helper function to match dates across local format variations securely
  const isSameDay = (billDateStr, selectedDateStr) => {
    if (!billDateStr || !selectedDateStr) return false;
    
    // selectedDateStr is always YYYY-MM-DD
    const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);
    
    try {
      // 1. Slash format (DD/MM/YYYY or MM/DD/YYYY)
      if (billDateStr.includes('/')) {
        const parts = billDateStr.split('/');
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
      if (billDateStr.includes('-')) {
        const parts = billDateStr.split('-');
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
      const parsed = new Date(billDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() === selYear && 
               parsed.getMonth() === (selMonth - 1) && 
               parsed.getDate() === selDay;
      }
    } catch (e) {
      console.error("Error parsing bill date:", e);
    }
    return false;
  };

  // Fetch Store Profile
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', id));
        if (storeDoc.exists()) {
          setStore({ id: storeDoc.id, ...storeDoc.data() });
        } else {
          toast.error("Store profile not found");
          navigate('/onboarding');
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load store profile");
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [id, navigate]);

  // Fetch Orders of the Store
  useEffect(() => {
    if (tab === 'orders') {
      const q = query(
        collection(db, 'orders'),
        where('storeId', '==', id)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setOrders(fetched);
      });
      return () => unsubscribe();
    }
  }, [id, tab]);

  // Fetch Customers List (Read-Only)
  useEffect(() => {
    if (tab === 'customers') {
      setCustomersLoading(true);
      const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCustomersLoading(false);
      });
      return () => unsubscribe();
    }
  }, [tab]);

  // Fetch Store Items & Bills for Billing Tab
  useEffect(() => {
    if (tab === 'billing') {
      const itemsQ = query(collection(db, 'store_items'), orderBy('name', 'asc'));
      const itemsUnsubscribe = onSnapshot(itemsQ, (snapshot) => {
        setStoreItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const billsQ = query(collection(db, 'stores', id, 'bills'), orderBy('createdAt', 'desc'));
      const billsUnsubscribe = onSnapshot(billsQ, (snapshot) => {
        setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        itemsUnsubscribe();
        billsUnsubscribe();
      };
    }
  }, [id, tab]);

  if (!tab) return <Navigate to={`/store-portal/${id}/orders`} replace />;

  if (loading) {
    return (
      <PortalLayout title="Store Portal" links={links}>
        <div className="st-portal-loading"><div className="loader"></div></div>
      </PortalLayout>
    );
  }

  // --- Accordion Controls for Orders ---
  const toggleOrderAccordion = (orderId) => {
    setExpandedOrders(prev => prev.includes(orderId) ? prev.filter(oId => oId !== orderId) : [...prev, orderId]);
  };

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      const newItems = [...order.items];
      newItems[itemIndex].status = newStatus;
      await updateDoc(orderRef, { items: newItems });
      toast.success("Item preparation status updated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update item status");
    }
  };

  // --- POS Billing Logic ---
  const handleItemClick = (item) => {
    const existing = cart.find(c => c.id === item.id);
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      if (existing) {
        setWeightInput({ weight: existing.quantity, amount: existing.total });
      } else {
        setWeightInput({ weight: '', amount: '' });
      }
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const addToCart = (item, quantity, amount) => {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    if (existingIndex > -1 && item.unit !== 'Weight') {
      setCart(cart.map((c, i) => i === existingIndex ? { ...c, quantity: c.quantity + quantity, total: (c.quantity + quantity) * c.price } : c));
    } else if (existingIndex > -1 && item.unit === 'Weight') {
      setCart(cart.map((c, i) => i === existingIndex ? { ...c, quantity, total: parseFloat(amount) } : c));
    } else {
      setCart([...cart, { 
        id: item.id, 
        name: item.name, 
        price: item.price, 
        unit: item.unit,
        quantity, 
        total: parseFloat(amount) 
      }]);
    }
    toast.success(`${item.name} added to cart`);
  };

  const updateQuantity = (itemId, delta, isWeight = false) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === itemId);
      if (!existing) return prev;
      
      if (delta === -1 && existing.quantity <= (isWeight ? 0.001 : 1)) {
        return prev.filter(c => c.id !== itemId);
      }

      return prev.map(c => {
        if (c.id === itemId) {
          const newQty = isWeight ? parseFloat(c.quantity) + (delta * 0.1) : c.quantity + delta;
          const newTotal = newQty * c.price;
          return { ...c, quantity: isWeight ? newQty.toFixed(3) : newQty, total: newTotal };
        }
        return c;
      });
    });
  };

  const handleWeightCalc = (type, value) => {
    const price = showWeightModal.price;
    if (type === 'weight') {
      const amt = (parseFloat(value) * price).toFixed(2);
      setWeightInput({ weight: value, amount: amt });
    } else {
      const wt = (parseFloat(value) / price).toFixed(3);
      setWeightInput({ weight: wt, amount: value });
    }
  };

  const confirmWeightAdd = () => {
    if (!weightInput.weight || !weightInput.amount) return;
    addToCart(showWeightModal, weightInput.weight, weightInput.amount);
    setShowWeightModal(null);
  };

  const settleBill = async () => {
    if (cart.length === 0) return toast.error("Your cart is empty");
    setSubmittingBill(true);
    try {
      const billId = generateBillId();
      const billData = {
        billId,
        storeId: id,
        storeName: store?.name || 'Raju Ghee Sweets',
        items: cart,
        totalAmount: cart.reduce((sum, item) => sum + item.total, 0),
        paymentMode,
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString()
      };
      
      await addDoc(collection(db, 'stores', id, 'bills'), billData);
      toast.success(`Bill settled successfully: ${billId}`);
      setCart([]);
      setSelectedReceiptBill(billData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to settle bill");
    } finally {
      setSubmittingBill(false);
    }
  };

  const handlePrintReceipt = (bill) => {
    const printContent = `
      <html>
        <head>
          <title>Invoice - ${bill.billId}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #333; }
            .receipt-header { text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 15px; margin-bottom: 25px; }
            .receipt-header h1 { margin: 0; color: #15803d; font-size: 24px; }
            .receipt-header p { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
            .meta-section { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; }
            .meta-column h4 { margin: 0 0 6px 0; color: #1e293b; }
            .meta-column p { margin: 2px 0; color: #64748b; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #f8fafc; padding: 10px; font-size: 11px; text-align: left; color: #475569; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
            .number-cell { text-align: right; }
            .total-row { font-weight: bold; background: #f0fdf4; font-size: 15px; }
            .total-row td { color: #16a34a; border-top: 2px solid #bbf7d0; }
            .receipt-footer { text-align: center; margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1>Raju Ghee Sweets</h1>
            <p>${bill.storeName || 'Outlet Store'}</p>
          </div>
          <div class="meta-section">
            <div class="meta-column">
              <h4>Invoice Details</h4>
              <p>Bill ID: <strong>${bill.billId}</strong></p>
              <p>Date: ${bill.date}</p>
            </div>
            <div class="meta-column" style="text-align: right;">
              <h4>Payment Info</h4>
              <p>Mode: ${bill.paymentMode}</p>
              <p>Status: Paid</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Product Description</th>
                <th class="number-cell">Rate</th>
                <th class="number-cell">Quantity</th>
                <th class="number-cell">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${bill.items.map(item => `
                <tr>
                  <td style="font-weight: 600;">${item.name}</td>
                  <td class="number-cell">₹${Number(item.price).toFixed(2)}</td>
                  <td class="number-cell">${item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                  <td class="number-cell" style="font-weight: 700;">₹${Number(item.total).toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">Grand Total</td>
                <td class="number-cell">₹${Number(bill.totalAmount).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div class="receipt-footer">
            <p>Thank you for shopping at Raju Ghee Sweets!</p>
            <p>Please visit again.</p>
          </div>
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

  // --- Filtering Methods ---
  const filteredOrders = orders.filter(ord => 
    ord.orderId.toLowerCase().includes(orderSearch.toLowerCase()) ||
    ord.customerName.toLowerCase().includes(orderSearch.toLowerCase())
  );

  const filteredCustomers = customers.filter(cust => 
    `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(customerSearch.toLowerCase()) ||
    cust.mobileNumber.includes(customerSearch)
  );

  // Filter bills by the selected date input (defaults to today's date YYYY-MM-DD)
  const filteredBills = bills.filter(bill => {
    const formattedBillDate = bill.date || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString() : '');
    return isSameDay(formattedBillDate, billsFilterDate);
  });

  return (
    <PortalLayout title="Store Portal" links={links}>
      <div className="st-portal-content">
        
        {/* --- ORDERS VIEW --- */}
        {tab === 'orders' && (
          <div className="st-orders-view">
            <div className="st-view-header">
              <div>
                <h2>Store Orders ({orders.length})</h2>
                <p className="st-view-desc">Monitor prep status and delivery schedules for this outlet</p>
              </div>
              <div className="st-search-wrapper">
                <Search size={18} className="st-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search by Order ID or Customer..." 
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="st-table-wrapper">
              <table className="st-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Total Price</th>
                    <th>Overall Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <React.Fragment key={order.id}>
                      <tr className={expandedOrders.includes(order.id) ? "row-expanded" : ""}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => toggleOrderAccordion(order.id)}>
                            {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            #{order.orderId}
                          </div>
                        </td>
                        <td>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'New'}</td>
                        <td>{order.customerName}</td>
                        <td style={{ fontWeight: '700' }}>₹{order.totalAmount.toFixed(2)}</td>
                        <td>
                          <span className={`status-badge ${order.status}`} style={{ fontSize: '10px' }}>
                            {order.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                      
                      {expandedOrders.includes(order.id) && (
                        <tr className="st-accordion-row">
                          <td colSpan="5" style={{ padding: 0 }}>
                            <div className="st-accordion-content">
                              <h4>Order Items & Preparation Status</h4>
                              <table className="st-items-subtable">
                                <thead>
                                  <tr>
                                    <th>Item Name</th>
                                    <th>Description</th>
                                    <th>Quantity</th>
                                    <th>Price Total</th>
                                    <th>Status Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td style={{ fontWeight: '700' }}>{item.name}</td>
                                      <td style={{ color: '#64748b', fontSize: '12px' }}>{item.description || '-'}</td>
                                      <td>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                                      <td style={{ fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                                      <td>
                                        <select 
                                          className="st-item-status-select"
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
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No orders found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- CUSTOMERS VIEW (READ-ONLY) --- */}
        {tab === 'customers' && (
          <div className="st-customers-view">
            <div className="st-view-header">
              <div>
                <h2>Customer Directory</h2>
                <p className="st-view-desc">View and search our registered customer contacts</p>
              </div>
              <div className="st-search-wrapper">
                <Search size={18} className="st-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search customers..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>

            {customersLoading ? (
              <div className="st-portal-loading"><div className="loader"></div></div>
            ) : (
              <div className="st-customers-grid">
                {filteredCustomers.map(cust => (
                  <div key={cust.id} className="st-customer-card">
                    <div className="st-cust-avatar">
                      <User size={20} />
                    </div>
                    <div className="st-cust-details">
                      <h3>{cust.firstName} {cust.lastName || ''}</h3>
                      <div className="st-cust-meta">
                        <Phone size={13} />
                        <span>{cust.mobileNumber}</span>
                      </div>
                      {cust.city && (
                        <div className="st-cust-meta">
                          <MapPin size={13} />
                          <span>{cust.city}, {cust.state}</span>
                        </div>
                      )}
                    </div>
                    <div className="st-cust-badge">
                      <span>Regular</span>
                    </div>
                  </div>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="st-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <Users size={48} />
                    <h3>No Customers Registered</h3>
                    <p>When customers sign up on the POS or online shop, they will appear here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- BILLING & POS VIEW (WITH SUB TABS) --- */}
        {tab === 'billing' && (
          <div className="st-billing-view">
            
            {/* View Header with Sub Navigation Tabs */}
            <div className="st-view-header" style={{ marginBottom: '20px' }}>
              <div>
                <h2>Billing & POS Terminal</h2>
                <p className="st-view-desc">Settle walk-in bills and view past store invoice records</p>
              </div>
              <div className="st-sub-tabs">
                <button 
                  className={`st-sub-tab-btn ${billingSubTab === 'pos' ? 'active' : ''}`}
                  onClick={() => setBillingSubTab('pos')}
                >
                  <CreditCard size={16} /> POS Terminal
                </button>
                <button 
                  className={`st-sub-tab-btn ${billingSubTab === 'bills' ? 'active' : ''}`}
                  onClick={() => setBillingSubTab('bills')}
                >
                  <Receipt size={16} /> Bills History
                </button>
              </div>
            </div>

            {/* --- SUB TAB 1: POS BILLING FUNCTIONALITY --- */}
            {billingSubTab === 'pos' && (
              <div className="st-pos-layout">
                {/* POS Catalogue Panel */}
                <div className="st-pos-catalogue">
                  <div className="st-catalogue-header">
                    <h3>Product Catalogue</h3>
                    <div className="st-pos-search">
                      <Search size={16} />
                      <input 
                        type="text" 
                        placeholder="Search products..." 
                        value={billingSearch}
                        onChange={(e) => setBillingSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="st-catalogue-grid">
                    {storeItems
                      .filter(i => i.name.toLowerCase().includes(billingSearch.toLowerCase()))
                      .map(item => {
                        const inCart = cart.find(c => c.id === item.id);
                        return (
                          <div key={item.id} className="st-pos-item-card">
                            <div className="st-pos-item-img" onClick={() => handleItemClick(item)}>
                              <img src={(!item.image || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} alt={item.name} />
                              {inCart && (
                                <div className="st-cart-badge">
                                  {item.unit === 'Weight' ? `${inCart.quantity}kg` : inCart.quantity}
                                </div>
                              )}
                            </div>
                            <div className="st-pos-item-info">
                              <h4>{item.name}</h4>
                              <div className="st-pos-item-footer">
                                <span className="price">₹{item.price} <small>/{item.unit === 'Weight' ? 'kg' : 'pc'}</small></span>
                                {item.unit === 'Piece' ? (
                                  <div className="st-pos-qty-controls">
                                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}><Minus size={12} /></button>
                                    <span>{inCart ? inCart.quantity : 0}</span>
                                    <button onClick={(e) => { e.stopPropagation(); inCart ? updateQuantity(item.id, 1) : handleItemClick(item); }}><Plus size={12} /></button>
                                  </div>
                                ) : (
                                  <button className="st-pos-weight-btn" onClick={() => handleItemClick(item)}>
                                    <Scale size={12} /> Scale
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {storeItems.length === 0 && (
                      <div className="st-empty-catalog" style={{ gridColumn: '1 / -1' }}>
                        <AlertCircle size={32} />
                        <p>No store products configured.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* POS Summary Panel */}
                <div className="st-pos-summary">
                  <div className="st-summary-header">
                    <h3>Current Shopping Cart</h3>
                  </div>

                  <div className="st-summary-items">
                    {cart.map((item, idx) => (
                      <div key={idx} className="st-summary-row">
                        <div className="st-summary-details">
                          <span className="name">{item.name}</span>
                          <span className="price-sub">₹{item.price} / {item.unit === 'Weight' ? 'kg' : 'pc'}</span>
                        </div>
                        <div className="st-summary-actions">
                          {item.unit === 'Weight' ? (
                            <div className="st-pos-qty-controls">
                              <button onClick={() => handleItemClick(storeItems.find(si => si.id === item.id))} title="Edit Weight"><Scale size={12} /></button>
                              <span>{item.quantity}kg</span>
                            </div>
                          ) : (
                            <div className="st-pos-qty-controls">
                              <button onClick={() => updateQuantity(item.id, -1)}><Minus size={12} /></button>
                              <span>{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)}><Plus size={12} /></button>
                            </div>
                          )}
                          <span className="total">₹{item.total.toFixed(2)}</span>
                          <button className="remove-btn" onClick={() => setCart(cart.filter((_, i) => i !== idx))}><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                    {cart.length === 0 && (
                      <div className="st-empty-cart">
                        <ShoppingBag size={32} />
                        <p>Your shopping cart is empty.</p>
                      </div>
                    )}
                  </div>

                  <div className="st-summary-settle">
                    <div className="total-display">
                      <span>Grand Total</span>
                      <span className="amt">₹{cart.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</span>
                    </div>

                    <div className="payment-select">
                      {['UPI', 'Cash', 'Card'].map(mode => (
                        <button 
                          key={mode} 
                          className={`pay-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                          onClick={() => setPaymentMode(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <button 
                      className="st-settle-btn" 
                      onClick={settleBill} 
                      disabled={submittingBill || cart.length === 0}
                    >
                      {submittingBill ? <div className="loader"></div> : 'Settle Bill & Settle'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* --- SUB TAB 2: BILLS LIST WITH TODAY DATE FILTER DEFAULT --- */}
            {billingSubTab === 'bills' && (
              <div className="st-billing-history-tab">
                {/* Date Filter Bar */}
                <div className="st-date-filter-bar">
                  <div className="st-filter-left">
                    <Calendar size={18} className="st-filter-cal-icon" />
                    <span className="st-filter-label">Filter Bills by Date:</span>
                    <input 
                      type="date" 
                      className="st-date-picker-input"
                      value={billsFilterDate} 
                      onChange={(e) => setBillsFilterDate(e.target.value)} 
                    />
                  </div>
                  <button 
                    className="st-today-reset-btn"
                    onClick={() => setBillsFilterDate(new Date().toISOString().split('T')[0])}
                  >
                    Reset to Today
                  </button>
                </div>

                <div className="st-table-wrapper">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Bill ID</th>
                        <th>Settled Date</th>
                        <th>Amount Total</th>
                        <th>Payment Mode</th>
                        <th>Total Items</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map(bill => (
                        <tr key={bill.id}>
                          <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{bill.billId}</td>
                          <td>{bill.date}</td>
                          <td style={{ fontWeight: '700' }}>₹{bill.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`payment-mode-badge ${bill.paymentMode}`}>
                              {bill.paymentMode}
                            </span>
                          </td>
                          <td>{bill.items.length} items</td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="st-mini-print-btn" 
                              onClick={() => handlePrintReceipt(bill)}
                              title="Print Invoice Receipt"
                            >
                              <Printer size={15} /> Print Receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredBills.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '50px 40px', color: '#64748b' }}>
                            <AlertCircle size={32} style={{ margin: '0 auto 10px auto', color: '#94a3b8' }} />
                            <p style={{ fontWeight: '600' }}>No bills found for date: {new Date(billsFilterDate).toLocaleDateString()}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* Weight Modal */}
      <AnimatePresence>
        {showWeightModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}><Scale size={32} /></div>
              <h3 className="modal-title">Calculate Weight Item</h3>
              <div className="access-modal-form">
                <div><label>Weight (kg)</label><input type="number" step="0.001" value={weightInput.weight} onChange={(e) => handleWeightCalc('weight', e.target.value)} /></div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b', fontSize: '12px' }}>OR</div>
                <div><label>Budget Amount (₹)</label><input type="number" value={weightInput.amount} onChange={(e) => handleWeightCalc('amount', e.target.value)} /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button type="button" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} onClick={confirmWeightAdd}>Confirm Add</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bill Receipt Preview Modal */}
      <AnimatePresence>
        {selectedReceiptBill && (
          <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <motion.div 
              className="st-receipt-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              <div className="receipt-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color="var(--primary-color)" />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Bill Receipt Settle Successful</h3>
                </div>
                <button className="close-btn" onClick={() => setSelectedReceiptBill(null)}><X size={18} /></button>
              </div>

              <div className="receipt-print-area">
                <div className="receipt-brand">
                  <h2>Raju Ghee Sweets</h2>
                  <p>{selectedReceiptBill.storeName || 'Outlet Store'}</p>
                </div>

                <div className="receipt-meta-grid">
                  <div>
                    <span className="label">Bill ID</span>
                    <span className="value">#{selectedReceiptBill.billId}</span>
                  </div>
                  <div>
                    <span className="label">Date</span>
                    <span className="value">{selectedReceiptBill.date}</span>
                  </div>
                  <div>
                    <span className="label">Payment Mode</span>
                    <span className="value">{selectedReceiptBill.paymentMode}</span>
                  </div>
                  <div>
                    <span className="label">Payment Status</span>
                    <span className="value" style={{ color: '#16a34a', fontWeight: '800' }}>PAID</span>
                  </div>
                </div>

                <div className="receipt-table-section">
                  <h4>Product Invoice Items</h4>
                  <table className="slip-subtable">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceiptBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600' }}>{item.name}</td>
                          <td style={{ textAlign: 'right' }}>₹{Number(item.price).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>₹{Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="slip-total-row">
                        <td colSpan="3" style={{ fontWeight: '800' }}>Grand Total Amount</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary-color)', fontSize: '17px' }}>
                          ₹{Number(selectedReceiptBill.totalAmount).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="receipt-modal-footer">
                <button className="modal-btn cancel" onClick={() => setSelectedReceiptBill(null)}>Close</button>
                <button className="st-print-invoice-btn" onClick={() => handlePrintReceipt(selectedReceiptBill)}>
                  <Printer size={16} /> Print Receipt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </PortalLayout>
  );
};

export default StorePortal;
