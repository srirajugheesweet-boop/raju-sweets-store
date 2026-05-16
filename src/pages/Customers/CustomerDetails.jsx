import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  MapPin, 
  ShoppingBag, 
  Plus, 
  Info,
  ShoppingCart,
  Heart,
  Home,
  Mail,
  Calendar,
  Clock
} from 'lucide-react';

import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './CustomerDetails.css';

const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'orders', 'cart', 'wishlist', 'addresses'

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const customerDoc = await getDoc(doc(db, 'customers', id));
        if (customerDoc.exists()) {
          setCustomer({ id: customerDoc.id, ...customerDoc.data() });
        } else {
          toast.error("Customer not found");
          navigate('/customers');
        }
      } catch (error) {
        console.error("Error fetching customer:", error);
        toast.error("Failed to load customer details");
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [id, navigate]);

  if (loading) {
    return <div className="cd-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>;
  }

  if (!customer) return null;

  return (
    <div className="cd-container">
      <button className="cd-back-btn" onClick={() => navigate('/customers')}>
        <ArrowLeft size={18} /> Back to Customers
      </button>

      <div className="cd-header">
        <div className="cd-header-left">
          <div className="cd-main-icon">
            <User size={32} />
          </div>
          <div className="cd-header-info">
            <h1>{customer.firstName} {customer.lastName}</h1>
            <div className="cd-header-meta">
              <Phone size={14} /> {customer.mobileNumber}
            </div>
          </div>
        </div>
        <div className="cd-status-card">
          <span>Customer Status</span>
          <div className="cd-active-badge">Active</div>
        </div>
      </div>

      <div className="cd-tabs-nav">
        <div className={`cd-tab-tile ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <div className="cd-tile-icon"><Info size={18} /></div>
          <span>Info</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
          <div className="cd-tile-icon"><ShoppingBag size={18} /></div>
          <span>Orders</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')}>
          <div className="cd-tile-icon"><ShoppingCart size={18} /></div>
          <span>Cart</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'wishlist' ? 'active' : ''}`} onClick={() => setActiveTab('wishlist')}>
          <div className="cd-tile-icon"><Heart size={18} /></div>
          <span>Wishlist</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'addresses' ? 'active' : ''}`} onClick={() => setActiveTab('addresses')}>
          <div className="cd-tile-icon"><Home size={18} /></div>
          <span>Addresses</span>
        </div>
      </div>

      <div className="cd-tab-content">
        <AnimatePresence mode="wait">
          {activeTab === 'info' && (
            <motion.div 
              key="info"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-info-grid"
            >
              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon green"><User size={20} /></div>
                  <h3>Personal Details</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>First Name</label>
                    <span>{customer.firstName}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Last Name</label>
                    <span>{customer.lastName}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Mobile Number</label>
                    <span>{customer.mobileNumber}</span>
                  </div>
                </div>
              </div>

              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon blue"><MapPin size={20} /></div>
                  <h3>Address Details</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>City</label>
                    <span>{customer.city || 'N/A'}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>State</label>
                    <span>{customer.state || 'N/A'}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Full Address</label>
                    <span>{customer.address || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon purple"><Clock size={20} /></div>
                  <h3>System Info</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>Customer ID</label>
                    <span className="cd-id-text">{customer.id}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Registered On</label>
                    <span>{customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Orders History</h2>
                <button className="cd-btn-primary"><Plus size={18} /> Add Order</button>
              </div>
              <div className="cd-empty-state">
                <ShoppingBag size={48} />
                <p>No orders found for this customer.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'cart' && (
            <motion.div 
              key="cart"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Shopping Cart</h2>
              </div>
              <div className="cd-empty-state">
                <ShoppingCart size={48} />
                <p>The customer's cart is empty.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'wishlist' && (
            <motion.div 
              key="wishlist"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Wishlist Items</h2>
              </div>
              <div className="cd-empty-state">
                <Heart size={48} />
                <p>The customer's wishlist is empty.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'addresses' && (
            <motion.div 
              key="addresses"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Saved Addresses</h2>
                <button className="cd-btn-primary"><Plus size={18} /> Add Address</button>
              </div>
              <div className="cd-empty-state">
                <Home size={48} />
                <p>No additional addresses found.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CustomerDetails;
