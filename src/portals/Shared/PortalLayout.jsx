import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { LogOut, Home, Star } from 'lucide-react';
import { auth, db } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.png';
import './PortalLayout.css';

const PortalLayout = ({ children, title, links }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const [entityName, setEntityName] = useState('');
  const [entityRole, setEntityRole] = useState('Operator');

  useEffect(() => {
    if (!id) return;

    const fetchEntityDetails = async () => {
      try {
        if (location.pathname.startsWith('/store-portal')) {
          setEntityRole('Store Operator');
          const docRef = doc(db, 'stores', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        } else if (location.pathname.startsWith('/munit-portal')) {
          setEntityRole('Manufacturing Operator');
          const docRef = doc(db, 'manufacturing_units', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        } else if (location.pathname.startsWith('/punit-portal')) {
          setEntityRole('Packing Operator');
          const docRef = doc(db, 'packing_units', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        }
      } catch (error) {
        console.error("Error fetching entity details in PortalLayout:", error);
      }
    };

    fetchEntityDetails();
  }, [id, location.pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  return (
    <div className="layout-wrapper">
      <aside className="sidebar">
        <div className="sidebar-menu">
          {links.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              className={`sidebar-item ${location.pathname.startsWith(link.path) ? 'active' : ''}`}
            >
              {React.cloneElement(link.icon, { size: 24, className: 'sidebar-icon' })}
              <span className="sidebar-label">{link.label}</span>
            </Link>
          ))}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => navigate('/onboarding')} className="sidebar-switch-btn" title="Switch Portal">
            <Home size={24} />
            <span className="sidebar-label">Switch Portal</span>
          </button>
          <button onClick={handleLogout} className="sidebar-logout-btn" title="Logout">
            <LogOut size={24} />
            <span className="sidebar-label">Logout</span>
          </button>
        </div>
      </aside>

      <div className="layout-main">
        <header className="header">
          <div className="header-left">
            <Link to="/onboarding" className="header-logo">
              <img src={logo} alt="Raju Ghee Sweets" className="header-logo-img" />
            </Link>
          </div>

          <div className="header-right">
            <div className="admin-badge">
              <Star size={12} fill="currentColor" />
              <span>{entityRole}{entityName ? ` - ${entityName}` : ''}</span>
            </div>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default PortalLayout;
