'use client';

import { useState, useMemo, useEffect } from 'react';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  title: string;
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  pageSize?: number;
  accentColor?: string;
  defaultSortKey?: keyof T;
  defaultSortDirection?: 'asc' | 'desc';
  onHideRow?: (row: T) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  title,
  data,
  columns,
  loading = false,
  pageSize = 10,
  accentColor = '#4BA5A5',
  defaultSortKey = null as unknown as keyof T,
  defaultSortDirection = 'desc',
  onHideRow,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    
    const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 'null';
    
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      
      // Nulls/empty always go to the bottom regardless of sort direction
      const aEmpty = isEmpty(aVal);
      const bEmpty = isEmpty(bVal);
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      
      // Try parsing as dates (handles "MM/DD/YYYY HH:MM:SS" format from API)
      const aDate = new Date(aStr);
      const bDate = new Date(bStr);
      if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
        return sortDirection === 'asc' 
          ? aDate.getTime() - bDate.getTime() 
          : bDate.getTime() - aDate.getTime();
      }
      
      // Try parsing as numbers (handles string numbers like "70000")
      const aNum = parseFloat(aStr);
      const bNum = parseFloat(bStr);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr) 
        : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  // Clamp page when data shrinks (e.g. after hiding rows)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  return (
    <div className="bg-white border border-[#E2E8F0]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E2E8F0]">
        <h3 className="text-base font-semibold" style={{ color: accentColor }}>
          {title}
        </h3>
      </div>
      
      {loading ? (
        <div className="p-8 text-center text-[#718096] text-sm">
          Loading...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#F8FAFB' }}>
                  {onHideRow && (
                    <th className="w-8 border-b border-[#E2E8F0]" />
                  )}
                  {columns.map((col) => (
                    <th
                      key={String(col.key)}
                      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide border-b border-[#E2E8F0] ${
                        col.sortable !== false ? 'cursor-pointer select-none' : ''
                      } ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                      style={{ color: accentColor }}
                      onClick={() => col.sortable !== false && handleSort(col.key)}
                    >
                      {col.header}
                      {sortKey === col.key && (
                        <span className="ml-1 text-[10px]">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td 
                      colSpan={columns.length + (onHideRow ? 1 : 0)} 
                      className="px-5 py-12 text-center text-[#718096] text-sm"
                    >
                      No data available
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className="border-b border-[#F1F5F9] hover:bg-[#F8FAFB] group"
                    >
                      {onHideRow && (
                        <td className="w-8 text-center">
                          <button
                            onClick={() => onHideRow(row)}
                            className="opacity-0 group-hover:opacity-100 text-[#CBD5E0] hover:text-[#E53E3E] transition-all text-xs"
                            title="Hide this drop"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td 
                          key={String(col.key)} 
                          className={`px-5 py-3 text-sm text-[#2D3748] ${
                            col.align === 'right' ? 'text-right tabular-nums' : ''
                          }`}
                        >
                          {col.render 
                            ? col.render(row[col.key], row)
                            : String(row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {sortedData.length > 0 && (
            <div className="px-5 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-sm text-[#718096]">
              <span>
                {startIndex + 1}–{Math.min(startIndex + pageSize, sortedData.length)} of {sortedData.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center border border-[#E2E8F0] text-[#718096] hover:bg-[#F8FAFB] disabled:opacity-30"
                >
                  ‹
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center border border-[#E2E8F0] text-[#718096] hover:bg-[#F8FAFB] disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
