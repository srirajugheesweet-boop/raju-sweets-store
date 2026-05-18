import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import logo from '../../assets/logo.png';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="header-left">
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
