import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';
import { getStorageItem, setStorageItem, removeStorageItem, getBrowserInfo } from '../utils/browserCompatibility';
import { isTokenExpired, msUntilExpiry } from '../utils/jwtExpiry';

const AuthContext = createContext();

const API = API_BASE;

// Derive socket URL (strip trailing /api if present)
const SOCKET_URL = API.replace(/\/api\/?$/, '');

// An expired stored session must not render protected pages (the server
// answers 401/403 or treats the request as a guest). Clear it before the
// first render so ProtectedRoute sends the user to /login.
const clearExpiredStoredSession = () => {
  try {
    const storedToken = getStorageItem('token');
    if (storedToken && isTokenExpired(storedToken)) {
      removeStorageItem('token');
      removeStorageItem('user');
      removeStorageItem('userId');
      console.info('Stored session has expired; please sign in again.');
    }
  } catch {
    // ignore storage errors
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => {
    try {
      clearExpiredStoredSession();
      // Use compatibility utility for cross-browser support
      const storedToken = getStorageItem('token');
      return storedToken;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      // Use compatibility utility for cross-browser support
      const storedUser = getStorageItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });

  // Validate existing tokens on mount
  useEffect(() => {
    const storedToken = getStorageItem('token');
    const storedUser = getStorageItem('user');
    
    const browserInfo = getBrowserInfo();
    console.log('Browser detected:', browserInfo.name, 'Storage available:', !!storedToken);
    
    // Only clear if token is invalid or user data is missing
    if (storedToken && !storedUser) {
      console.log('Clearing invalid token/user combo');
      removeStorageItem('token');
      removeStorageItem('user');
      setToken(null);
      setUser(null);
    } else if (storedToken && storedUser) {
      try {
        // Validate user data is proper JSON
        JSON.parse(storedUser);
        console.log('Token and user validation passed');
      } catch {
        console.log('Invalid user data format, clearing auth');
        removeStorageItem('token');
        removeStorageItem('user');
        setToken(null);
        setUser(null);
      }
    }
  }, []);

  // The socket identifies itself with the session token: the server only delivers
  // realtime events to sockets that have proved who they are (their own school's events).
  const [socket, setSocket] = useState(null);
  useEffect(() => {
    try {
      // The URL must be the first argument: io({ url }) ignores `url` and
      // connects to the page origin (the Vite dev server), which never answers.
      const s = io(SOCKET_URL, {
        auth: { token: token || undefined },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });
      setSocket(s);
      s.on('connect', () => console.log('Socket connected:', s.id));
      s.on('connect_error', (err) => console.warn('Socket connect_error', err.message));
      return () => {
        s.disconnect();
      };

    } catch (error) {
      console.error('Socket initialization error:', error);
    }
  }, [token]);

  const loginUser = (newToken, newUser) => {
    console.log('🔍 AuthContext loginUser called');
    console.log('🔍 AuthContext Setting token:', !!newToken);
    console.log('🔍 AuthContext Setting user:', newUser);
    
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    // Store userId explicitly for legacy components that read localStorage.userId
    try {
      const uid = newUser?.id || newUser?._id || newUser?.userId || '';
      if (uid) localStorage.setItem('userId', String(uid));
    } catch (e) {
      // ignore
    }
    
    console.log('🔍 AuthContext Token and user stored in localStorage');
    console.log('🔍 AuthContext Current user state after setting:', newUser);
  };

  const logoutUser = () => {
    // Tell the server too, so the token stops working everywhere (not just in this browser)
    if (token) {
      fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    window.dispatchEvent(new CustomEvent('rag-chat:reset')); // close the help assistant and clear its conversation
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // End the session when the token expires while the app is open.
  useEffect(() => {
    if (!token) return undefined;
    const ms = msUntilExpiry(token);
    if (ms === null) return undefined;
    if (ms <= 0) {
      logoutUser();
      return undefined;
    }
    // setTimeout overflows above ~24.8 days; long-lived tokens re-check on reload.
    if (ms > 2147483647) return undefined;
    const timer = setTimeout(() => {
      console.info('Session expired; signing out.');
      logoutUser();
    }, ms);
    return () => clearTimeout(timer);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, loginUser, logoutUser, API, socket }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
