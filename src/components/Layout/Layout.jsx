import React from 'react';
import Header from '../Header/Header';
import Footer from '../Footer/Footer';
import './Layout.css';

const Layout = ({ children }) => {
  return (
    <div className="layout-wrapper">
      <Header />
      <main className="main-content">
        {children}
      </main>
      {/* <Footer /> */}
    </div>
  );
};

export default Layout;
