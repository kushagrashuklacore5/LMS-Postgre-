import React from 'react';
import UniversalLanguageSelector from './UniversalLanguageSelector';

const SimpleLanguageSelector = ({ compact = false, className = '' }) => {
  return <UniversalLanguageSelector variant={compact ? 'compact' : 'default'} className={className} />;
};

export default SimpleLanguageSelector;
