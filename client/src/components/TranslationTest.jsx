import React from 'react';
import { useSimpleTranslation } from '../context/SimpleTranslationContext';

const TranslationTest = () => {
  const { t, currentLanguage, version, changeLanguage } = useSimpleTranslation();

  console.log('🔧 TranslationTest render:', { currentLanguage, version });

  const handleTestTranslation = () => {
    console.log('🧪 Test button clicked');
    console.log('🧪 Current language:', currentLanguage);
    console.log('🧪 Testing translation for "login":', t('login'));
    console.log('🧪 Testing translation for "email":', t('email'));
    console.log('🧪 Testing translation for "edumentor_lms":', t('edumentor_lms'));
  };

  const handleForceArabic = () => {
    console.log('🧪 Forcing Arabic');
    changeLanguage('ar');
  };

  const handleForceEnglish = () => {
    console.log('🧪 Forcing English');
    changeLanguage('en');
  };

  return (
    <div className="p-4 bg-yellow-100 text-black">
      <h3>Translation Debug Info:</h3>
      <p>Current Language: {currentLanguage}</p>
      <p>Version: {version}</p>
      <p>Login text: {t('login')}</p>
      <p>Email text: {t('email')}</p>
      <p>Password text: {t('password')}</p>
      <p>EduMentor LMS: {t('edumentor_lms')}</p>
      
      <div className="mt-4 space-x-2">
        <button 
          onClick={handleTestTranslation}
          className="px-3 py-1 bg-blue-500 text-white rounded"
        >
          Test Translation
        </button>
        <button 
          onClick={handleForceEnglish}
          className="px-3 py-1 bg-gray-500 text-white rounded"
        >
          English
        </button>
        <button 
          onClick={handleForceArabic}
          className="px-3 py-1 bg-green-500 text-white rounded"
        >
          Arabic
        </button>
      </div>
    </div>
  );
};

export default TranslationTest;
