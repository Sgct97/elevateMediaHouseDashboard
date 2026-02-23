'use client';

interface FiltersProps {
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  dealerships: string[];
  selectedDealership: string;
  onDealershipChange: (dealership: string) => void;
  invoices: string[];
  selectedInvoice: string;
  onInvoiceChange: (invoice: string) => void;
  accentColor?: string;
}

export function Filters({
  dateRange,
  onDateRangeChange,
  dealerships,
  selectedDealership,
  onDealershipChange,
  invoices,
  selectedInvoice,
  onInvoiceChange,
  accentColor = '#4BA5A5',
}: FiltersProps) {
  const selectStyle = {
    borderColor: accentColor,
    color: accentColor,
  };

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

      {/* Dealership Filter */}
      <select
        value={selectedDealership}
        onChange={(e) => onDealershipChange(e.target.value)}
        className="px-4 py-2 text-sm border-2 bg-white min-w-[200px] focus:outline-none"
        style={selectStyle}
      >
        <option value="">Dealership (Campaign Title)</option>
        {dealerships.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Invoice Filter */}
      <select
        value={selectedInvoice}
        onChange={(e) => onInvoiceChange(e.target.value)}
        className="px-4 py-2 text-sm border-2 bg-white min-w-[140px] focus:outline-none"
        style={selectStyle}
      >
        <option value="">Invoice #</option>
        {invoices.map((i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>
    </div>
  );
}
