import React, { useState, useEffect, useRef, useCallback } from 'react';
import directTranslator from '../utils/directTranslator';

const UniversalTranslator = ({ children, enabled = true }) => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(enabled);
  const containerRef = useRef(null);
  const originalContentRef = useRef(new Map());
  const observerRef = useRef(null);

  // Store original content for all elements
  const storeOriginalContent = useCallback(() => {
    if (!containerRef.current) return;

    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        const parent = node.parentElement;
        if (parent && !originalContentRef.current.has(parent)) {
          originalContentRef.current.set(parent, parent.innerHTML);
        }
        textNodes.push(node);
      }
    }
  }, []);

  // Translate all text content in the container
  const translateContent = useCallback(async (targetLanguage) => {
    if (!containerRef.current || !translationEnabled || isTranslating) return;

    setIsTranslating(true);

    try {
      if (targetLanguage === 'en') {
        // Restore original content
        originalContentRef.current.forEach((originalHTML, element) => {
          if (element && element.parentNode) {
            element.innerHTML = originalHTML;
          }
        });
      } else {
        // Get all text nodes
        const walker = document.createTreeWalker(
          containerRef.current,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent.trim() && 
              !node.closest('[data-no-translate]') &&
              !node.closest('script') &&
              !node.closest('style')) {
            textNodes.push(node);
          }
        }

        // Translate text nodes in batches to avoid overwhelming APIs
        const batchSize = 10;
        for (let i = 0; i < textNodes.length; i += batchSize) {
          const batch = textNodes.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (textNode) => {
            const originalText = textNode.textContent.trim();
            if (originalText && originalText.length > 0) {
              try {
                const translated = await directTranslator.translate(originalText, 'en', targetLanguage);
                if (translated && translated !== originalText) {
                  textNode.textContent = translated;
                }
              } catch (error) {
                console.warn('Translation failed for text:', originalText, error);
              }
            }
          }));

          // Small delay between batches to avoid rate limiting
          if (i + batchSize < textNodes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
      
      setCurrentLanguage(targetLanguage);
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setIsTranslating(false);
    }
  }, [translationEnabled, isTranslating]);

  // Set up MutationObserver to handle dynamic content
  const setupMutationObserver = useCallback(() => {
    if (!containerRef.current || observerRef.current) return;

    observerRef.current = new MutationObserver((mutations) => {
      let shouldTranslate = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE || 
                (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim())) {
              shouldTranslate = true;
            }
          });
        } else if (mutation.type === 'characterData' && mutation.target.textContent.trim()) {
          shouldTranslate = true;
        }
      });

      if (shouldTranslate && currentLanguage !== 'en' && translationEnabled) {
        // Store new original content and translate
        storeOriginalContent();
        setTimeout(() => translateContent(currentLanguage), 100);
      }
    });

    observerRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }, [currentLanguage, translationEnabled, storeOriginalContent, translateContent]);

  // Initialize on mount
  useEffect(() => {
    if (containerRef.current && translationEnabled) {
      storeOriginalContent();
      setupMutationObserver();
      
      // Load saved language preference
      const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
      if (savedLanguage !== 'en') {
        translateContent(savedLanguage);
      }
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [translationEnabled, storeOriginalContent, setupMutationObserver, translateContent]);

  // Public method to change language
  const changeLanguage = useCallback(async (languageCode) => {
    localStorage.setItem('selectedLanguage', languageCode);
    await translateContent(languageCode);
  }, [translateContent]);

  // Public method to toggle translation
  const toggleTranslation = useCallback(() => {
    setTranslationEnabled(prev => !prev);
  }, []);

  // Make translation methods available globally
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.universalTranslator = {
        changeLanguage,
        toggleTranslation,
        getCurrentLanguage: () => currentLanguage,
        isEnabled: () => translationEnabled,
        isTranslating: () => isTranslating
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.universalTranslator;
      }
    };
  }, [changeLanguage, toggleTranslation, currentLanguage, translationEnabled, isTranslating]);

  return (
    <>
      {isTranslating && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span className="text-sm font-medium">Translating...</span>
        </div>
      )}
      
      <div ref={containerRef} className="universal-translator-container">
        {children}
      </div>
    </>
  );
};

export default UniversalTranslator;
