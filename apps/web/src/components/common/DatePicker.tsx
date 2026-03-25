import type { InputHTMLAttributes } from 'react';

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export function DatePicker({ label, className = '', ...props }: DatePickerProps) {
  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>}
      <input
        type="date"
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        {...props}
      />
    </div>
  );
}
