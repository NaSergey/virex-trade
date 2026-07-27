'use client';

import { memo, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Select = memo(({
  options,
  value,
  onChange,
  label,
  placeholder,
  error,
  fullWidth = true,
  className = '',
  ...props
}: SelectProps) => {
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <div className={widthClass}>
      {label && (
        <label className="block text-xs font-medium mb-2 text-muted">
          {label}
        </label>
      )}

      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${widthClass} bg-elevated border border-line rounded-lg px-3 py-2 pr-9 text-sm
            focus:border-accent-2 focus:outline-none focus:ring-1 focus:ring-accent-2 transition-colors duration-150
            hover:border-line-strong appearance-none cursor-pointer ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled className="bg-surface">
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-surface text-fg">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
      </div>

      {error && (
        <p className="mt-1.5 text-sm text-down">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
