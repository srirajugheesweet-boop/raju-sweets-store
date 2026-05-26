import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Menu, X } from 'lucide-react';
import logo from '../../assets/logo.png';
import './Header.css';

const Header = ({ toggleSidebar, isSidebarOpen }) => {
  return (
    <header className="header">
      <div className="header-left">
        <button 
          className="header-menu-btn" 
          onClick={toggleSidebar}
          aria-label="Toggle Navigation Sidebar"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <Link to="/" className="header-logo">
          <img src={logo} alt="Raju Ghee Sweets" className="header-logo-img" />
        </Link>
      </div>

      <div className="header-right">
        <div className="admin-badge">
          <Star size={12} fill="currentColor" />
          <span>Super Admin</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
