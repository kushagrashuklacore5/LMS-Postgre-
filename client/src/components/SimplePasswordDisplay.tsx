import React from 'react';

interface SimplePasswordDisplayProps {
  password: string;
  vendorEmail: string;
  onClose: () => void;
}

export default function SimplePasswordDisplay({ password, vendorEmail, onClose }: SimplePasswordDisplayProps) {
  console.log('SimplePasswordDisplay rendered with:', { password, vendorEmail });

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '12px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
          🎉 Vendor Added Successfully!
        </h2>
        
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Vendor Email:</p>
          <p style={{ fontWeight: 'bold', color: '#1f2937' }}>{vendorEmail}</p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Generated Password:</p>
          <div style={{ 
            backgroundColor: '#dbeafe', 
            padding: '12px', 
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#1e40af',
            textAlign: 'center'
          }}>
            {password}
          </div>
        </div>
        
        <div style={{ 
          backgroundColor: '#fef3c7', 
          padding: '12px', 
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#92400e'
        }}>
          ⚠️ Please copy this password now and share it with the vendor. This will disappear in 5 seconds.
        </div>
        
        <button
          onClick={onClose}
          style={{
            width: '100%',
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
