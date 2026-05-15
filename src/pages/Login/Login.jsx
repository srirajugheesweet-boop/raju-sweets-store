import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Mail, Lock, LogIn, Phone, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'phone'
  
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Successfully logged in!');
      navigate(from, { replace: true });
    } catch (error) {
      console.error(error);
      let message = 'Failed to log in. Please check your credentials.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = 'Invalid email or password.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = (e) => {
    e.preventDefault();
    toast.info('Mobile login will be available soon!');
  };

  return (
    <div className="login-container">
      <motion.div 
        className="login-card glass"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="login-logo-container">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏺</div>
          <h1 style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '4px', fontWeight: '800' }}>Raju Ghee Sweets</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', fontWeight: '500' }}>Authentic Traditional Flavors</p>
        </div>

        <h2 className="login-title">Welcome Back</h2>
        <p className="login-subtitle">Please enter your details to sign in</p>

        <div className="login-tabs">
          <button 
            className={`login-tab ${loginMethod === 'email' ? 'active' : ''}`}
            onClick={() => setLoginMethod('email')}
          >
            Email Login
          </button>
          <button 
            className={`login-tab ${loginMethod === 'phone' ? 'active' : ''}`}
            onClick={() => setLoginMethod('phone')}
          >
            Mobile OTP
          </button>
        </div>

        {loginMethod === 'email' ? (
          <form onSubmit={handleEmailLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="admin@rajusweets.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-button"
              disabled={loading}
            >
              {loading ? <div className="loader" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div> : <><LogIn size={18} /> Sign In</>}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePhoneLogin}>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <div className="input-wrapper">
                <Phone size={18} className="input-icon" />
                <input 
                  type="tel" 
                  className="form-input" 
                  placeholder="+91 00000 00000"
                  disabled
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-button"
              style={{ opacity: 0.6 }}
            >
              <ShieldCheck size={18} /> Get OTP (Coming Soon)
            </button>
          </form>
        )}

        <p className="otp-note">
          Having trouble? <span>Contact Administrator</span>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
