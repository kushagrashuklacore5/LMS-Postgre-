import React from 'react';
import UniversalLanguageSelector from './UniversalLanguageSelector';

const GlobalLanguageSelector = ({ className = '', compact = false }) => {
  return <UniversalLanguageSelector variant={compact ? 'compact' : 'default'} className={className} />;
};

export default GlobalLanguageSelector;
