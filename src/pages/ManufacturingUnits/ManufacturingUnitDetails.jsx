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
import './ManufacturingUnitDetails.css';

const ManufacturingUnitDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUnit = async () => {
      try {
        const unitDoc = await getDoc(doc(db, 'manufacturing_units', id));
        if (unitDoc.exists()) {
          setUnit({ id: unitDoc.id, ...unitDoc.data() });
        } else {
          toast.error("Manufacturing unit not found");
          navigate('/manufacturing');
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
      
      // Filter orders that have at least one item from this manufacturing unit
      const unitOrders = allOrders.filter(order => 
        order.items.some(item => item.mUnitId === id)
      );
      
      setOrders(unitOrders);
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
      <button className="cd-back-btn" onClick={() => navigate('/manufacturing')}>
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
          <p>Displaying items that need preparation at this facility</p>
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

              {order.mUnitDescription && (
                <div className="mud-unit-instructions">
                  <AlertCircle size={14} />
                  <p>{order.mUnitDescription}</p>
                </div>
              )}

              <div className="mud-items-list">
                {order.items.filter(item => item.mUnitId === id).map((item, idx) => {
                  // Find original index in order.items for updates
                  const originalIndex = order.items.findIndex(i => i.id === item.id);
                  return (
                    <div key={idx} className="mud-item-row">
                      <div className="mud-item-main">
                        <Package size={16} />
                        <div className="mud-item-name-qty">
                          <span className="name">{item.name}</span>
                          <span className="qty">{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`}</span>
                        </div>
                      </div>
                      
                      <div className="mud-item-status-actions">
                        <span className={`mud-item-status-pill ${item.status}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                        {item.status === 'preparation_started' ? (
                          <button 
                            className="mud-status-update-btn complete"
                            onClick={() => updateItemStatus(order.id, originalIndex, 'preparation_completed')}
                          >
                            <CheckCircle2 size={14} /> Done
                          </button>
                        ) : (
                          <div className="completed-icon"><CheckCircle2 size={18} color="#166534" /></div>
                        )}
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
              <p>There are no items currently assigned to this manufacturing unit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManufacturingUnitDetails;
