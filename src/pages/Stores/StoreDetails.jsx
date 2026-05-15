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
  FileText,
  Calendar,
  Clock
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
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'access', 'orders'
  
  // Access State
  const [accessList, setAccessList] = useState([]);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessFormData, setAccessFormData] = useState({ name: '', phone: '' });
  const [submittingAccess, setSubmittingAccess] = useState(false);

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
        <button className={`tab-btn ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>Access Management</button>
        <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>Store Orders</button>
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
              {accessList.length > 0 ? accessList.map(access => (
                <div key={access.id} className="access-card">
                  <div className="access-info">
                    <h4>{access.name}</h4>
                    <p>{access.phone}</p>
                  </div>
                  <button className="store-mini-btn delete" onClick={() => handleDeleteAccess(access.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )) : (
                <div className="stores-empty-state" style={{ gridColumn: '1/-1' }}>
                  <Users size={32} />
                  <p>No special access assigned to this store yet.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Recent Orders</h2>
              <button className="add-access-btn" style={{ background: '#059669' }}>
                <Plus size={18} /> New Order
              </button>
            </div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>#ORD-7742</td>
                    <td>15 May 2026</td>
                    <td>Ghee Sweets, Mixture</td>
                    <td>₹ 4,500</td>
                    <td><span className="status-badge pending">Pending</span></td>
                  </tr>
                  <tr>
                    <td>#ORD-7741</td>
                    <td>14 May 2026</td>
                    <td>Snacks (Bulk)</td>
                    <td>₹ 12,800</td>
                    <td><span className="status-badge delivered">Delivered</span></td>
                  </tr>
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
              <p className="modal-text">Add a person who can manage or access this store's operations.</p>
              
              <form onSubmit={handleAddAccess} className="access-modal-form">
                <div>
                  <label>Full Name</label>
                  <input type="text" placeholder="Enter name" value={accessFormData.name} onChange={(e) => setAccessFormData({...accessFormData, name: e.target.value})} required />
                </div>
                <div>
                  <label>Mobile Number</label>
                  <input type="tel" placeholder="Enter mobile" value={accessFormData.phone} onChange={(e) => setAccessFormData({...accessFormData, phone: e.target.value})} required />
                </div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowAccessModal(false)}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} disabled={submittingAccess}>
                    {submittingAccess ? <div className="loader"></div> : 'Grant Access'}
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

export default StoreDetails;
