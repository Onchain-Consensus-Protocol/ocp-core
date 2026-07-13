import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled,
  ...props
}) => {
  // Base styles: font-mono for technical feel, uppercase, spacing
  const baseStyles = "inline-flex items-center justify-center font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-md font-mono text-sm relative overflow-hidden";

  const variants = {
    primary: "bg-transparent border border-border text-text hover:border-accent hover:text-accent transition-colors",
    secondary: "bg-transparent border border-border text-text hover:border-accent transition-colors",
    danger: "bg-transparent border border-danger/50 text-danger hover:border-danger transition-colors",
    success: "bg-transparent border border-success/50 text-success hover:border-success transition-colors",
    outline: "bg-transparent border border-border text-text hover:border-accent hover:text-accent transition-colors",
    ghost: "border border-transparent text-text-muted hover:text-accent transition-colors"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-5 text-sm",
    lg: "h-12 px-8 text-base"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      <span className="flex items-center gap-2 relative z-10">
        {children}
      </span>
    </button>
  );
};