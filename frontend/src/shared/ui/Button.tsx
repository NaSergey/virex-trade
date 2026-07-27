'use client';

import { memo, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button = memo(({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) => {

  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg cursor-pointer transition-colors duration-150 sheen ' +
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none';

  const variantStyles = {
    primary: 'bg-accent text-white hover:bg-accent-soft',
    secondary: 'bg-elevated text-fg border border-line hover:border-line-strong hover:bg-elevated-2',
    outline: 'bg-transparent text-fg border border-line hover:border-line-strong hover:bg-elevated',
    ghost: 'bg-transparent text-muted hover:text-fg hover:bg-elevated',
    danger: 'bg-down/15 text-down border border-down/40 hover:bg-down/25',
  };

  const sizeStyles = {
    sm: 'px-3.5 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  const combinedClassName =
    `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`.trim();

  return (
    <button className={combinedClassName} {...props}>
      {children}
    </button>
  );
});

Button.displayName = 'Button';
