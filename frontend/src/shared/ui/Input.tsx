'use client';

import { memo, InputHTMLAttributes } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = memo(({
  label,
  value,
  onChange,
  error,
  required = false,
  icon,
  fullWidth = true,
  className = '',
  readOnly = false,
  ...props
}: InputProps) => {
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <div className={widthClass}>
      {label && (
        <label className="block text-xs font-medium text-muted mb-2">
          {label} {required && <span className="text-down">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          className={`${widthClass} tabular bg-elevated border border-line text-xs rounded-lg px-3 py-2  placeholder:text-subtle
            focus:border-accent-2 focus:outline-none focus:ring-1 focus:ring-accent-2 transition-colors duration-150
            hover:border-line-strong ${
            readOnly ? 'text-muted cursor-not-allowed opacity-60' : ''
          } ${error ? 'border-down/60 focus:border-down/60 focus:ring-down/30' : ''} ${className}`}
          {...props}
        />

        {icon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-sm text-down">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
