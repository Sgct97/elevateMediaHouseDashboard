'use client';

import { useState, useRef, useEffect } from 'react';

interface FiltersProps {
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  dealerships: string[];
  selectedDealerships: Set<string>;
  onDealershipsChange: (dealerships: Set<string>) => void;
  invoices: string[];
  selectedInvoices: Set<string>;
  onInvoicesChange: (invoices: Set<string>) => void;
  accentColor?: string;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  accentColor,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  const displayText = selected.size === 0
    ? label
    : selected.size === 1
      ? Array.from(selected)[0]
      : `${selected.size} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="px-4 py-2 text-sm border-2 bg-white min-w-[200px] text-left flex items-center justify-between gap-2 focus:outline-none"
        style={{ borderColor: accentColor, color: selected.size > 0 ? '#2D3748' : accentColor }}
      >
        <span className="truncate">{displayText}</span>
        <span className="text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E2E8F0] shadow-lg max-h-60 overflow-y-auto">
          {selected.size > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-[#F8FAFB] transition-colors"
              style={{ color: accentColor }}
            >
              Clear all
            </button>
          )}
          {options.map(option => (
            <label
              key={option}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#4A5568] hover:bg-[#F8FAFB] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(option)}
                onChange={() => toggle(option)}
                className="accent-current"
                style={{ accentColor }}
              />
              <span className="truncate">{option}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-[#A0AEC0]">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}

export function Filters({
  dateRange,
  onDateRangeChange,
  dealerships,
  selectedDealerships,
  onDealershipsChange,
  invoices,
  selectedInvoices,
  onInvoicesChange,
  accentColor = '#4BA5A5',
}: FiltersProps) {
  const inputStyle = {
    borderColor: accentColor,
    color: '#2D3748',
  };

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Date Range - Calendar Pickers */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateRange.start}
          onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
          className="px-3 py-2 text-sm border-2 bg-white focus:outline-none cursor-pointer"
          style={inputStyle}
          placeholder="Start date"
        />
        <span className="text-sm text-[#718096]">to</span>
        <input
          type="date"
          value={dateRange.end}
          onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
          className="px-3 py-2 text-sm border-2 bg-white focus:outline-none cursor-pointer"
          style={inputStyle}
          placeholder="End date"
        />
        {(dateRange.start || dateRange.end) && (
          <button
            onClick={() => onDateRangeChange({ start: '', end: '' })}
            className="px-2 py-2 text-sm text-[#718096] hover:text-[#2D3748] transition-colors"
            title="Clear dates"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dealership Filter - Multi-select */}
      <MultiSelectDropdown
        label="Dealership (Campaign Title)"
        options={dealerships}
        selected={selectedDealerships}
        onChange={onDealershipsChange}
        accentColor={accentColor}
      />

      {/* Invoice Filter - Multi-select */}
      <MultiSelectDropdown
        label="Invoice #"
        options={invoices}
        selected={selectedInvoices}
        onChange={onInvoicesChange}
        accentColor={accentColor}
      />
    </div>
  );
}
