import React, { useState, useEffect, useRef } from 'react';
import directTranslator from '../utils/directTranslator';

const RealTimeTranslator = ({ children, targetLanguage = 'ar' }) => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const containerRef = useRef(null);
  const originalContentRef = useRef(null);

  // Store original content before translation
  const storeOriginalContent = () => {
    if (containerRef.current && !originalContentRef.current) {
      originalContentRef.current = containerRef.current.innerHTML;
    }
  };

  // Translate content in real-time
  const translateContent = async () => {
    if (!containerRef.current || isTranslating) return;

    setIsTranslating(true);
    storeOriginalContent();

    try {
      if (targetLanguage === 'en') {
        // Restore original content
        if (originalContentRef.current) {
          containerRef.current.innerHTML = originalContentRef.current;
        }
      } else {
        // Translate all text content
        await directTranslator.translateDOM(containerRef.current, 'en', targetLanguage);
      }
      setCurrentLanguage(targetLanguage);
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  // Auto-translate when language changes
  useEffect(() => {
    translateContent();
  }, [targetLanguage]);

  // Translate on mount
  useEffect(() => {
    if (targetLanguage !== 'en') {
      translateContent();
    }
  }, []);

  return (
    <div ref={containerRef} className="real-time-translator">
      {isTranslating && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm z-50">
          Translating...
        </div>
      )}
      {children}
    </div>
  );
};

export default RealTimeTranslator;
