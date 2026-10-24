// Every request to the LMS server carries the signed-in session.
//
// The server refuses API calls without a session (only login, password reset and the
// public forms are open). Pages written before that rule sometimes call fetch() or axios
// without the Authorization header; this adds it in one place instead of in each page.
// It only touches requests to the LMS server and never replaces a header a page set itself.
import axios from 'axios';
import { API_ORIGIN } from './api';

const sessionToken = () => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};

const isLmsRequest = (url) => {
  try {
    return new URL(url, window.location.href).origin === new URL(API_ORIGIN, window.location.href).origin;
  } catch {
    return false;
  }
};

// The server answers 401 when a session has ended (signed out elsewhere, password reset,
// expired or altered token). The page would otherwise stay open showing empty lists, so
// the stale session is dropped and the user is taken to the sign-in page, once.
let leaving = false;
const sessionEnded = (url, sentToken) => {
  if (leaving || !sentToken || /\/(auth\/login|superadmin\/login|password-reset|student-setup)\b/.test(url)) return;
  if (sessionToken() !== sentToken) return; // the user has already signed in again
  leaving = true;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.setItem('sessionEnded', '1');
  } catch {
    /* storage unavailable */
  }
  const signIn = window.location.pathname.startsWith('/superadmin') ? '/superadmin/login' : '/login';
  if (window.location.pathname !== signIn) window.location.assign(signIn);
};

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url;
  const token = sessionToken();
  if (!token || !url || !isLmsRequest(url)) return nativeFetch(input, init);

  const headers = new Headers(init.headers || (typeof input === 'object' && input.headers) || {});
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const response = await nativeFetch(input, { ...init, headers });
  if (response.status === 401 && headers.get('Authorization') === `Bearer ${token}`) sessionEnded(url, token);
  return response;
};

axios.interceptors.request.use((config) => {
  const token = sessionToken();
  const url = /^https?:/i.test(config.url || '') ? config.url : `${config.baseURL || ''}${config.url || ''}`;
  if (token && isLmsRequest(url) && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const config = error.config || {};
    const url = /^https?:/i.test(config.url || '') ? config.url : `${config.baseURL || ''}${config.url || ''}`;
    const sent = String(config.headers?.Authorization || '').replace(/^Bearer /, '');
    if (error.response?.status === 401 && isLmsRequest(url)) sessionEnded(url, sent);
    return Promise.reject(error);
  }
);
