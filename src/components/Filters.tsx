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

  return (
    <div className="flex flex-wrap gap-3">
      {/* Date Range */}
      <select
        value={`${dateRange.start}|${dateRange.end}`}
        onChange={(e) => {
          const [start, end] = e.target.value.split('|');
          onDateRangeChange({ start, end });
        }}
        className="px-4 py-2 text-sm border-2 bg-white min-w-[180px] focus:outline-none"
        style={selectStyle}
      >
        <option value="|">Select date range</option>
        <option value="last7|today">Last 7 days</option>
        <option value="last30|today">Last 30 days</option>
        <option value="last90|today">Last 90 days</option>
        <option value="thisYear|today">This year</option>
        <option value="all|all">All time</option>
      </select>

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
