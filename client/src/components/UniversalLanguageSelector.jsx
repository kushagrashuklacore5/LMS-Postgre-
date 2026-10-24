import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { SUPPORTED_LANGUAGES, ACTIVE_LANGUAGES } from '../i18n/languageRegistry';

/**
 * UniversalLanguageSelector
 * 
 * Production-ready language switcher for all LMS portals.
 * - Displays native language names (English, हिन्दी).
 * - Instant zero-reload switching via i18next.
 * - Persists to localStorage and user language preferences API.
 * - Fully accessible with keyboard navigation.
 */
const UniversalLanguageSelector = ({ variant = 'default', className = '' }) => {
  const { currentLanguage, changeLanguage } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const activeLangKey = Object.keys(SUPPORTED_LANGUAGES).find(
    (key) => key === currentLanguage || SUPPORTED_LANGUAGES[key].legacyCode === currentLanguage
  ) || 'en-IN';

  const currentLangMeta = SUPPORTED_LANGUAGES[activeLangKey] || SUPPORTED_LANGUAGES['en-IN'];

  const handleSelectLanguage = async (code) => {
    await changeLanguage(code);
    setIsOpen(false);
  };

  // Compact inline badge variant
  if (variant === 'compact') {
    return (
      <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white/90 hover:bg-white border border-[#ebdcaa]/80 shadow-2xs hover:border-[#B99652] transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-[#B99652]" />
          <span>{currentLangMeta.nativeName}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {isOpen && (
          <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1 w-56 max-h-80 overflow-y-auto bg-white border border-[#ebdcaa] shadow-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
            {ACTIVE_LANGUAGES.map((code) => {
              const lang = SUPPORTED_LANGUAGES[code];
              if (!lang) return null;
              const isSelected = activeLangKey === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelectLanguage(code)}
                  className={`w-full text-left rtl:text-right px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-[#fffdf4] text-[#9a7837] font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold">{lang.nativeName}</span>
                    <span className="text-[10px] text-slate-400">{lang.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#B99652]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Default navbar variant
  return (
    <div className={`relative inline-block text-left rtl:text-right ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-[#fffdf4] hover:bg-[#fff9e6] border border-[#ebdcaa] shadow-xs hover:border-[#B99652] transition-all cursor-pointer"
        title="Switch Language / भाषा बदलें"
      >
        <Globe className="w-4 h-4 text-[#B99652]" />
        <span className="font-bold">{currentLangMeta.nativeName}</span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-56 max-h-80 overflow-y-auto bg-white border border-[#ebdcaa] shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="sticky top-0 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1 z-10">
            Languages (20) / भाषाएं
          </div>

          {ACTIVE_LANGUAGES.map((code) => {
            const lang = SUPPORTED_LANGUAGES[code];
            if (!lang) return null;
            const isSelected = activeLangKey === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => handleSelectLanguage(code)}
                className={`w-full text-left rtl:text-right px-3.5 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#fffdf4] text-[#9a7837] font-bold border-l-2 rtl:border-l-0 rtl:border-r-2 border-[#B99652]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{lang.nativeName}</span>
                  <span className="text-[10px] text-slate-400">{lang.name}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-[#B99652] stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UniversalLanguageSelector;
