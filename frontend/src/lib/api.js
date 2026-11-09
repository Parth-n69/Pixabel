import { supabase } from './supabase';

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

/**
 * 9
 * Fetch wrapper that adds the Bearer token from Supabase session and prepends the API base URL.
 * @param {string} endpoint - Path relative to base URL or full URL
 * @param {RequestInit & { token?: string }} [options] - Standard fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const headers = new Headers(options.headers || {});

  // Add Bearer token if not already explicitly provided
  if (!headers.has('Authorization')) {
    let token = options.token;
    if (!token) {
      try {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token;
      } catch (err) {
        console.warn('[apiFetch] Could not get session token:', err);
      }
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Set Content-Type: application/json if sending a JSON body
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  return fetch(url, {
    ...options,
    headers,
    body,
  });
}

/**
 * Get backend credit status
 * @returns {Promise<{ remaining: number, daily_limit: number, cf_remaining?: number, cf_daily_limit?: number, default_model?: string }>}
 */
export async function getBackendStatus() {
  const res = await apiFetch('/status');
  if (!res.ok) {
    throw new Error(`Failed to fetch status: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch the full model list from the backend (with provider badges, notes, etc.)
 * @returns {Promise<{ models: Array, default: string, cf_remaining?: number, cf_daily_limit?: number }>}
 */
export async function getModelList() {
  const res = await apiFetch('/models');
  if (!res.ok) {
    throw new Error(`Failed to fetch models: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Call backend generate endpoint
 * @param {Object} payload
 * @param {string} payload.prompt
 * @param {string} [payload.model]
 * @param {string} [payload.negative_prompt]
 * @param {number} [payload.width]
 * @param {number} [payload.height]
 * @returns {Promise<{ image: string, remaining?: number, daily_limit?: number, cf_remaining?: number, note?: string }>}
 */
export async function generateImage(payload) {
  const res = await apiFetch('/generate', {
    method: 'POST',
    body: payload,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 429 || data.code === 'TOKEN_EXPIRED') {
    const error = new Error(data.error || 'Your daily free generations are used up. Please come back tomorrow!');
    error.code = 'LIMIT_REACHED';
    error.daily_limit = data.daily_limit || 20;
    error.remaining = 0;
    throw error;
  }

  if (data.code === 'CF_RATE_LIMIT') {
    const error = new Error(data.error || 'Rate limited. Please wait a moment.');
    error.code = 'CF_RATE_LIMIT';
    throw error;
  }

  if (!res.ok) {
    throw new Error(data.error || `Server error (HTTP ${res.status})`);
  }

  if (!data.image) {
    throw new Error('Server returned a response with no image data.');
  }

  return data;
}

/**
 * Call backend edit endpoint
 * @param {Object} payload
 * @param {string} payload.image - Base64 data URI
 * @param {string} payload.prompt
 * @param {string} [payload.model]
 * @returns {Promise<{ image: string }>}
 */
export async function editImage(payload) {
  const res = await apiFetch('/edit', {
    method: 'POST',
    body: payload,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 429 || data.code === 'TOKEN_EXPIRED') {
    const error = new Error(data.error || 'Your daily limit of generations is used up. Try again tomorrow.');
    error.code = 'LIMIT_REACHED';
    throw error;
  }

  if (data.code === 'CF_RATE_LIMIT') {
    const error = new Error(data.error || 'Rate limited. Please wait a moment.');
    error.code = 'CF_RATE_LIMIT';
    throw error;
  }

  if (data.code === 'CF_AUTH') {
    const error = new Error(data.error || 'Cloudflare credentials are not configured. AI edit is unavailable.');
    error.code = 'CF_AUTH';
    throw error;
  }

  if (!res.ok) {
    const error = new Error(data.error || `Failed to edit image (HTTP ${res.status})`);
    error.code = data.code || null;
    throw error;
  }

  if (!data.image) {
    throw new Error('Server returned a response with no edited image.');
  }

  return data;
}

/**
 * Call backend restyle endpoint (Cloudflare SDXL Lightning img2img)
 * @param {Object} payload
 * @param {string} payload.image - Base64 data URI
 * @param {string} payload.prompt
 * @param {number} [payload.strength] - 0.0–1.0
 * @param {string} [payload.negative_prompt]
 * @returns {Promise<{ image: string, remaining?: number, cf_remaining?: number }>}
 */
export async function restyleImage(payload) {
  const res = await apiFetch('/restyle', {
    method: 'POST',
    body: payload,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 429 || data.code === 'TOKEN_EXPIRED') {
    const error = new Error(data.error || 'Daily limit reached.');
    error.code = 'LIMIT_REACHED';
    throw error;
  }

  if (data.code === 'CF_RATE_LIMIT') {
    const error = new Error(data.error || 'Rate limited. Please wait a moment.');
    error.code = 'CF_RATE_LIMIT';
    throw error;
  }

  if (!res.ok) {
    const error = new Error(data.error || `Failed to restyle image (HTTP ${res.status})`);
    error.code = data.code || null;
    throw error;
  }

  if (!data.image) {
    throw new Error('Server returned a response with no restyled image.');
  }

  return data;
}
