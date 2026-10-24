import { useEffect, useState, useCallback } from 'react';

const useUniversalTranslator = () => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Initialize language from localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
    setCurrentLanguage(savedLanguage);
  }, []);

  // Change language function
  const changeLanguage = useCallback(async (languageCode) => {
    setCurrentLanguage(languageCode);
    localStorage.setItem('selectedLanguage', languageCode);
    
    // Use the global universal translator if available
    if (typeof window !== 'undefined' && window.universalTranslator) {
      try {
        setIsTranslating(true);
        await window.universalTranslator.changeLanguage(languageCode);
      } catch (error) {
        console.error('Translation failed:', error);
      } finally {
        setIsTranslating(false);
      }
    }
  }, []);

  // Toggle translation function
  const toggleTranslation = useCallback(() => {
    if (typeof window !== 'undefined' && window.universalTranslator) {
      window.universalTranslator.toggleTranslation();
      setIsEnabled(window.universalTranslator.isEnabled());
    }
  }, []);

  // Translate specific text function
  const translateText = useCallback(async (text, targetLanguage = currentLanguage) => {
    if (targetLanguage === 'en') return text;
    
    try {
      const directTranslator = await import('../utils/directTranslator');
      const translated = await directTranslator.default.translate(text, 'en', targetLanguage);
      return translated;
    } catch (error) {
      console.error('Text translation failed:', error);
      return text;
    }
  }, [currentLanguage]);

  // Get supported languages
  const getSupportedLanguages = useCallback(() => {
    return [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' },
      { code: 'pt', name: 'Português', flag: '🇵🇹' },
      { code: 'ru', name: 'Русский', flag: '🇷🇺' },
      { code: 'zh', name: '中文', flag: '🇨🇳' },
      { code: 'ja', name: '日本語', flag: '🇯🇵' },
      { code: 'ko', name: '한국어', flag: '🇰🇷' },
      { code: 'ar', name: 'العربية', flag: '🇸🇦' },
      { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    ];
  }, []);

  // Check if translator is available
  const isTranslatorAvailable = useCallback(() => {
    return typeof window !== 'undefined' && window.universalTranslator;
  }, []);

  // Get current translation status
  const getTranslationStatus = useCallback(() => {
    if (isTranslatorAvailable()) {
      return {
        isTranslating: window.universalTranslator.isTranslating(),
        isEnabled: window.universalTranslator.isEnabled(),
        currentLanguage: window.universalTranslator.getCurrentLanguage()
      };
    }
    return {
      isTranslating: false,
      isEnabled: false,
      currentLanguage: 'en'
    };
  }, [isTranslatorAvailable]);

  return {
    currentLanguage,
    isTranslating,
    isEnabled,
    changeLanguage,
    toggleTranslation,
    translateText,
    getSupportedLanguages,
    isTranslatorAvailable,
    getTranslationStatus
  };
};

export default useUniversalTranslator;
