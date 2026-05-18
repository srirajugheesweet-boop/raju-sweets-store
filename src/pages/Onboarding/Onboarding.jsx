import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Factory, Package, LogOut } from 'lucide-react';
import { auth, db } from '../../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import './Onboarding.css';

const Onboarding = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAccess = async () => {
      // In a real scenario, after OTP we get auth.currentUser.phoneNumber
      // Or we store a flag in local storage. Let's just use localStorage for user role mocking for now
      const phone = localStorage.getItem('userPhone') || auth.currentUser?.phoneNumber;
      
      try {
        let userProfile = null;
        if (auth.currentUser?.email === 'admin@rajusweets.com') {
           userProfile = {
             name: "Super Admin",
             role: 'admin',
             access: {
               stores: ['all'],
               mUnits: ['all'],
               pUnits: ['all']
             }
           };
        } else if (phone) {
           const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;
           
           // Check for both formats since the DB might store it without +91
           const q = query(collection(db, 'users'), where('mobileNumber', 'in', [phone, normalizedPhone]));
           const snap = await getDocs(q);
           if (!snap.empty) {
             userProfile = { id: snap.docs[0].id, ...snap.docs[0].data() };
           }
        }
        
        if (userProfile) {
          const [sSnap, mSnap, pSnap] = await Promise.all([
            getDocs(collection(db, 'stores')),
            getDocs(collection(db, 'manufacturing_units')),
            getDocs(collection(db, 'packing_units'))
          ]);
          
          const storesMap = sSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          const mUnitsMap = mSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          const pUnitsMap = pSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          
          setUserData({ profile: userProfile, storesMap, mUnitsMap, pUnitsMap });
        } else {
          toast.error("No access found for this account");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAccess();
  }, []);

  if (loading) return <div className="onb-loader"><div className="loader"></div></div>;

  if (!userData) {
    return (
      <div className="onb-container">
        <h2>No Access Configurations Found</h2>
        <button className="onb-logout" onClick={() => signOut(auth).then(() => navigate('/login'))}>Logout</button>
      </div>
    );
  }

  const { profile, storesMap, mUnitsMap, pUnitsMap } = userData;

  const getStoreName = (id) => storesMap.find(s => s.id === id)?.name || id;
  const getMUnitName = (id) => mUnitsMap.find(s => s.id === id)?.name || id;
  const getPUnitName = (id) => pUnitsMap.find(s => s.id === id)?.name || id;

  const stores = profile.access?.stores || [];
  const mUnits = profile.access?.mUnits || [];
  const pUnits = profile.access?.pUnits || [];

  return (
    <div className="onb-container">
      <div className="onb-header">
        <div>
          <h1>Welcome, {profile.name}</h1>
          <p>Select a portal to continue</p>
        </div>
        <button className="onb-logout" onClick={() => signOut(auth).then(() => { localStorage.removeItem('userPhone'); navigate('/login'); })}>
          <LogOut size={16} /> Logout
        </button>
      </div>

      <div className="onb-grid">
        {stores.map(storeId => (
          <motion.div 
            key={`store-${storeId}`} 
            className="onb-card store" 
            onClick={() => navigate(`/store-portal/${storeId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Store size={32} /></div>
            <h3>{storeId === 'all' ? 'All Stores' : getStoreName(storeId)}</h3>
            <p>Store Portal</p>
          </motion.div>
        ))}

        {mUnits.map(unitId => (
          <motion.div 
            key={`munit-${unitId}`} 
            className="onb-card munit" 
            onClick={() => navigate(`/munit-portal/${unitId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Factory size={32} /></div>
            <h3>{unitId === 'all' ? 'All Manufacturing' : getMUnitName(unitId)}</h3>
            <p>Manufacturing Portal</p>
          </motion.div>
        ))}

        {pUnits.map(unitId => (
          <motion.div 
            key={`punit-${unitId}`} 
            className="onb-card punit" 
            onClick={() => navigate(`/punit-portal/${unitId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Package size={32} /></div>
            <h3>{unitId === 'all' ? 'All Packing' : getPUnitName(unitId)}</h3>
            <p>Packing Portal</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Onboarding;
