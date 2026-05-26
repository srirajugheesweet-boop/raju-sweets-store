import React, { useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { 
  LogOut,
  LayoutDashboard, 
  ShoppingBag, 
  Box, 
  Tag, 
  Store, 
  Factory, 
  Package, 
  UserCog, 
  UserCircle, 
  Clock, 
  CreditCard, 
  LifeBuoy
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Sidebar.css';

export const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, path: '/dashboard' },
  { id: 'payments', label: 'Payments', icon: <CreditCard />, path: '/payments' },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag />, path: '/orders' },
  { id: 'items', label: 'Items', icon: <Box />, path: '/items' },
  { id: 'categories', label: 'Categories', icon: <Tag />, path: '/categories' },
  { id: 'stores', label: 'Stores', icon: <Store />, path: '/stores' },
  { id: 'manufacturing', label: 'Manufacturing Units', icon: <Factory />, path: '/manufacturing' },
  { id: 'packing', label: 'Packing Units', icon: <Package />, path: '/packing' },
  { id: 'users', label: 'Users and Roles', icon: <UserCog />, path: '/users' },
  { id: 'employees', label: 'Employees', icon: <UserCircle />, path: '/employees' },
  { id: 'timesheet', label: 'Timesheet', icon: <Clock />, path: '/timesheet' },
  { id: 'support', label: 'Support', icon: <LifeBuoy />, path: '/support' },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem('sidebar-scroll-pos');
    if (savedScroll && menuRef.current) {
      menuRef.current.scrollTop = Number(savedScroll);
    }
  }, []);

  const handleScroll = (e) => {
    sessionStorage.setItem('sidebar-scroll-pos', e.target.scrollTop);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  return (
    <aside className="sidebar">
      <div 
        className="sidebar-menu" 
        ref={menuRef} 
        onScroll={handleScroll}
      >
        {menuItems.map((item) => (
          <Link 
            key={item.id} 
            to={item.path} 
            className={`sidebar-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'active' : ''}`}
          >
            {React.cloneElement(item.icon, { size: 24, className: 'sidebar-icon' })}
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
      </div>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-logout-btn">
          <LogOut size={24} />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
