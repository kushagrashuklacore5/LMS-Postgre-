import React from 'react';
import './QuotaLimitModal.css';

const QuotaLimitModal = ({ isOpen, onClose, quotaDetails }) => {
  if (!isOpen) return null;

  const {
    type = 'quota', // 'quota' or 'feature'
    resourceType = 'resource',
    currentUsage = 0,
    limit = 0,
    message = 'Your account is in free tier. Please contact your administrator to use the full feature.'
  } = quotaDetails || {};

  const handleContactAdmin = () => {
    // You can add email functionality here
    console.log('Contact administrator requested');
  };

  return (
    <div className="quota-modal-overlay">
      <div className="quota-modal-container">
        {/* Header */}
        <div className="quota-modal-header">
          <h2>
            {type === 'quota' ? '📊 Quota Limit Reached' : '🔒 Feature Not Available'}
          </h2>
          <button className="quota-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="quota-modal-body">
          <p className="quota-modal-message">{message}</p>

          {type === 'quota' && currentUsage !== undefined && limit !== undefined && (
            <div className="quota-usage-info">
              <p className="quota-label">Current Usage:</p>
              <div className="quota-bar-container">
                <div 
                  className="quota-bar-fill" 
                  style={{ width: `${Math.min((currentUsage / limit) * 100, 100)}%` }}
                ></div>
              </div>
              <p className="quota-stat">
                <span className="quota-current">{currentUsage}</span>
                <span className="quota-separator">/</span>
                <span className="quota-limit">{limit}</span>
              </p>
              <p className="quota-resource-type">
                {resourceType } {currentUsage === limit ? 'limit reached' : 'available'}
              </p>
            </div>
          )}

          <div className="quota-tier-info">
            <h3>Upgrade Your Plan</h3>
            <p>
              Unlock unlimited {resourceType}s by upgrading to a higher tier. 
              Contact your administrator for more information about available plans.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="quota-modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={handleContactAdmin}>
            Contact Administrator
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuotaLimitModal;
