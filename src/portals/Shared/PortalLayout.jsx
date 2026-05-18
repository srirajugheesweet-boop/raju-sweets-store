import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { auth } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import './PortalLayout.css';

const PortalLayout = ({ children, title, links }) => {
  const navigate = useNavigate();
  const location = useLocation();

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
    <div className="ptl-wrapper">
      <nav className="ptl-sidebar">
        <div className="ptl-sidebar-header">
          <h2>{title}</h2>
        </div>
        <div className="ptl-nav-links">
          {links.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              className={`ptl-nav-item ${location.pathname.startsWith(link.path) ? 'active' : ''}`}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
        <div className="ptl-sidebar-footer">
          <button onClick={() => navigate('/onboarding')} className="ptl-switch-btn">
            <Home size={18} /> Switch Portal
          </button>
          <button onClick={handleLogout} className="ptl-logout-btn">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </nav>
      <main className="ptl-main-content">
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
