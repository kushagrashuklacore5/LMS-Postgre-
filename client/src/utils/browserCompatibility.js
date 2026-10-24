// Browser compatibility utilities

export const isStorageAvailable = () => {
  try {
    const test = 'test';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

export const getStorageItem = (key) => {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

export const setStorageItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch (e) {
    console.error('Storage error:', e);
  }
};

export const removeStorageItem = (key) => {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch (e) {
    console.error('Storage removal error:', e);
  }
};

export const clearAllStorage = () => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {
    console.error('Storage clear error:', e);
  }
};

// Detect browser type
export const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;
  const isChrome = /Chrome/.test(userAgent);
  const isEdge = /Edg/.test(userAgent);
  const isFirefox = /Firefox/.test(userAgent);
  const isSafari = /Safari/.test(userAgent);
  
  return {
    userAgent,
    isChrome,
    isEdge,
    isFirefox,
    isSafari,
    name: isChrome ? 'Chrome' : isEdge ? 'Edge' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'Unknown'
  };
};
