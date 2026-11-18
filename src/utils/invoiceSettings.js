import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const STORAGE_KEY = 'raju_sweets_invoice_settings';
const SETTINGS_COLLECTION = 'settings';
const INVOICE_DOC_ID = 'invoice';

const readLocalCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        logoUrl: parsed.logoUrl || '',
        signatureUrl: parsed.signatureUrl || ''
      };
    }
  } catch {
    // ignore storage errors
  }
  return { logoUrl: '', signatureUrl: '' };
};

const writeLocalCache = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      logoUrl: settings.logoUrl || '',
      signatureUrl: settings.signatureUrl || ''
    }));
  } catch {
    // ignore storage errors
  }
};

let cachedSettings = readLocalCache();
let hasLoadedFromServer = false;
let globalUnsubscribe = null;
const subscribers = new Set();

const notifySubscribers = () => {
  const snapshot = { ...cachedSettings };
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('Invoice settings subscriber error:', err);
    }
  });
};

/**
 * Starts a single global Firestore real-time listener for settings/invoice.
 * Safe to call multiple times; only attaches one listener.
 */
export const initInvoiceSettingsListener = () => {
  if (globalUnsubscribe) return globalUnsubscribe;

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, INVOICE_DOC_ID);
    globalUnsubscribe = onSnapshot(
      docRef,
      (snap) => {
        hasLoadedFromServer = true;
        if (snap.exists()) {
          const data = snap.data();
          cachedSettings = {
            logoUrl: data.logoUrl || '',
            signatureUrl: data.signatureUrl || ''
          };
        } else {
          cachedSettings = { logoUrl: '', signatureUrl: '' };
        }
        writeLocalCache(cachedSettings);
        notifySubscribers();
      },
      (err) => {
        console.warn('Invoice settings listener warning:', err);
      }
    );
  } catch (err) {
    console.warn('Failed to initialize invoice settings listener:', err);
  }

  return globalUnsubscribe;
};

/**
 * Synchronously returns the latest cached invoice settings ({ logoUrl, signatureUrl }).
 * Also ensures the background real-time listener is started.
 */
export const getCachedInvoiceSettings = () => {
  initInvoiceSettingsListener();
  return { ...cachedSettings };
};

/**
 * Fetches fresh invoice settings from Firestore and updates cache.
 */
export const fetchInvoiceSettings = async () => {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, INVOICE_DOC_ID);
    const snap = await getDoc(docRef);
    hasLoadedFromServer = true;
    if (snap.exists()) {
      const data = snap.data();
      cachedSettings = {
        logoUrl: data.logoUrl || '',
        signatureUrl: data.signatureUrl || ''
      };
    } else {
      cachedSettings = { logoUrl: '', signatureUrl: '' };
    }
    writeLocalCache(cachedSettings);
    notifySubscribers();
    return { ...cachedSettings };
  } catch (err) {
    console.error('Error fetching invoice settings:', err);
    return { ...cachedSettings };
  }
};

/**
 * Returns true if settings have already been fetched from Firestore at least once.
 */
export const isInvoiceSettingsLoaded = () => hasLoadedFromServer;

/**
 * Saves logoUrl and signatureUrl to Firestore (settings/invoice) and updates local cache.
 */
export const saveInvoiceSettings = async ({ logoUrl, signatureUrl }) => {
  const docRef = doc(db, SETTINGS_COLLECTION, INVOICE_DOC_ID);
  const payload = {
    logoUrl: logoUrl || '',
    signatureUrl: signatureUrl || '',
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, payload, { merge: true });

  cachedSettings = {
    logoUrl: payload.logoUrl,
    signatureUrl: payload.signatureUrl
  };
  hasLoadedFromServer = true;
  writeLocalCache(cachedSettings);
  notifySubscribers();

  return { ...cachedSettings };
};

/**
 * Subscribe a React component to live updates of invoice settings.
 * Immediately invokes callback with current cached value and returns unsubscribe fn.
 */
export const subscribeInvoiceSettings = (callback) => {
  initInvoiceSettingsListener();
  subscribers.add(callback);
  callback({ ...cachedSettings });
  return () => {
    subscribers.delete(callback);
  };
};

