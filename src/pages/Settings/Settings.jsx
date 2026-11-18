import React, { useState, useEffect, useRef } from 'react';
import {
  Settings as SettingsIcon,
  FileText,
  Upload,
  Image as ImageIcon,
  PenTool,
  Save,
  Trash2,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadToImageKit } from '../../config/imagekit';
import {
  fetchInvoiceSettings,
  saveInvoiceSettings
} from '../../utils/invoiceSettings';
import defaultLogo from '../../assets/logo.png';
import './Settings.css';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const Settings = () => {
  const [activeTab, setActiveTab] = useState('invoice');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Saved ImageKit URLs from Firestore
  const [savedLogoUrl, setSavedLogoUrl] = useState('');
  const [savedSignatureUrl, setSavedSignatureUrl] = useState('');

  // Pending selections / edits
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoRemoved, setLogoRemoved] = useState(false);

  const [signatureFile, setSignatureFile] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [signatureRemoved, setSignatureRemoved] = useState(false);

  const logoInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  // Load saved invoice settings from Firestore on mount
  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      setLoading(true);
      try {
        const data = await fetchInvoiceSettings();
        if (mounted) {
          setSavedLogoUrl(data.logoUrl || '');
          setSavedSignatureUrl(data.signatureUrl || '');
          setLogoPreview(data.logoUrl || '');
          setSignaturePreview(data.signatureUrl || '');
        }
      } catch (err) {
        console.error('Failed to load invoice settings:', err);
        toast.error('Failed to load saved invoice settings');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  // Revoke object URLs on unmount or change
  useEffect(() => {
    return () => {
      if (logoPreview && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  useEffect(() => {
    return () => {
      if (signaturePreview && signaturePreview.startsWith('blob:')) {
        URL.revokeObjectURL(signaturePreview);
      }
    };
  }, [signaturePreview]);

  const validateImageFile = (file) => {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WEBP, SVG).');
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('Image size must be under 10MB.');
      return false;
    }
    return true;
  };

  const handleChooseLogo = (e) => {
    const file = e.target.files?.[0];
    if (!validateImageFile(file)) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoRemoved(false);
    e.target.value = '';
  };

  const handleChooseSignature = (e) => {
    const file = e.target.files?.[0];
    if (!validateImageFile(file)) return;
    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
    setSignatureRemoved(false);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    setLogoRemoved(true);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleRemoveSignature = () => {
    setSignatureFile(null);
    setSignaturePreview('');
    setSignatureRemoved(true);
    if (signatureInputRef.current) signatureInputRef.current.value = '';
  };

  const handleResetChanges = () => {
    setLogoFile(null);
    setLogoPreview(savedLogoUrl);
    setLogoRemoved(false);

    setSignatureFile(null);
    setSignaturePreview(savedSignatureUrl);
    setSignatureRemoved(false);
  };

  const hasUnsavedChanges =
    Boolean(logoFile) ||
    Boolean(signatureFile) ||
    (logoRemoved && Boolean(savedLogoUrl)) ||
    (signatureRemoved && Boolean(savedSignatureUrl));

  const handleSaveSettings = async () => {
    setSaving(true);
    const toastId = toast.loading(
      logoFile || signatureFile
        ? 'Uploading images to ImageKit & saving settings...'
        : 'Saving invoice settings...'
    );

    try {
      let finalLogoUrl = logoRemoved ? '' : savedLogoUrl;
      let finalSignatureUrl = signatureRemoved ? '' : savedSignatureUrl;

      if (logoFile) {
        finalLogoUrl = await uploadToImageKit(logoFile, '/invoice-settings');
      }

      if (signatureFile) {
        finalSignatureUrl = await uploadToImageKit(signatureFile, '/invoice-settings');
      }

      await saveInvoiceSettings({
        logoUrl: finalLogoUrl,
        signatureUrl: finalSignatureUrl
      });

      setSavedLogoUrl(finalLogoUrl);
      setSavedSignatureUrl(finalSignatureUrl);
      setLogoPreview(finalLogoUrl);
      setSignaturePreview(finalSignatureUrl);
      setLogoFile(null);
      setSignatureFile(null);
      setLogoRemoved(false);
      setSignatureRemoved(false);

      toast.success('Invoice settings saved! All invoices will now use these images.', {
        id: toastId
      });
    } catch (err) {
      console.error('Error saving invoice settings:', err);
      toast.error(`Failed to save settings: ${err.message || 'Upload error'}`, {
        id: toastId
      });
    } finally {
      setSaving(false);
    }
  };

  const activePreviewLogo = logoPreview || (!logoRemoved ? savedLogoUrl : '') || defaultLogo;
  const activePreviewSignature = signaturePreview || (!signatureRemoved ? savedSignatureUrl : '');

  return (
    <div className="settings-page-container">
      {/* Page Header */}
      <div className="settings-header-bar">
        <div className="settings-title-group">
          <div className="settings-title-icon">
            <SettingsIcon size={22} />
          </div>
          <div>
            <h1 className="settings-page-title">Settings</h1>
            <p className="settings-page-subtitle">
              Manage application configuration and branding assets used across all invoices
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="settings-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invoice'}
          className={`settings-tab-btn ${activeTab === 'invoice' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoice')}
        >
          <FileText size={16} />
          <span>Invoice Settings</span>
        </button>
      </div>

      {/* Invoice Settings Tab Content */}
      {activeTab === 'invoice' && (
        <div className="settings-section-card">
          <div className="settings-card-header">
            <div>
              <h2>Invoice Branding Assets</h2>
              <p>
                Upload your company Logo and Authorized Signatory Signature. Images are uploaded to ImageKit and automatically applied to all A4, GST, Order, B2B, and Quotation invoices.
              </p>
            </div>
          </div>

          <div className="settings-card-body">
            {loading ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                <Loader2 size={26} className="settings-spin" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontSize: '13px', fontWeight: '600' }}>Loading saved invoice settings...</div>
              </div>
            ) : (
              <>
                <div className="settings-upload-grid">
                  {/* Card 1: Invoice Logo */}
                  <div className="settings-asset-card">
                    <div className="settings-asset-head">
                      <div>
                        <h3 className="settings-asset-title">
                          <ImageIcon size={16} />
                          Invoice Logo
                        </h3>
                        <p className="settings-asset-desc">
                          Displayed at the top-left header of every invoice. Recommended: transparent PNG or high-res JPG.
                        </p>
                      </div>
                      {logoFile ? (
                        <span className="settings-status-pill pending">Unsaved</span>
                      ) : logoRemoved && savedLogoUrl ? (
                        <span className="settings-status-pill pending">Will Remove</span>
                      ) : savedLogoUrl ? (
                        <span className="settings-status-pill saved">
                          <CheckCircle2 size={11} /> Saved
                        </span>
                      ) : (
                        <span className="settings-status-pill empty">Default Logo</span>
                      )}
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleChooseLogo}
                    />

                    <div
                      className="settings-preview-box"
                      onClick={() => logoInputRef.current?.click()}
                      title="Click to choose a logo image"
                    >
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="Invoice Logo Preview"
                          className="settings-preview-img"
                        />
                      ) : (
                        <div className="settings-empty-placeholder">
                          <Upload size={26} color="#94a3b8" />
                          <span>Click to choose Logo image</span>
                          <small>PNG, JPG, WEBP up to 10MB</small>
                        </div>
                      )}
                    </div>

                    <div className="settings-asset-actions">
                      <button
                        type="button"
                        className="polaris-btn polaris-btn-secondary"
                        style={{ height: '34px', fontSize: '12px', flex: 1, justifyContent: 'center' }}
                        onClick={() => logoInputRef.current?.click()}
                        disabled={saving}
                      >
                        <Upload size={14} /> {logoPreview ? 'Change Logo' : 'Choose Logo'}
                      </button>

                      {logoPreview && (
                        <button
                          type="button"
                          className="polaris-btn polaris-btn-secondary"
                          style={{ height: '34px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                          onClick={handleRemoveLogo}
                          disabled={saving}
                          title="Remove custom logo (reverts to default)"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>

                    {savedLogoUrl && !logoFile && !logoRemoved && (
                      <div className="settings-url-box">
                        <span className="settings-url-text" title={savedLogoUrl}>
                          {savedLogoUrl}
                        </span>
                        <a
                          href={savedLogoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-url-link"
                        >
                          Open <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Authorized Signature */}
                  <div className="settings-asset-card">
                    <div className="settings-asset-head">
                      <div>
                        <h3 className="settings-asset-title">
                          <PenTool size={16} />
                          Authorized Signature
                        </h3>
                        <p className="settings-asset-desc">
                          Printed above the Authorised Signatory line at the bottom of every invoice. Recommended: transparent PNG.
                        </p>
                      </div>
                      {signatureFile ? (
                        <span className="settings-status-pill pending">Unsaved</span>
                      ) : signatureRemoved && savedSignatureUrl ? (
                        <span className="settings-status-pill pending">Will Remove</span>
                      ) : savedSignatureUrl ? (
                        <span className="settings-status-pill saved">
                          <CheckCircle2 size={11} /> Saved
                        </span>
                      ) : (
                        <span className="settings-status-pill empty">Not Set</span>
                      )}
                    </div>

                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleChooseSignature}
                    />

                    <div
                      className="settings-preview-box checkered"
                      onClick={() => signatureInputRef.current?.click()}
                      title="Click to choose a signature image"
                    >
                      {signaturePreview ? (
                        <img
                          src={signaturePreview}
                          alt="Authorized Signature Preview"
                          className="settings-preview-img"
                        />
                      ) : (
                        <div className="settings-empty-placeholder">
                          <PenTool size={26} color="#94a3b8" />
                          <span>Click to choose Signature image</span>
                          <small>Transparent PNG or JPG up to 10MB</small>
                        </div>
                      )}
                    </div>

                    <div className="settings-asset-actions">
                      <button
                        type="button"
                        className="polaris-btn polaris-btn-secondary"
                        style={{ height: '34px', fontSize: '12px', flex: 1, justifyContent: 'center' }}
                        onClick={() => signatureInputRef.current?.click()}
                        disabled={saving}
                      >
                        <Upload size={14} /> {signaturePreview ? 'Change Signature' : 'Choose Signature'}
                      </button>

                      {signaturePreview && (
                        <button
                          type="button"
                          className="polaris-btn polaris-btn-secondary"
                          style={{ height: '34px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                          onClick={handleRemoveSignature}
                          disabled={saving}
                          title="Remove signature"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>

                    {savedSignatureUrl && !signatureFile && !signatureRemoved && (
                      <div className="settings-url-box">
                        <span className="settings-url-text" title={savedSignatureUrl}>
                          {savedSignatureUrl}
                        </span>
                        <a
                          href={savedSignatureUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-url-link"
                        >
                          Open <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Mini Preview Strip */}
                <div className="settings-live-preview">
                  <h4 className="settings-live-preview-title">Live Invoice Appearance Preview</h4>
                  <div className="settings-live-preview-grid">
                    <div className="settings-preview-brand">
                      <img src={activePreviewLogo} alt="Active Invoice Logo" />
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#0A2A1B' }}>
                          RAJU GHEE SWEETS
                        </div>
                        <div style={{ fontSize: '11px', color: '#b45309', fontWeight: '700' }}>
                          TAX INVOICE HEADER PREVIEW
                        </div>
                      </div>
                    </div>

                    <div className="settings-preview-signatory">
                      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: activePreviewSignature ? '2px' : '24px' }}>
                        For Raju Ghee Sweets
                      </div>
                      {activePreviewSignature && (
                        <img src={activePreviewSignature} alt="Active Invoice Signature" />
                      )}
                      <div className="settings-preview-sign-line">Authorised Signatory</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Save Bar */}
          <div className="settings-card-footer">
            <div className="settings-footer-note">
              {hasUnsavedChanges
                ? 'You have unsaved changes. Click Save to upload to ImageKit and apply across all invoices.'
                : 'All invoice branding assets are synced and active across all invoices.'}
            </div>
            <div className="settings-footer-actions">
              {hasUnsavedChanges && (
                <button
                  type="button"
                  className="polaris-btn polaris-btn-secondary"
                  onClick={handleResetChanges}
                  disabled={saving}
                >
                  <RotateCcw size={14} /> Reset
                </button>
              )}
              <button
                type="button"
                className="polaris-btn polaris-btn-primary"
                onClick={handleSaveSettings}
                disabled={saving || loading || !hasUnsavedChanges}
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="settings-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save size={15} /> Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

