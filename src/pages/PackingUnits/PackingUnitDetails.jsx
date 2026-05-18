import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Factory, 
  MapPin, 
  Building2, 
  ShoppingBag, 
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  User
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './PackingUnitDetails.css';

const PackingUnitDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUnit = async () => {
      try {
        const unitDoc = await getDoc(doc(db, 'packing_units', id));
        if (unitDoc.exists()) {
          setUnit({ id: unitDoc.id, ...unitDoc.data() });
        } else {
          toast.error("Packing unit not found");
          navigate('/packing');
        }
      } catch (error) {
        toast.error("Failed to load unit details");
      }
    };
    fetchUnit();
  }, [id, navigate]);

  useEffect(() => {
    // Fetch all orders and filter locally for items belonging to this unit
    // Alternatively, we could structure orders to be more queryable per item, 
    // but since items are nested in the order document, we filter locally.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter orders that have at least one item assigned to this packing unit, or the order itself is assigned
      // Assuming packing unit is assigned at order level (pUnitId) or item level
      const unitOrders = allOrders.filter(order => order.pUnitId === id);
      
      setOrders(unitOrders);
      setLoading(false);
    }, (error) => {
      console.error("MU Orders subscription error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      const updatedItems = [...order.items];
      updatedItems[itemIndex].status = newStatus;
      
      await updateDoc(orderRef, { items: updatedItems });
      toast.success("Item status updated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return <div className="mud-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>;
  }

  if (!unit) return null;

  return (
    <div className="mud-container">
      <button className="cd-back-btn" onClick={() => navigate('/packing')}>
        <ArrowLeft size={18} /> Back to Units
      </button>

      <div className="mud-header">
        <div className="mud-header-left">
          <div className="mud-main-icon">
            <Factory size={32} />
          </div>
          <div className="mud-header-info">
            <h1>{unit.name}</h1>
            <div className="mud-header-meta">
              <MapPin size={14} /> {unit.city}, {unit.state}
            </div>
          </div>
        </div>
        <div className="mud-status-card">
          <span>Unit Status</span>
          <div className="cd-active-badge">Operational</div>
        </div>
      </div>

      <div className="mud-content">
        <div className="mud-section-header">
          <h2><ShoppingBag size={20} /> Assigned Orders & Items</h2>
          <p>Displaying items that need packing at this facility</p>
        </div>

        <div className="mud-orders-grid">
          {orders.length > 0 ? orders.map(order => (
            <div key={order.id} className="mud-order-card">
              <div className="mud-order-header">
                <div className="mud-order-main-info">
                  <span className="mud-order-id">#{order.orderId}</span>
                  <span className="mud-order-date">{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'New'}</span>
                </div>
                <div className={`mud-order-status-tag ${order.status}`}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
              
              <div className="mud-customer-info">
                <User size={14} />
                <span>{order.customerName}</span>
              </div>

              {order.pUnitDescription && (
                <div className="mud-unit-instructions">
                  <AlertCircle size={14} />
                  <p>{order.pUnitDescription}</p>
                </div>
              )}

              <div className="mud-items-list">
                {order.items.map((item, idx) => {
                  // Find original index in order.items for updates
                  const originalIndex = order.items.findIndex(i => i.id === item.id);
                  return (
                    <div key={idx} className="mud-item-row">
                      <div className="mud-item-main">
                        <Package size={16} className="item-icon" />
                        <div className="mud-item-name-qty">
                          <span className="name">{item.name}</span>
                          {item.description && <span className="desc">{item.description}</span>}
                          <span className="qty">{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`}</span>
                        </div>
                      </div>
                      
                      <div className="mud-item-status-ctrl">
                        <select 
                          className="mud-status-select"
                          value={item.status || 'preparation_started'}
                          onChange={(e) => updateItemStatus(order.id, originalIndex, e.target.value)}
                        >
                          <option value="preparation_started">Preparation Started</option>
                          <option value="preparation_complete">Preparation Complete</option>
                          <option value="moved_to_packing">Moved to Packing</option>
                          <option value="packing_complete">Packing Complete</option>
                          <option value="moved_to_store">Moved to Store</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="mud-empty-state">
              <Package size={48} />
              <h3>No Active Orders</h3>
              <p>There are no orders currently assigned to this packing unit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackingUnitDetails;
