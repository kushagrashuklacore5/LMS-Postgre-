import React from 'react';

const ProgressBar = ({ progress, showLabel = false, size = 'md' }) => {
  const getProgressColor = () => {
    if (progress === 100) return 'from-success to-success/80';
    if (progress >= 70) return 'from-primary to-secondary';
    if (progress >= 40) return 'from-warning to-warning/80';
    return 'from-text/30 to-text/40';
  };

  const getHeight = () => {
    switch (size) {
      case 'sm': return 'h-1.5';
      case 'lg': return 'h-3';
      default: return 'h-2';
    }
  };

  const getLabelSize = () => {
    switch (size) {
      case 'sm': return 'text-xs';
      case 'lg': return 'text-sm';
      default: return 'text-xs';
    }
  };

  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className={`font-medium ${getLabelSize()} text-text`}>
            Progress
          </span>
          <span className={`font-semibold ${getLabelSize()} text-text`}>
            {safeProgress}%
          </span>
        </div>
      )}
      
      <div className="w-full bg-background rounded-full overflow-hidden">
        <div
          className={`bg-gradient-to-r ${getProgressColor()} ${getHeight()} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${safeProgress}%`, maxWidth: '100%' }}
        >
          {safeProgress > 0 && safeProgress < 100 && (
            <div className="h-full w-full bg-gradient-to-r from-white/20 to-transparent"></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;