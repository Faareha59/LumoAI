import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const Button: React.FC<ButtonProps> = ({ children, className = '', variant = 'primary', size = 'md', ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-black/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-transparent',
    secondary: 'bg-white text-black border border-gray-200 hover:bg-gray-50 shadow-sm hover:shadow hover:-translate-y-0.5',
    danger: 'bg-black text-white border border-transparent hover:bg-gray-900',
    outline: 'bg-transparent border border-input hover:bg-accent hover:text-accent-foreground',
    ghost: 'bg-transparent hover:bg-gray-100 text-black hover:text-black',
  };

  const sizeClasses = {
    xs: 'px-2 py-1 text-[10px] rounded-sm',
    sm: 'px-3 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-lg',
  };

  // Fallback if variant not found
  const vClass = (variantClasses as any)[variant] || variantClasses.primary;

  return (
    <button
      className={`${baseClasses} ${vClass} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
