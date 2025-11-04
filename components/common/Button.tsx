import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
}

const Button: React.FC<ButtonProps> = ({ children, className = '', variant = 'primary', size = 'md', ...props }) => {
  // Fix: Removed padding from baseClasses to be handled by size variants.
  const baseClasses = 'rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  const variantClasses = {
    primary: 'bg-foreground text-background hover:bg-foreground/90 focus:ring-foreground',
    secondary: 'bg-card text-foreground hover:bg-card/80 border border-border focus:ring-foreground',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  // Fix: Added sizeClasses to handle different button paddings and text sizes.
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
