import React from 'react';
import type { ToastProps } from '../types';

function Toast({ message, type }: ToastProps): JSX.Element {
  const iconMap: Record<ToastProps['type'], string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{iconMap[type]}</span>
      <span className="toast-message">{message}</span>
    </div>
  );
}

export default Toast;
