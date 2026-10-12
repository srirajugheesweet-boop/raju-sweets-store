/**
 * Cloudinary Integration for Raju Ghee Sweets
 * Handles direct signed upload and asset deletion with SHA-1 signatures
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dwlp5setc';
const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY || '811263269993138';
const API_SECRET = import.meta.env.VITE_CLOUDINARY_API_SECRET || 'y5vO5uWEWeq1KxjmMV6wPVEQFDE';

/**
 * Compute SHA-1 hexadecimal hash using browser native Web Crypto API
 * @param {string} message 
 * @returns {Promise<string>}
 */
async function computeSha1(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload a Quotation image to Cloudinary
 * @param {string} imageDataUrl - Base64 data URI of the quotation image
 * @param {string} quotationNo - Unique quotation identifier
 * @returns {Promise<{ url: string, publicId: string, secureUrl: string }>}
 */
export async function uploadQuotationImage(imageDataUrl, quotationNo = '') {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const sanitizedNo = (quotationNo || `QT_${Date.now()}`).toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const publicId = `${sanitizedNo}_${Date.now()}`;
    const folder = 'quotations';

    // Parameters to sign in alphabetical order: folder, public_id, timestamp
    const stringToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const signature = await computeSha1(stringToSign);

    const formData = new FormData();
    formData.append('file', imageDataUrl);
    formData.append('api_key', API_KEY);
    formData.append('timestamp', timestamp.toString());
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error?.message || 'Failed to upload image to Cloudinary');
    }

    return {
      success: true,
      url: data.secure_url || data.url,
      secureUrl: data.secure_url || data.url,
      publicId: data.public_id,
      format: data.format,
      bytes: data.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

/**
 * Delete a previously uploaded quotation from Cloudinary
 * @param {string} publicId - The Cloudinary public_id (e.g. "quotations/QT_123_456")
 * @returns {Promise<{ success: boolean, result?: any }>}
 */
export async function deleteQuotationImage(publicId) {
  if (!publicId) return { success: true };

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Parameters to sign: public_id, timestamp
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const signature = await computeSha1(stringToSign);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', API_KEY);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.warn('Cloudinary delete warning:', data.error?.message || data);
      return { success: false, error: data.error?.message };
    }

    return { success: true, result: data.result };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
}
