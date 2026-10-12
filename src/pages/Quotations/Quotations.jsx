import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Search,
  Scale,
  Minus,
  Trash2,
  X,
  ExternalLink,
  MessageCircle,
  Copy,
  Printer,
  Edit,
  ArrowLeft,
  CheckCircle2,
  ShoppingBag,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  Calendar,
  CloudUpload,
  RefreshCw,
  Eye
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { uploadQuotationImage, deleteQuotationImage } from '../../utils/cloudinary';
import { renderQuotationToImage, getQuotationHtml } from '../../utils/quotationTemplate';
import { openWhatsAppWithQuotation } from '../../utils/whatsapp';
import logo from '../../assets/logo.png';
import './Quotations.css';

const DEFAULT_ITEM_IMAGE = logo;

const Quotations = () => {
  // Page mode: 'list' | 'create' | 'edit'
  const [mode, setMode] = useState('list');
  const [quotations, setQuotations] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(true);

  // Search & Filtering in List Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCloudinary, setFilterCloudinary] = useState('all'); // 'all' | 'uploaded' | 'pending'

  // Add / Edit Quotation Form State
  const [editingId, setEditingId] = useState(null);
  const [editingPrevPublicId, setEditingPrevPublicId] = useState('');
  const [editingPrevUrl, setEditingPrevUrl] = useState('');

  const [toName, setToName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // Customer Autocomplete dropdown state
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  // Product catalog filtering in Builder
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Selected Items in Quotation (Cart)
  const [selectedItems, setSelectedItems] = useState([]);

  // Discount
  const [discountType, setDiscountType] = useState('amount'); // 'amount' | 'percent'
  const [discountValue, setDiscountValue] = useState('');

  // Saving & Uploading states
  const [savingQuotation, setSavingQuotation] = useState(false);
  const [uploadingToCloudinary, setUploadingToCloudinary] = useState(false);

  // Weight & Rupees Modal
  const [weightModalItem, setWeightModalItem] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });

  // Post-Save / View Quotation Modal
  const [savedModalData, setSavedModalData] = useState(null);

  // Preview Image Modal
  const [previewImageUrl, setPreviewImageUrl] = useState(null);

  // --------------------------------------------------------------------------
  // FIREBASE SUBSCRIPTIONS
  // --------------------------------------------------------------------------

  // 1. Fetch Quotations
  useEffect(() => {
    setLoadingQuotations(true);
    const q = query(collection(db, 'quotations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuotations(data);
      setLoadingQuotations(false);
    }, (err) => {
      console.error('Error fetching quotations:', err);
      setLoadingQuotations(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Items Catalog
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    }, (err) => {
      console.error('Error fetching items:', err);
    });
    return () => unsubscribe();
  }, []);

  // 3. Fetch Categories
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(data);
    }, (err) => {
      console.error('Error fetching categories:', err);
    });
    return () => unsubscribe();
  }, []);

  // 4. Fetch Customers for quick autocomplete
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('firstName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(data);
    }, (err) => {
      console.error('Error fetching customers:', err);
    });
    return () => unsubscribe();
  }, []);

  // --------------------------------------------------------------------------
  // CUSTOMER AUTOCOMPLETE
  // --------------------------------------------------------------------------
  const handleNameChange = (val) => {
    setToName(val);
    if (!val || val.trim().length < 2) {
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
      return;
    }
    const lower = val.toLowerCase();
    const matched = customers.filter(c => {
      const full = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      const phone = (c.mobileNumber || '').toLowerCase();
      const bName = (c.businessName || '').toLowerCase();
      return full.includes(lower) || phone.includes(lower) || bName.includes(lower);
    }).slice(0, 5);

    setCustomerSuggestions(matched);
    setShowCustomerSuggestions(matched.length > 0);
  };

  const handleSelectCustomer = (c) => {
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.name || '';
    setToName(fullName);
    setMobileNumber(c.mobileNumber || c.phone || '');
    setBusinessName(c.businessName || c.companyName || '');
    setEmail(c.email || '');
    setAddress(c.address || c.city || '');
    setShowCustomerSuggestions(false);
    toast.success(`Customer autofilled: ${fullName}`);
  };

  // --------------------------------------------------------------------------
  // WEIGHT CALCULATOR MODAL (Weight <-> Rupees)
  // --------------------------------------------------------------------------
  const openWeightModal = (item) => {
    const existing = selectedItems.find(i => i.id === item.id);
    const initialWeight = existing ? existing.quantity.toString() : '';
    const initialAmount = existing ? existing.total.toString() : '';

    setWeightModalItem(item);
    setWeightInput({
      weight: initialWeight,
      amount: initialAmount || (initialWeight ? (parseFloat(initialWeight) * item.price).toFixed(2) : '')
    });
  };

  const handleWeightChange = (type, val) => {
    if (!weightModalItem) return;
    const price = Number(weightModalItem.price || 0);

    if (type === 'weight') {
      const numericWt = parseFloat(val);
      const computedAmt = !isNaN(numericWt) && numericWt > 0 ? (numericWt * price).toFixed(2) : '';
      setWeightInput({
        weight: val,
        amount: computedAmt
      });
    } else {
      // User entered Rupees -> compute weight in kg
      const numericAmt = parseFloat(val);
      const computedWt = !isNaN(numericAmt) && numericAmt > 0 && price > 0 ? (numericAmt / price).toFixed(3) : '';
      setWeightInput({
        weight: computedWt,
        amount: val
      });
    }
  };

  const confirmWeightItem = () => {
    if (!weightModalItem) return;
    const wt = parseFloat(weightInput.weight);
    if (isNaN(wt) || wt <= 0) {
      toast.error('Please enter a valid weight or rupees amount');
      return;
    }

    const price = Number(weightModalItem.price || 0);
    const total = parseFloat((wt * price).toFixed(2));

    setSelectedItems(prev => {
      const idx = prev.findIndex(i => i.id === weightModalItem.id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: wt,
          total
        };
        return updated;
      } else {
        return [...prev, {
          id: weightModalItem.id,
          name: weightModalItem.name,
          price,
          unit: 'Weight',
          quantity: wt,
          total,
          image: weightModalItem.image || DEFAULT_ITEM_IMAGE
        }];
      }
    });

    setWeightModalItem(null);
    toast.success(`Added ${weightModalItem.name} (${wt} kg)`);
  };

  // --------------------------------------------------------------------------
  // QUANTITY ITEM CONTROLS (Piece items)
  // --------------------------------------------------------------------------
  const handleQuantityItemAdd = (item) => {
    const existing = selectedItems.find(i => i.id === item.id);
    if (existing) {
      updateQuantity(item.id, existing.quantity + 1);
    } else {
      const price = Number(item.price || 0);
      setSelectedItems(prev => [...prev, {
        id: item.id,
        name: item.name,
        price,
        unit: item.unit || 'Piece',
        quantity: 1,
        total: price,
        image: item.image || DEFAULT_ITEM_IMAGE
      }]);
      toast.success(`Added ${item.name}`);
    }
  };

  const updateQuantity = (itemId, newQty) => {
    const parsed = parseInt(newQty);
    if (isNaN(parsed) || parsed <= 0) {
      setSelectedItems(prev => prev.filter(i => i.id !== itemId));
      return;
    }
    setSelectedItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          quantity: parsed,
          total: parseFloat((parsed * i.price).toFixed(2))
        };
      }
      return i;
    }));
  };

  const updateWeightDirect = (itemId, newWeight) => {
    const parsed = parseFloat(newWeight);
    if (isNaN(parsed) || parsed <= 0) return;
    setSelectedItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          quantity: parsed,
          total: parseFloat((parsed * i.price).toFixed(2))
        };
      }
      return i;
    }));
  };

  const removeItem = (itemId) => {
    setSelectedItems(prev => prev.filter(i => i.id !== itemId));
  };

  // --------------------------------------------------------------------------
  // TOTALS CALCULATIONS
  // --------------------------------------------------------------------------
  const subtotal = selectedItems.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  const rawDiscount = parseFloat(discountValue) || 0;
  const discountAmount = discountType === 'percent'
    ? (subtotal * rawDiscount) / 100
    : rawDiscount;
  const grandTotal = Math.max(0, subtotal - discountAmount);

  // --------------------------------------------------------------------------
  // RESET / SWITCH MODE
  // --------------------------------------------------------------------------
  const resetBuilder = () => {
    setEditingId(null);
    setEditingPrevPublicId('');
    setEditingPrevUrl('');
    setToName('');
    setMobileNumber('');
    setBusinessName('');
    setEmail('');
    setAddress('');
    setSelectedItems([]);
    setDiscountValue('');
    setDiscountType('amount');
    setMode('list');
  };

  const startCreateQuotation = () => {
    resetBuilder();
    setMode('create');
  };

  const startEditQuotation = (quotation) => {
    setEditingId(quotation.id);
    setEditingPrevPublicId(quotation.cloudinaryPublicId || '');
    setEditingPrevUrl(quotation.cloudinaryUrl || '');
    setToName(quotation.toName || '');
    setMobileNumber(quotation.mobileNumber || '');
    setBusinessName(quotation.businessName || '');
    setEmail(quotation.email || '');
    setAddress(quotation.address || '');
    setSelectedItems(quotation.items || []);
    setDiscountType(quotation.discountType || 'amount');
    setDiscountValue(quotation.discountValue?.toString() || '');
    setMode('edit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --------------------------------------------------------------------------
  // SAVE / UPDATE QUOTATION
  // --------------------------------------------------------------------------
  const handleSaveQuotation = async () => {
    if (!toName.trim()) {
      toast.error('Please enter the customer / "To" name');
      return;
    }
    if (!mobileNumber.trim()) {
      toast.error('Please enter the customer mobile number');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Please select at least one product for the quotation');
      return;
    }

    setSavingQuotation(true);
    const isEdit = !!editingId;

    try {
      const quotationNo = isEdit
        ? quotations.find(q => q.id === editingId)?.quotationNo || `QT-${Date.now().toString().slice(-6)}`
        : `QT-${Date.now().toString().slice(-6)}`;

      const quotationDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      const quotationData = {
        quotationNo,
        quotationDate,
        toName: toName.trim(),
        mobileNumber: mobileNumber.trim(),
        businessName: businessName.trim(),
        email: email.trim(),
        address: address.trim(),
        items: selectedItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        updatedAt: serverTimestamp()
      };

      let currentDocId = editingId;
      let newCloudinaryUrl = editingPrevUrl;
      let newCloudinaryPublicId = editingPrevPublicId;

      // If Editing: User requested "if they edit the quitation then again need to upload again then delte the previous upload and save the new url"
      if (isEdit) {
        toast.loading('Regenerating quotation & updating Cloudinary...', { id: 'edit-toast' });

        // 1. Delete previous upload from Cloudinary if it existed
        if (editingPrevPublicId) {
          try {
            await deleteQuotationImage(editingPrevPublicId);
          } catch (delErr) {
            console.warn('Could not delete previous Cloudinary upload:', delErr);
          }
        }

        // 2. Render new quotation image
        const newImageDataUrl = await renderQuotationToImage({
          id: editingId,
          ...quotationData
        });

        // 3. Upload new image to Cloudinary
        const uploadRes = await uploadQuotationImage(newImageDataUrl, quotationNo);
        newCloudinaryUrl = uploadRes.secureUrl;
        newCloudinaryPublicId = uploadRes.publicId;

        // 4. Update Firestore doc
        quotationData.cloudinaryUrl = newCloudinaryUrl;
        quotationData.cloudinaryPublicId = newCloudinaryPublicId;

        await updateDoc(doc(db, 'quotations', editingId), quotationData);
        toast.success('Quotation updated and Cloudinary link replaced!', { id: 'edit-toast' });
      } else {
        // New Quotation
        quotationData.createdAt = serverTimestamp();
        quotationData.cloudinaryUrl = '';
        quotationData.cloudinaryPublicId = '';

        const docRef = await addDoc(collection(db, 'quotations'), quotationData);
        currentDocId = docRef.id;
        toast.success(`Quotation #${quotationNo} saved successfully!`);
      }

      // Prepare data for the Saved Modal
      const modalPayload = {
        id: currentDocId,
        ...quotationData,
        cloudinaryUrl: newCloudinaryUrl,
        cloudinaryPublicId: newCloudinaryPublicId
      };

      setSavedModalData(modalPayload);
      resetBuilder();
    } catch (err) {
      console.error('Error saving quotation:', err);
      toast.error(`Failed to save quotation: ${err.message}`);
    } finally {
      setSavingQuotation(false);
    }
  };

  // --------------------------------------------------------------------------
  // SEND WHATSAPP & UPLOAD TO CLOUDINARY
  // --------------------------------------------------------------------------
  const handleSendWhatsApp = async (quotation) => {
    if (!quotation) return;

    setUploadingToCloudinary(true);
    const toastId = toast.loading('Uploading quotation to Cloudinary & opening WhatsApp...');

    try {
      let finalCloudinaryUrl = quotation.cloudinaryUrl;
      let finalPublicId = quotation.cloudinaryPublicId;

      // If not yet uploaded to Cloudinary, render and upload now!
      if (!finalCloudinaryUrl) {
        console.log('Rendering high-res quotation image...');
        const imageDataUrl = await renderQuotationToImage(quotation);

        console.log('Uploading quotation to Cloudinary...');
        const uploadRes = await uploadQuotationImage(imageDataUrl, quotation.quotationNo || quotation.id);

        finalCloudinaryUrl = uploadRes.secureUrl;
        finalPublicId = uploadRes.publicId;

        // Update in Firestore
        await updateDoc(doc(db, 'quotations', quotation.id), {
          cloudinaryUrl: finalCloudinaryUrl,
          cloudinaryPublicId: finalPublicId,
          updatedAt: serverTimestamp()
        });

        // Update state in modal if active
        if (savedModalData && savedModalData.id === quotation.id) {
          setSavedModalData(prev => ({
            ...prev,
            cloudinaryUrl: finalCloudinaryUrl,
            cloudinaryPublicId: finalPublicId
          }));
        }
      }

      // Open WhatsApp with prefilled template & Cloudinary link
      openWhatsAppWithQuotation({
        quotation,
        cloudinaryUrl: finalCloudinaryUrl
      });

      toast.success('Quotation uploaded to Cloudinary and WhatsApp opened!', { id: toastId });
    } catch (err) {
      console.error('WhatsApp / Cloudinary upload failed:', err);
      toast.error(`Cloudinary upload failed: ${err.message}`, { id: toastId });

      // Fallback: still open WhatsApp even if Cloudinary encountered an issue
      openWhatsAppWithQuotation({
        quotation,
        cloudinaryUrl: ''
      });
    } finally {
      setUploadingToCloudinary(false);
    }
  };

  // --------------------------------------------------------------------------
  // DELETE QUOTATION
  // --------------------------------------------------------------------------
  const handleDeleteQuotation = async (quotation) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete quotation #${quotation.quotationNo || quotation.id}? This will also delete any uploaded image on Cloudinary.`);
    if (!confirmDelete) return;

    const toastId = toast.loading('Deleting quotation...');
    try {
      if (quotation.cloudinaryPublicId) {
        try {
          await deleteQuotationImage(quotation.cloudinaryPublicId);
        } catch (delErr) {
          console.warn('Cloudinary delete warning:', delErr);
        }
      }
      await deleteDoc(doc(db, 'quotations', quotation.id));
      toast.success('Quotation deleted successfully', { id: toastId });
    } catch (err) {
      console.error('Error deleting quotation:', err);
      toast.error(`Delete failed: ${err.message}`, { id: toastId });
    }
  };

  // --------------------------------------------------------------------------
  // PRINT QUOTATION
  // --------------------------------------------------------------------------
  const handlePrintQuotation = (quotation) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print quotation');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quotation #${quotation.quotationNo || quotation.id} - Raju Ghee Sweets</title>
          <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body { margin: 20px; font-family: 'Sora', sans-serif; }
            @media print {
              body { margin: 0; }
              @page { size: portrait; margin: 10mm; }
            }
          </style>
        </head>
        <body>
          ${getQuotationHtml(quotation)}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // --------------------------------------------------------------------------
  // FILTERED LIST
  // --------------------------------------------------------------------------
  const filteredQuotations = quotations.filter(q => {
    const qNo = (q.quotationNo || '').toLowerCase();
    const name = (q.toName || '').toLowerCase();
    const bName = (q.businessName || '').toLowerCase();
    const phone = (q.mobileNumber || '').toLowerCase();
    const term = searchQuery.toLowerCase();

    const matchesSearch = !term || qNo.includes(term) || name.includes(term) || bName.includes(term) || phone.includes(term);

    if (filterCloudinary === 'uploaded') return matchesSearch && !!q.cloudinaryUrl;
    if (filterCloudinary === 'pending') return matchesSearch && !q.cloudinaryUrl;
    return matchesSearch;
  });

  // Filtered Products Catalog
  const filteredCatalogItems = items.filter(it => {
    const matchesCat = selectedCategory === 'all' || it.categoryId === selectedCategory;
    const matchesSearch = !catalogSearch ||
      (it.name || '').toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (it.barcode || '').includes(catalogSearch);
    return matchesCat && matchesSearch;
  });

  // Stats
  const totalQuotationsCount = quotations.length;
  const totalQuotationsValue = quotations.reduce((acc, q) => acc + (Number(q.grandTotal) || 0), 0);
  const uploadedCount = quotations.filter(q => !!q.cloudinaryUrl).length;

  return (
    <div className="quotations-container">

      {/* ====================================================================
          MODE: LIST VIEW
          ==================================================================== */}
      {mode === 'list' && (
        <>
          {/* Header */}
          <div className="quotations-header">
            <div className="quotations-title-group">
              <h1>
                <FileText size={26} color="var(--accent-color)" />
                Quotations & Estimates
              </h1>
              <p>Create branded quotations, upload to Cloudinary, and share instantly via WhatsApp</p>
            </div>
            <div className="quotations-header-actions">
              <button
                className="btn-primary-action"
                onClick={startCreateQuotation}
              >
                <Plus size={18} />
                Create New Quotation
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="quotations-stats-row">
            <div className="quotations-stat-card">
              <div className="stat-icon-wrapper" style={{ background: '#e6f4ea', color: '#0A2A1B' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <h3 className="stat-value">{totalQuotationsCount}</h3>
                <p className="stat-label">Total Quotations</p>
              </div>
            </div>

            <div className="quotations-stat-card">
              <div className="stat-icon-wrapper" style={{ background: '#fef3c7', color: '#b45309' }}>
                <Sparkles size={22} />
              </div>
              <div className="stat-info">
                <h3 className="stat-value">₹{totalQuotationsValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
                <p className="stat-label">Estimated Value</p>
              </div>
            </div>

            <div className="quotations-stat-card">
              <div className="stat-icon-wrapper" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                <CloudUpload size={22} />
              </div>
              <div className="stat-info">
                <h3 className="stat-value">{uploadedCount}</h3>
                <p className="stat-label">Cloudinary Hosted</p>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="quotations-filter-bar">
            <div className="filter-search-box">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search by quote #, client, phone, business..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className={`qt-category-pill ${filterCloudinary === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCloudinary('all')}
              >
                All ({quotations.length})
              </button>
              <button
                className={`qt-category-pill ${filterCloudinary === 'uploaded' ? 'active' : ''}`}
                onClick={() => setFilterCloudinary('uploaded')}
              >
                ☁️ On Cloudinary ({uploadedCount})
              </button>
              <button
                className={`qt-category-pill ${filterCloudinary === 'pending' ? 'active' : ''}`}
                onClick={() => setFilterCloudinary('pending')}
              >
                Pending Upload ({totalQuotationsCount - uploadedCount})
              </button>
            </div>
          </div>

          {/* Quotations Table */}
          <div className="quotations-table-card">
            {loadingQuotations ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ marginTop: '10px' }}>Loading quotations...</p>
              </div>
            ) : filteredQuotations.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                <FileText size={42} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 6px', color: '#1e293b' }}>No quotations found</h3>
                <p style={{ margin: '0 0 16px', fontSize: '13px' }}>Click below to create your first quotation.</p>
                <button className="btn-primary-action" onClick={startCreateQuotation}>
                  <Plus size={16} /> Create Quotation
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="quotations-table">
                  <thead>
                    <tr>
                      <th>Ref #</th>
                      <th>Date</th>
                      <th>Client / Business</th>
                      <th>Mobile</th>
                      <th>Items</th>
                      <th>Amount</th>
                      <th>Cloudinary Link</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotations.map((q) => (
                      <tr key={q.id}>
                        <td>
                          <span className="qt-number-pill">
                            #{q.quotationNo || q.id.slice(0, 8)}
                          </span>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12.5px' }}>
                          {q.quotationDate || '-'}
                        </td>
                        <td>
                          <div className="qt-client-info">
                            <span className="qt-client-name">{q.toName}</span>
                            {q.businessName && (
                              <span className="qt-client-business">🏢 {q.businessName}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="qt-client-phone">📞 {q.mobileNumber}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                            {q.items?.length || 0} items
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: '700', color: '#0A2A1B', fontSize: '14px' }}>
                            ₹{Number(q.grandTotal || 0).toFixed(2)}
                          </span>
                        </td>
                        <td>
                          {q.cloudinaryUrl ? (
                            <a
                              href={q.cloudinaryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="qt-cloudinary-badge"
                              title="Click to open full hosted quotation image"
                            >
                              <ExternalLink size={12} />
                              View Cloudinary
                            </a>
                          ) : (
                            <span className="qt-cloudinary-badge not-uploaded" title="Will upload on clicking Send WhatsApp">
                              Ready to upload
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="qt-actions-cell" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="qt-action-btn whatsapp-btn"
                              title="Send Quotation via WhatsApp"
                              onClick={() => handleSendWhatsApp(q)}
                            >
                              <MessageCircle size={15} />
                            </button>
                            <button
                              className="qt-action-btn"
                              title="Preview Quotation"
                              onClick={() => setSavedModalData(q)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="qt-action-btn"
                              title="Print Quotation"
                              onClick={() => handlePrintQuotation(q)}
                            >
                              <Printer size={15} />
                            </button>
                            <button
                              className="qt-action-btn edit-btn"
                              title="Edit Quotation (will replace Cloudinary upload)"
                              onClick={() => startEditQuotation(q)}
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              className="qt-action-btn delete-btn"
                              title="Delete Quotation"
                              onClick={() => handleDeleteQuotation(q)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ====================================================================
          MODE: ADD / EDIT QUOTATION BUILDER
          ==================================================================== */}
      {(mode === 'create' || mode === 'edit') && (
        <div className="qt-builder-container">
          
          {/* Builder Top Bar */}
          <div className="quotations-header">
            <div className="quotations-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn-secondary-action" onClick={resetBuilder}>
                  <ArrowLeft size={16} /> Back to List
                </button>
                <h1>
                  {mode === 'edit' ? `Edit Quotation #${quotations.find(q => q.id === editingId)?.quotationNo || ''}` : 'Add New Quotation'}
                </h1>
              </div>
              <p>Enter customer details, select products (weight or pieces), configure discount, and save to share.</p>
            </div>
          </div>

          {/* 1. Customer Details Card */}
          <div className="qt-client-card">
            <div className="qt-card-title">
              <User size={18} color="var(--accent-color)" />
              Customer & Business Information
            </div>

            <div className="qt-client-grid">
              {/* To Name with Autocomplete */}
              <div className="qt-field-group">
                <label>To Name <span>*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={toName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => {
                    if (customerSuggestions.length > 0) setShowCustomerSuggestions(true);
                  }}
                  autoFocus
                />
                {showCustomerSuggestions && customerSuggestions.length > 0 && (
                  <ul className="customer-autocomplete-list">
                    {customerSuggestions.map((c) => (
                      <li
                        key={c.id}
                        className="customer-autocomplete-item"
                        onClick={() => handleSelectCustomer(c)}
                      >
                        <span className="cust-main">{c.firstName} {c.lastName}</span>
                        <span className="cust-sub">📞 {c.mobileNumber} {c.businessName ? `• 🏢 ${c.businessName}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Mobile Number */}
              <div className="qt-field-group">
                <label>Mobile Number (for WhatsApp) <span>*</span></label>
                <input
                  type="tel"
                  placeholder="e.g. 9848012345"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                />
              </div>

              {/* Business Name */}
              <div className="qt-field-group">
                <label>Business / Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sri Srinivasa Sweets & Bakers"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>

              {/* Email Address */}
              <div className="qt-field-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. contact@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="qt-field-group" style={{ gridColumn: 'span 2' }}>
                <label>Address / City</label>
                <input
                  type="text"
                  placeholder="e.g. Shop #4, Main Road, Vijayawada"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 2. Products Catalog & Live Summary Split View */}
          <div className="qt-workspace-split">

            {/* Left: Product Catalog Selection */}
            <div className="qt-catalog-card">
              <div className="qt-catalog-toolbar">
                <div className="qt-catalog-search-row">
                  <div className="filter-search-box" style={{ width: '100%' }}>
                    <Search size={16} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="Search items by name or barcode..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* Category Pills */}
                <div className="qt-category-pills">
                  <button
                    className={`qt-category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('all')}
                  >
                    All Products ({items.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      className={`qt-category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              <div className="qt-products-grid">
                {filteredCatalogItems.map((item) => {
                  const inCart = selectedItems.find(i => i.id === item.id);
                  const isWeight = item.unit === 'Weight';

                  return (
                    <div
                      key={item.id}
                      className={`qt-product-card ${inCart ? 'selected-in-cart' : ''}`}
                    >
                      <div className="qt-card-thumb-wrap">
                        <img
                          src={item.image || DEFAULT_ITEM_IMAGE}
                          alt={item.name}
                          onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                        />
                      </div>

                      <h4 className="qt-product-title" title={item.name}>
                        {item.name}
                      </h4>

                      <div className="qt-price-badge-row">
                        <span className="qt-price-label">₹{item.price}</span>
                        <span className={`qt-unit-pill ${isWeight ? 'weight' : ''}`}>
                          {isWeight ? 'per kg' : 'per pc'}
                        </span>
                      </div>

                      {/* Product Action */}
                      {isWeight ? (
                        <button
                          type="button"
                          className="qt-btn-add-item qt-btn-weight-select"
                          onClick={() => openWeightModal(item)}
                        >
                          <Scale size={14} />
                          {inCart ? `${inCart.quantity} kg (Edit)` : 'Select Weight'}
                        </button>
                      ) : (
                        inCart ? (
                          <div className="qt-qty-counter">
                            <button
                              type="button"
                              className="qt-counter-btn"
                              onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              className="qt-counter-input"
                              min="1"
                              value={inCart.quantity}
                              onChange={(e) => updateQuantity(item.id, e.target.value)}
                            />
                            <button
                              type="button"
                              className="qt-counter-btn"
                              onClick={() => updateQuantity(item.id, inCart.quantity + 1)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="qt-btn-add-item"
                            onClick={() => handleQuantityItemAdd(item)}
                          >
                            <Plus size={14} /> Add Product
                          </button>
                        )
                      )}
                    </div>
                  );
                })}

                {filteredCatalogItems.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No products matching your search.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Selected Items Summary & Financials */}
            <div className="qt-summary-card">
              <div className="qt-summary-header">
                <h3 className="qt-summary-title">
                  <ShoppingBag size={18} color="var(--accent-color)" />
                  Quotation Summary ({selectedItems.length})
                </h3>
                {selectedItems.length > 0 && (
                  <button
                    type="button"
                    className="qt-summary-clear-btn"
                    onClick={() => setSelectedItems([])}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Items List */}
              <div className="qt-summary-items-list">
                {selectedItems.map((item) => (
                  <div key={item.id} className="qt-summary-item-row">
                    <div className="qt-item-info">
                      <div className="qt-item-name" title={item.name}>
                        {item.name}
                      </div>
                      <div className="qt-item-rate">
                        ₹{item.price} / {item.unit === 'Weight' ? 'kg' : 'pc'}
                      </div>
                    </div>

                    <div className="qt-item-controls">
                      {item.unit === 'Weight' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => openWeightModal(item)}
                            title="Open Weight & Rupees Calculator"
                            style={{ background: '#fef3c7', border: '1px solid #fde047', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', color: '#854d0e' }}
                          >
                            <Scale size={12} />
                          </button>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={item.quantity}
                            onChange={(e) => updateWeightDirect(item.id, e.target.value)}
                            style={{ width: '56px', height: '26px', fontSize: '11px', fontWeight: '700', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          />
                          <span style={{ fontSize: '11px', color: '#64748b' }}>kg</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            style={{ width: '22px', height: '22px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                            style={{ width: '38px', height: '22px', fontSize: '11px', fontWeight: '700', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            style={{ width: '22px', height: '22px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="qt-item-row-total">
                      ₹{item.total?.toFixed(2)}
                    </div>

                    <button
                      type="button"
                      className="qt-item-remove-btn"
                      onClick={() => removeItem(item.id)}
                      title="Remove Item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {selectedItems.length === 0 && (
                  <div className="qt-empty-cart">
                    <ShoppingBag size={34} color="#cbd5e1" />
                    <p>No items added to quotation yet.</p>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Click on products from the catalog to add them.
                    </span>
                  </div>
                )}
              </div>

              {/* Discount Box */}
              <div className="qt-discount-box">
                <div className="qt-discount-header">
                  <span className="qt-discount-label">Discount</span>
                  <div className="qt-discount-type-toggle">
                    <button
                      type="button"
                      className={`qt-discount-type-btn ${discountType === 'percent' ? 'active' : ''}`}
                      onClick={() => setDiscountType('percent')}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={`qt-discount-type-btn ${discountType === 'amount' ? 'active' : ''}`}
                      onClick={() => setDiscountType('amount')}
                    >
                      ₹
                    </button>
                  </div>
                </div>

                <div className="qt-discount-input-row">
                  <input
                    type="number"
                    placeholder={discountType === 'percent' ? 'e.g. 5%' : 'e.g. 100'}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                  {discountAmount > 0 && (
                    <span className="qt-discount-amt-preview">
                      - ₹{discountAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="qt-financial-totals">
                <div className="qt-total-line">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="qt-total-line" style={{ color: '#16a34a' }}>
                    <span>Discount:</span>
                    <span>- ₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="qt-total-line grand">
                  <span>Estimated Total:</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Save Button */}
              <button
                type="button"
                className="qt-save-btn"
                onClick={handleSaveQuotation}
                disabled={savingQuotation || selectedItems.length === 0}
              >
                {savingQuotation ? (
                  <>
                    <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    Saving Quotation...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    {mode === 'edit' ? 'Update & Replace Quotation' : 'Save Quotation'}
                  </>
                )}
              </button>

            </div>

          </div>
        </div>
      )}

      {/* ====================================================================
          WEIGHT & RUPEES CALCULATOR MODAL
          ==================================================================== */}
      {weightModalItem && (
        <div className="qt-modal-overlay">
          <div className="qt-modal-card">
            <div className="qt-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scale size={20} />
                </div>
                <div>
                  <h3>{weightModalItem.name}</h3>
                  <p>Rate: ₹{weightModalItem.price} / kg</p>
                </div>
              </div>
              <button className="qt-modal-close-btn" onClick={() => setWeightModalItem(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Quick Weight Chips */}
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Quick Presets:
              </span>
              <div className="qt-weight-presets-grid">
                {[
                  { label: '100g', val: '0.100' },
                  { label: '250g', val: '0.250' },
                  { label: '500g', val: '0.500' },
                  { label: '750g', val: '0.750' },
                  { label: '1 kg', val: '1.000' },
                  { label: '2 kg', val: '2.000' },
                  { label: '5 kg', val: '5.000' }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="qt-weight-preset-chip"
                    onClick={() => handleWeightChange('weight', preset.val)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs: Weight & Rupees */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '14px 0 20px' }}>
              <div className="qt-field-group">
                <label>Weight (in kg)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="e.g. 0.500 for 500 grams"
                  value={weightInput.weight}
                  onChange={(e) => handleWeightChange('weight', e.target.value)}
                  autoFocus
                />
              </div>

              <div className="qt-field-group">
                <label>Total in Rupees (₹)</label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 250 (calculates weight automatically)"
                  value={weightInput.amount}
                  onChange={(e) => handleWeightChange('amount', e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary-action"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setWeightModalItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-action"
                style={{ flex: 1.5, justifyContent: 'center' }}
                onClick={confirmWeightItem}
              >
                Confirm & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          POST-SAVE / PREVIEW QUOTATION MODAL (WhatsApp sharing)
          ==================================================================== */}
      {savedModalData && (
        <div className="qt-modal-overlay">
          <div className="qt-modal-card" style={{ maxWidth: '520px' }}>
            <div className="qt-modal-header">
              <div>
                <h3>Quotation #{savedModalData.quotationNo || savedModalData.id}</h3>
                <p>Saved on {savedModalData.quotationDate || 'today'}</p>
              </div>
              <button className="qt-modal-close-btn" onClick={() => setSavedModalData(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Success Banner */}
            <div className="qt-saved-banner">
              <CheckCircle2 size={24} className="icon-check" />
              <div>
                <h4>Quotation Ready to Share!</h4>
                <p>Click below to upload to Cloudinary and send directly to customer via WhatsApp.</p>
              </div>
            </div>

            {/* Quotation Details Summary */}
            <div className="qt-saved-details-card">
              <div className="qt-detail-row">
                <span>Client:</span>
                <strong>{savedModalData.toName}</strong>
              </div>
              {savedModalData.businessName && (
                <div className="qt-detail-row">
                  <span>Business:</span>
                  <strong>{savedModalData.businessName}</strong>
                </div>
              )}
              <div className="qt-detail-row">
                <span>Mobile:</span>
                <strong>{savedModalData.mobileNumber}</strong>
              </div>
              <div className="qt-detail-row">
                <span>Items:</span>
                <span>{savedModalData.items?.length || 0} product(s)</span>
              </div>
              <div className="qt-detail-row" style={{ fontSize: '15px', borderTop: '1px solid #e2e8f0', paddingTop: '6px', color: '#0A2A1B' }}>
                <span>Total Amount:</span>
                <strong>₹{Number(savedModalData.grandTotal || 0).toFixed(2)}</strong>
              </div>
              {savedModalData.cloudinaryUrl && (
                <div className="qt-detail-row" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', alignItems: 'center' }}>
                  <span>Cloudinary URL:</span>
                  <a
                    href={savedModalData.cloudinaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: '600', textDecoration: 'underline' }}
                  >
                    Open Image ↗
                  </a>
                </div>
              )}
            </div>

            {/* SEND WHATSAPP PRIMARY CTA */}
            <button
              type="button"
              className="qt-whatsapp-cta-btn"
              onClick={() => handleSendWhatsApp(savedModalData)}
              disabled={uploadingToCloudinary}
            >
              {uploadingToCloudinary ? (
                <>
                  <RefreshCw size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                  Uploading to Cloudinary...
                </>
              ) : (
                <>
                  <MessageCircle size={20} />
                  Send via WhatsApp
                </>
              )}
            </button>

            {/* Secondary actions: Print, Copy Link, Close */}
            <div className="qt-modal-secondary-actions">
              <button
                type="button"
                className="qt-modal-btn"
                onClick={() => handlePrintQuotation(savedModalData)}
              >
                <Printer size={15} /> Print / PDF
              </button>

              {savedModalData.cloudinaryUrl && (
                <button
                  type="button"
                  className="qt-modal-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(savedModalData.cloudinaryUrl);
                    toast.success('Cloudinary link copied to clipboard!');
                  }}
                >
                  <Copy size={15} /> Copy Link
                </button>
              )}

              <button
                type="button"
                className="qt-modal-btn"
                onClick={() => setSavedModalData(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Quotations;
