import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Store, 
  Phone, 
  MapPin, 
  Navigation, 
  Users, 
  ShoppingBag, 
  Plus, 
  X, 
  Trash2, 
  UserCheck,
  Search,
  Scale,
  Package
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StoreDetails.css';

const StoreDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'access', 'orders', 'billing'
  
  // Access State
  const [accessList, setAccessList] = useState([]);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessFormData, setAccessFormData] = useState({ name: '', phone: '' });
  const [submittingAccess, setSubmittingAccess] = useState(false);

  // Billing State
  const [storeItems, setStoreItems] = useState([]);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [showWeightModal, setShowWeightModal] = useState(null); 
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });
  const [bills, setBills] = useState([]);

  // Fetch Store Details
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', id));
        if (storeDoc.exists()) {
          setStore({ id: storeDoc.id, ...storeDoc.data() });
        } else {
          toast.error("Store not found");
          navigate('/stores');
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        toast.error("Failed to load store details");
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [id, navigate]);

  // Fetch Access List
  useEffect(() => {
    if (activeTab === 'access') {
      const q = query(collection(db, 'stores', id, 'access'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setAccessList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [id, activeTab]);

  // Fetch Bills
  useEffect(() => {
    if (activeTab === 'billing') {
      const q = query(collection(db, 'stores', id, 'bills'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [id, activeTab]);

  // Fetch Store Items
  useEffect(() => {
    const q = query(collection(db, 'store_items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStoreItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddAccess = async (e) => {
    e.preventDefault();
    setSubmittingAccess(true);
    try {
      await addDoc(collection(db, 'stores', id, 'access'), {
        ...accessFormData,
        createdAt: serverTimestamp()
      });
      toast.success("Access granted successfully");
      setShowAccessModal(false);
      setAccessFormData({ name: '', phone: '' });
    } catch (error) {
      toast.error("Failed to add access");
    } finally {
      setSubmittingAccess(false);
    }
  };

  const handleDeleteAccess = async (accessId) => {
    try {
      await deleteDoc(doc(db, 'stores', id, 'access', accessId));
      toast.success("Access revoked");
    } catch (error) {
      toast.error("Failed to revoke access");
    }
  };

  // Billing Logic
  const handleItemClick = (item) => {
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      setWeightInput({ weight: '', amount: '' });
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const addToCart = (item, quantity, amount) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing && item.unit !== 'Weight') {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + quantity, total: (c.quantity + quantity) * c.price } : c));
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
    toast.success(`${item.name} added`);
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

  const generateBillId = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `SB${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const settleBill = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setSubmittingAccess(true);
    try {
      const billId = generateBillId();
      const billData = {
        billId,
        storeId: id,
        items: cart,
        totalAmount: cart.reduce((sum, item) => sum + item.total, 0),
        paymentMode,
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString()
      };
      await addDoc(collection(db, 'stores', id, 'bills'), billData);
      toast.success(`Bill Settled: ${billId}`);
      setCart([]);
      setShowBillingModal(false);
    } catch (error) {
      toast.error("Failed to settle bill");
    } finally {
      setSubmittingAccess(false);
    }
  };

  if (loading) {
    return <div className="store-details-container"><div className="loader"></div></div>;
  }

  if (!store) return null;

  return (
    <div className="store-details-container">
      <button className="header-back-btn" onClick={() => navigate('/stores')}>
        <ArrowLeft size={18} /> Back to Stores
      </button>

      <div className="store-details-header">
        <div className="header-main-info">
          <h1><Store size={32} /> {store.name}</h1>
          <p>{store.city}, {store.state}</p>
        </div>
      </div>

      <div className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>Store Info</button>
        <button className={`tab-btn ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>Access</button>
        <button className={`tab-btn ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>Billing</button>
        <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>Orders</button>
      </div>

      <div className="tab-content">
        {activeTab === 'info' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="info-grid">
            <div className="info-card">
              <h3>Contact Information</h3>
              <div className="info-item"><Phone size={18} /> {store.phone}</div>
            </div>
            <div className="info-card">
              <h3>Location Details</h3>
              <div className="info-item"><MapPin size={18} /> {store.address}</div>
              <div className="info-item"><Navigation size={18} /> {store.city}, {store.state}</div>
            </div>
            {(store.latitude && store.longitude) && (
              <div className="info-card">
                <h3>GPS Coordinates</h3>
                <div className="info-item">Lat: {store.latitude}</div>
                <div className="info-item">Long: {store.longitude}</div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'access' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Assigned Access ({accessList.length})</h2>
              <button className="add-access-btn" onClick={() => setShowAccessModal(true)}>
                <Plus size={18} /> Grant Access
              </button>
            </div>
            <div className="access-list">
              {accessList.map(access => (
                <div key={access.id} className="access-card">
                  <div className="access-info"><h4>{access.name}</h4><p>{access.phone}</p></div>
                  <button className="store-mini-btn delete" onClick={() => handleDeleteAccess(access.id)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'billing' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Billing History</h2>
              <button className="add-access-btn" onClick={() => setShowBillingModal(true)}>
                <Plus size={18} /> Add Bill
              </button>
            </div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(bill => (
                    <tr key={bill.id}>
                      <td>{bill.billId}</td>
                      <td>{bill.date}</td>
                      <td>₹{bill.totalAmount.toFixed(2)}</td>
                      <td>{bill.paymentMode}</td>
                      <td>{bill.items.length} items</td>
                    </tr>
                  ))}
                  {bills.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding: '40px'}}>No bills found.</td></tr>}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header"><h2>Recent Orders</h2><button className="add-access-btn" style={{ background: '#059669' }}><Plus size={18} /> New Order</button></div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead><tr><th>Order ID</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td>#ORD-7742</td><td>15 May 2026</td><td>Ghee Sweets, Mixture</td><td>₹ 4,500</td><td><span className="status-badge pending">Pending</span></td></tr>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* Access Modal */}
      <AnimatePresence>
        {showAccessModal && (
          <div className="modal-overlay">
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#E0F2FE', color: '#0284C7' }}><UserCheck size={32} /></div>
              <h3 className="modal-title">Grant Store Access</h3>
              <form onSubmit={handleAddAccess} className="access-modal-form">
                <div><label>Full Name</label><input type="text" value={accessFormData.name} onChange={(e) => setAccessFormData({...accessFormData, name: e.target.value})} required /></div>
                <div><label>Mobile Number</label><input type="tel" value={accessFormData.phone} onChange={(e) => setAccessFormData({...accessFormData, phone: e.target.value})} required /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowAccessModal(false)}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} disabled={submittingAccess}>
                    {submittingAccess ? <div className="loader"></div> : 'Save'}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Billing Modal */}
      <AnimatePresence>
        {showBillingModal && (
          <motion.div className="full-screen-modal" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
            <div className="billing-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <Store size={24} color="var(--primary-color)" />
                <div><h2>Store Billing - {store.name}</h2><p>Pos Terminal Active</p></div>
              </div>
              <button className="stores-close-btn" onClick={() => setShowBillingModal(false)}><X size={20} /></button>
            </div>
            <div className="billing-modal-content">
              <div className="billing-left-panel">
                <div className="stores-search-bar"><Search size={18} className="stores-search-icon" /><input type="text" placeholder="Search products..." value={billingSearch} onChange={(e) => setBillingSearch(e.target.value)} /></div>
                <div className="billing-item-list">
                  {storeItems.filter(i => i.name.toLowerCase().includes(billingSearch.toLowerCase())).map(item => (
                    <div key={item.id} className="billing-item-card" onClick={() => handleItemClick(item)}>
                      <h4>{item.name}</h4><p>₹{item.price}</p><span>{item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="billing-right-panel">
                <h3 style={{ marginBottom: '20px' }}><ShoppingBag size={20} /> Order Summary</h3>
                <div className="summary-items">
                  {cart.map((item, idx) => (
                    <div key={idx} className="summary-item-row">
                      <div><div style={{ fontWeight: '600' }}>{item.name}</div><div style={{ fontSize: '12px' }}>{item.quantity} x ₹{item.price}</div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}><span style={{ fontWeight: '700' }}>₹{item.total.toFixed(2)}</span><button onClick={() => setCart(cart.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none' }}><X size={16} /></button></div>
                    </div>
                  ))}
                </div>
                <div className="summary-total">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: '800' }}><span>Total</span><span style={{ color: 'var(--primary-color)' }}>₹{cart.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</span></div>
                  <div className="payment-modes">{['Cash', 'UPI', 'Card'].map(mode => <button key={mode} className={`mode-btn ${paymentMode === mode ? 'active' : ''}`} onClick={() => setPaymentMode(mode)}>{mode}</button>)}</div>
                  <button className="stores-btn-save" style={{ width: '100%', height: '54px', marginTop: '20px' }} onClick={settleBill} disabled={submittingAccess}>
                    {submittingAccess ? <div className="loader"></div> : 'Settle Bill'}
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
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}><Scale size={32} /></div>
              <h3 className="modal-title">Enter Weight/Amount</h3>
              <div className="access-modal-form">
                <div><label>Weight (kg)</label><input type="number" step="0.001" value={weightInput.weight} onChange={(e) => handleWeightCalc('weight', e.target.value)} /></div>
                <div style={{ textAlign: 'center' }}>OR</div>
                <div><label>Amount (₹)</label><input type="number" value={weightInput.amount} onChange={(e) => handleWeightCalc('amount', e.target.value)} /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button type="button" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} onClick={confirmWeightAdd}>Add</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreDetails;
