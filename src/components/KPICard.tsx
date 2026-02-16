'use client';

interface KPICardProps {
  title: string;
  value: string | number;
  loading?: boolean;
  format?: 'number' | 'percentage' | 'raw';
}

export function KPICard({ title, value, loading = false, format = 'number' }: KPICardProps) {
  const formatValue = (val: string | number): string => {
    if (loading) return '—';
    if (val === null || val === undefined) return '—';
    
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    
    if (format === 'percentage') {
      return `${numVal.toFixed(2)}%`;
    }
    
    if (format === 'number' && typeof numVal === 'number') {
      return numVal.toLocaleString();
    }
    
    return String(val);
  };

  return (
    <div className="bg-white border border-[#E2E8F0] p-5">
      <p className="text-xs uppercase tracking-wide text-[#718096] mb-3 font-medium">
        {title}
      </p>
      <p className={`text-2xl font-semibold text-[#2D3748] tabular-nums ${loading ? 'opacity-40' : ''}`}>
        {formatValue(value)}
      </p>
    </div>
  );
}
