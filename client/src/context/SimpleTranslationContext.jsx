import React, { createContext } from 'react';
import { useTranslation } from './TranslationContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languageRegistry';

const SimpleTranslationContext = createContext();

export const SimpleTranslationProvider = ({ children }) => {
  return <>{children}</>;
};

export const useSimpleTranslation = () => {
  const { currentLanguage, changeLanguage, t, isRTL, version, isLoading } = useTranslation();

  return {
    currentLanguage,
    changeLanguage,
    t,
    isRTL,
    supportedLanguages: SUPPORTED_LANGUAGES,
    version,
    loading: isLoading,
  };
};

export default SimpleTranslationContext;
