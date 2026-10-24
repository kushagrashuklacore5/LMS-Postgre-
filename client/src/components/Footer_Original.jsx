import React from 'react';
import { useTranslation } from '../context/TranslationContext';

const Footer = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <img 
                src="/core5 logo new new-modified (1).png" 
                alt="Core5 Academy" 
                className="h-8 w-auto"
              />
            </div>
            <h3 className="text-lg font-bold">Core5 Academy</h3>
            <p className="text-gray-300 text-sm">
              {t('footer_description')}
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-300">
                <MapPin size={16} />
                <span className="text-sm">123 Education Street, Knowledge City, KC 12345</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-300">
                <Phone size={16} />
                <span className="text-sm">+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-300">
                <Mail size={16} />
                <span className="text-sm">info@core5academy.com</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-300">
                <Globe size={16} />
                <span className="text-sm">www.core5academy.com</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold mb-3">{t('quick_links')}</h4>
            <ul className="space-y-2">
              <li>
                <a href="/about" className="text-gray-300 hover:text-white transition-colors">
                  {t('about')}
                </a>
              </li>
              <li>
                <a href="/courses" className="text-gray-300 hover:text-white transition-colors">
                  {t('courses')}
                </a>
              </li>
              <li>
                <a href="/contact" className="text-gray-300 hover:text-white transition-colors">
                  {t('contact')}
                </a>
              </li>
              <li>
                <button 
                  onClick={() => window.open('/terms-conditions', '_blank')}
                  className="text-gray-300 hover:text-white transition-colors text-left w-full"
                >
                  {t('terms_conditions')}
                </button>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold mb-3">{t('legal')}</h4>
            <ul className="space-y-2">
              <li>
                <a href="/privacy" className="text-gray-300 hover:text-white transition-colors">
                  {t('privacy_policy')}
                </a>
              </li>
              <li>
                <a href="/refund" className="text-gray-300 hover:text-white transition-colors">
                  {t('refund_policy')}
                </a>
              </li>
            </ul>
          </div>

          {/* Copyright */}
          <div className="border-t border-gray-700 pt-8">
            <div className="text-center text-gray-400 text-sm">
              <p>&copy; {currentYear} Core5 Academy. {t('all_rights_reserved')}.</p>
              <p className="mt-2">
                {t('developed_by')}{' '}
                <a 
                  href="https://core5technologies.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Core5 Technologies
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Footer;
