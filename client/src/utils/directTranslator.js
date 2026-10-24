import { API_ORIGIN } from '../config/api';
// Direct Translation API - No Watermarks, Real-time Translation
class DirectTranslator {
  constructor() {
    this.cache = new Map(); // Cache translations to avoid repeated API calls
    this.currentLanguage = 'en';
    this.translationMap = {}; // Translation map from context
  }

  // Set translation map from TranslationContext
  setTranslations(translationMap) {
    if (translationMap && typeof translationMap === 'object') {
      this.translationMap = translationMap;
      console.log('📚 Translation map set:', Object.keys(translationMap).length, 'keys');
    }
  }

  // Free LibreTranslate API (self-hosted, no watermarks)
  async translateWithLibre(text, from = 'en', to = 'ar') {
    try {
      const response = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text'
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error('LibreTranslate API failed');
      
      const data = await response.json();
      return data.translatedText || text;
    } catch (error) {
      console.warn('LibreTranslate failed:', error);
      return null;
    }
  }

  // Alternative Google Translate methods
  async translateWithGoogleAlternative(text, from = 'en', to = 'ar') {
    try {
      // Method 1: Different client parameter
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=dict-chrome&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          return data[0][0][0];
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Alternative Google Translate failed:', error);
      return null;
    }
  }

  // Google Translate with different parameters
  async translateWithGoogleParams(text, from = 'en', to = 'ar') {
    try {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&q=${encodeURIComponent(text)}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          return data[0][0][0];
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Google Translate with params failed:', error);
      return null;
    }
  }
  async translateWithMyMemory(text, from = 'en', to = 'ar') {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
      
      if (!response.ok) throw new Error('MyMemory API failed');
      
      const data = await response.json();
      return data.responseStatus === 200 ? data.responseData.translatedText : null;
    } catch (error) {
      console.warn('MyMemory failed:', error);
      return null;
    }
  }

  // Google Translate API (free tier, no watermarks)
  async translateWithGoogle(text, from = 'en', to = 'ar') {
    try {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
      
      if (!response.ok) throw new Error('Google Translate API failed');
      
      const data = await response.json();
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        return data[0][0][0];
      }
      return null;
    } catch (error) {
      console.warn('Google Translate failed:', error);
      return null;
    }
  }

  // Enhanced Google Translate with multiple fallbacks
  async translateWithGoogleEnhanced(text, from = 'en', to = 'ar') {
    try {
      // Try the main Google Translate API first
      let result = await this.translateWithGoogle(text, from, to);
      if (result && result !== text) return result;

      // Fallback to alternative Google Translate endpoint
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&q=${encodeURIComponent(text)}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          return data[0][0][0];
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Enhanced Google Translate failed:', error);
      return null;
    }
  }

  // Main translation function - optimized for English/Arabic with Google Translate priority
  async translate(text, from = 'en', to = 'ar') {
    if (!text || typeof text !== 'string') return text;
    if (from === to) return text;
    
    const trimmed = text.trim();
    
    // Check if text exists in translation map first (fastest method)
    if (this.translationMap && this.translationMap[trimmed]) {
      const result = this.translationMap[trimmed];
      console.log(`✅ Found in map: "${trimmed.substring(0, 30)}..." → "${result.substring(0, 30)}..."`);
      return result;
    }
    
    // Check cache first
    const cacheKey = `${from}-${to}-${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Use backend translator (LibreTranslate via server)
    try {
      console.log(`🔄 Backend translating: "${trimmed.substring(0, 30)}..." from ${from} to ${to}`);
      
const response = await fetch(`${API_ORIGIN}/api/translation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          targetLang: to,
          sourceLang: from
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.translatedText) {
        const result = data.translatedText;
        this.cache.set(cacheKey, result);
        console.log(`✅ Translated: "${trimmed.substring(0, 30)}..." → "${result.substring(0, 30)}..."`);
        return result;
      } else {
        console.warn('❌ No translation in response:', data);
        return text;
      }
    } catch (error) {
      console.error('❌ Backend translation error:', error.message);
      return text;
    }
  }

  // Remove watermarks and branding from translations
  removeWatermarks(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Remove common watermarks and branding
    const watermarkPatterns = [
      /\(Powered by.*?\)/gi,
      /\[Translated by.*?\]/gi,
      /Google Translate/gi,
      /Powered by.*$/gi,
      /Translated with.*$/gi,
      /\(©.*?\)/gi,
      /©.*$/gi,
    ];
    
    let cleanText = text;
    watermarkPatterns.forEach(pattern => {
      cleanText = cleanText.replace(pattern, '').trim();
    });
    
    return cleanText;
  }

  // Batch translate multiple texts
  async translateBatch(texts, from = 'en', to = 'ar') {
    const results = {};
    
    // Translate in parallel for better performance
    const promises = Object.entries(texts).map(async ([key, text]) => {
      const translated = await this.translate(text, from, to);
      return [key, translated];
    });

    const resolved = await Promise.all(promises);
    resolved.forEach(([key, translated]) => {
      results[key] = translated;
    });

    return results;
  }

  // Translate DOM progressively component by component (fast, visible progress)
  async translateDOMProgressively(element, from = 'en', to = 'ar') {
    if (!element) return;

    console.log(`🚀 Starting progressive DOM translation to ${to}...`);
    
    // Get all major components (divs, sections, etc)
    const components = element.querySelectorAll('div[class*="container"], section, nav, header, footer, main, [role="main"]');
    console.log(`📦 Found ${components.length} major components to translate`);
    
    // If no major components, translate entire element
    if (components.length === 0) {
      await this.translateDOM(element, from, to);
      return;
    }

    let componentCount = 0;
    
    // Translate each component one by one
    for (const component of components) {
      try {
        componentCount++;
        console.log(`⚙️ Translating component ${componentCount}/${components.length}...`);
        
        // Translate this component's text nodes
        const walker = document.createTreeWalker(
          component,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent ? node.textContent.trim() : '';
          if (text.length > 0) {
            textNodes.push(node);
          }
        }

        // Translate text nodes in this component
        for (const textNode of textNodes) {
          const originalText = textNode.textContent;
          if (!originalText || originalText.trim().length === 0) continue;

          if (typeof textNode.__originalText === 'undefined') {
            try { 
              textNode.__originalText = originalText;
            } catch (e) { /* ignore */ }
          }

          const trimmed = originalText.trim();
          const translated_text = await this.translate(trimmed, from, to);
          
          if (translated_text && translated_text !== trimmed) {
            const leadingSpace = originalText.match(/^\s*/)[0];
            const trailingSpace = originalText.match(/\s*$/)[0];
            textNode.textContent = leadingSpace + translated_text + trailingSpace;
          }
        }

        // Translate attributes on this component
        await this._translateElementAttributes(component, from, to);
        
        // Small delay to show progress (but fast)
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (e) {
        console.warn(`Component ${componentCount} translation failed:`, e.message);
      }
    }

    console.log(`✅ Progressive translation complete! ${componentCount} components translated`);
  }

  // Translate entire DOM elements (for real-time UI translation) - AGGRESSIVE VERSION
  async translateDOM(element, from = 'en', to = 'ar') {
    if (!element) return;

    console.log(`🔍 SCANNING ENTIRE DOM for English text...`);
    
    // Translate all attributes on the root element
    await this._translateElementAttributes(element, from, to);

    // Get ALL text nodes including nested ones
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent ? node.textContent.trim() : '';
      // Include ALL text nodes, even single characters
      if (text.length > 0) {
        textNodes.push(node);
      }
    }

    console.log(`📝 FOUND ${textNodes.length} TEXT NODES - Starting translation...`);

    // Translate all text nodes
    let translated = 0;
    for (const textNode of textNodes) {
      const originalText = textNode.textContent;
      if (!originalText || originalText.trim().length === 0) continue;

      // Preserve original text so we can restore later
      if (typeof textNode.__originalText === 'undefined') {
        try { 
          textNode.__originalText = originalText;
        } catch (e) { /* ignore */ }
      }

      const trimmed = originalText.trim();
      
      // Try translation
      const translated_text = await this.translate(trimmed, from, to);
      if (translated_text && translated_text !== trimmed) {
        // Replace preserving surrounding whitespace
        const leadingSpace = originalText.match(/^\s*/)[0];
        const trailingSpace = originalText.match(/\s*$/)[0];
        textNode.textContent = leadingSpace + translated_text + trailingSpace;
        translated++;
        console.log(`✅ [${translated}] "${trimmed.substring(0, 40)}" → "${translated_text.substring(0, 40)}"`);
      }
    }

    console.log(`🎯 TRANSLATED ${translated}/${textNodes.length} text nodes to ${to}`);
    
    // Also translate all input/button values and placeholders
    const inputs = element.querySelectorAll('input, textarea, button');
    console.log(`📋 Found ${inputs.length} inputs/buttons to translate`);
    
    for (const input of inputs) {
      if (input.value && input.value.trim()) {
        const val = await this.translate(input.value.trim(), from, to);
        if (val && val !== input.value.trim()) {
          input.value = val;
        }
      }
      if (input.placeholder && input.placeholder.trim()) {
        const placeholder = await this.translate(input.placeholder.trim(), from, to);
        if (placeholder && placeholder !== input.placeholder.trim()) {
          input.placeholder = placeholder;
        }
      }
    }

    console.log(`🎯 DOM translation complete for ${to}`);
  }

  // Translate common attributes like placeholder, title, alt, aria-label, value
  async _translateElementAttributes(element, from = 'en', to = 'ar') {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    
    // Extended list of attributes to translate
    const attrsToCheck = [
      'placeholder', 'title', 'alt', 'aria-label', 'value',
      'aria-placeholder', 'data-tooltip', 'aria-describedby',
      'aria-labelledby', 'label', 'content'
    ];
    
    // Translate attributes on root element
    for (const attr of attrsToCheck) {
      if (element.hasAttribute && element.hasAttribute(attr)) {
        const original = element.getAttribute(attr);
        if (!original) continue;
        
        const key = `__orig_attr_${attr}`;
        if (typeof element[key] === 'undefined') {
          try { element[key] = original; } catch (e) { /* ignore */ }
        }
        
        try {
          const translated = await this.translate(original.trim(), from, to);
          if (translated && translated !== original) {
            element.setAttribute(attr, translated);
          }
        } catch (e) { /* ignore */ }
      }
    }

    // Recursively translate all child elements
    const children = element.querySelectorAll ? element.querySelectorAll('*') : [];
    for (const child of children) {
      for (const attr of attrsToCheck) {
        if (child.hasAttribute && child.hasAttribute(attr)) {
          const original = child.getAttribute(attr);
          if (!original || !original.trim()) continue;
          
          const key = `__orig_attr_${attr}`;
          if (typeof child[key] === 'undefined') {
            try { child[key] = original; } catch (e) { /* ignore */ }
          }
          
          try {
            const translated = await this.translate(original.trim(), from, to);
            if (translated && translated !== original) {
              child.setAttribute(attr, translated);
            }
          } catch (e) { /* ignore */ }
        }
      }
    }
  }

  // Restore DOM to original English text using stored originals
  restoreDOM(element) {
    if (!element) return;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node && typeof node.__originalText !== 'undefined') {
        try { node.textContent = node.__originalText; } catch (e) { /* ignore */ }
      }
    }

    // Restore attributes we may have translated
    const attrsToCheck = ['placeholder', 'title', 'alt', 'aria-label', 'value'];
    const elements = element.querySelectorAll ? element.querySelectorAll('*') : [];
    for (const el of elements) {
      for (const attr of attrsToCheck) {
        const key = `__orig_attr_${attr}`;
        if (typeof el[key] !== 'undefined') {
          try { el.setAttribute(attr, el[key]); } catch (e) { /* ignore */ }
        }
      }
    }
  }

  // Observe DOM mutations and translate added/changed text nodes
  observeDOM(element = document.body, from = 'en', to = 'ar') {
    if (!element || typeof MutationObserver === 'undefined') return;
    // If already observing, stop first
    if (this._observer) this.stopObserving();

    this._observer = new MutationObserver(async (mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of Array.from(m.addedNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent && node.textContent.trim();
              if (text) {
                const translated = await this.translate(text, from, to);
                if (translated && translated !== text) node.textContent = node.textContent.replace(text, translated);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Translate attributes and text nodes inside this element
              await this._translateElementAttributes(node, from, to);
              await this.translateDOM(node, from, to);
            }
          }
        } else if (m.type === 'characterData') {
          const node = m.target;
          const text = node.textContent && node.textContent.trim();
          if (text) {
            const translated = await this.translate(text, from, to);
            if (translated && translated !== text) node.textContent = node.textContent.replace(text, translated);
          }
        }
      }
    });

    this._observer.observe(element, { childList: true, subtree: true, characterData: true });
  }

  stopObserving() {
    if (this._observer) {
      try { this._observer.disconnect(); } catch (e) { /* ignore */ }
      this._observer = null;
    }
  }

  // Set current language
  setLanguage(lang) {
    this.currentLanguage = lang;
  }

  // Get current language
  getLanguage() {
    return this.currentLanguage;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Apply a precomputed translation map: { originalText: translatedText }
  // This is intended to be used with server-pushed diffs to quickly replace DOM text
  async applyTranslationMap(map = {}) {
    if (!map || typeof map !== 'object') return;
    const keys = Object.keys(map);
    if (keys.length === 0) return;

    // Determine map format: either { originalText: translated } OR { selector: { original, translated } }
    const sampleValue = map[keys[0]];

    if (sampleValue && typeof sampleValue === 'object' && ('original' in sampleValue) && ('translated' in sampleValue)) {
      // Selector-based diffs: key is CSS selector, value has original and translated
      for (const selector of Object.keys(map)) {
        try {
          const entry = map[selector];
          if (!entry) continue;
          const { original, translated } = entry;
          if (!translated || translated === original) continue;
          let elements = [];
          try { elements = Array.from(document.querySelectorAll(selector)); } catch (e) { /* invalid selector */ }
          if (!elements || elements.length === 0) continue;

          for (const el of elements) {
            // Replace text nodes inside element matching original
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
              try {
                const origText = node.textContent;
                if (!origText) continue;
                const trimmed = origText.trim();
                if (trimmed === original) {
                  node.textContent = origText.replace(trimmed, translated);
                } else if (trimmed.includes(original)) {
                  node.textContent = origText.replace(original, translated);
                }
              } catch (e) { /* ignore */ }
            }
          }
        } catch (e) { /* ignore per-selector errors */ }
      }
    } else {
      // Original-text keyed map (legacy): replace occurrences of exact trimmed text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        try {
          const original = node.textContent;
          if (!original) continue;
          const trimmed = original.trim();
          if (!trimmed) continue;
          if (Object.prototype.hasOwnProperty.call(map, trimmed)) {
            const translated = map[trimmed];
            if (translated && translated !== trimmed) {
              node.textContent = original.replace(trimmed, translated);
            }
          }
        } catch (e) { /* ignore individual node errors */ }
      }
    }

    // Attributes to consider
    const attrs = ['placeholder', 'title', 'alt', 'aria-label', 'value'];
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      for (const attr of attrs) {
        try {
          if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
          const val = el.getAttribute(attr);
          if (!val) continue;
          const trimmed = val.trim();
          if (Object.prototype.hasOwnProperty.call(map, trimmed)) {
            const translated = map[trimmed];
            if (translated && translated !== trimmed) el.setAttribute(attr, translated);
          }
        } catch (e) { /* ignore */ }
      }
    }
  }
}

// Create singleton instance
const directTranslator = new DirectTranslator();

export default directTranslator;
