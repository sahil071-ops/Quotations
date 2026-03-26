'use client';

import { AXIS_COUNTRIES } from '@/constants/countries';

interface CountrySelectorProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function CountrySelector({ value, onChange, disabled, className }: CountrySelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900 disabled:bg-gray-50 disabled:text-gray-500 ${className ?? ''}`}
    >
      <option value="">Select country...</option>
      {AXIS_COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}
