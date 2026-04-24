'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  accentColor: string;
  disabled?: boolean;
  /** Singular label for the entity being selected, e.g. 'publisher' or 'campaign'. Defaults to 'option'. */
  entityLabel?: string;
  /** Plural form of the entity label. Defaults to `${entityLabel}s`. */
  entityLabelPlural?: string;
}

export function PublisherMultiSelect({ options, selected, onChange, accentColor, disabled, entityLabel = 'option', entityLabelPlural }: Props) {
  const pluralLabel = entityLabelPlural || `${entityLabel}s`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, query]);

  const allSelected = selected.size === 0 || selected.size === options.length;
  const selectedCount = selected.size === 0 ? options.length : selected.size;

  const toggle = (pub: string) => {
    const next = new Set(selected.size === 0 ? options : selected);
    if (next.has(pub)) next.delete(pub);
    else next.add(pub);
    if (next.size === options.length) onChange(new Set());
    else onChange(next);
  };

  const selectAll = () => onChange(new Set());
  const clearAll = () => onChange(new Set(['__none__']));

  const filteredAllChecked = filtered.length > 0 && filtered.every(p => (selected.size === 0 ? true : selected.has(p)));
  const toggleFilteredAll = () => {
    const current = new Set(selected.size === 0 ? options : selected);
    if (filteredAllChecked) {
      filtered.forEach(p => current.delete(p));
    } else {
      filtered.forEach(p => current.add(p));
    }
    if (current.size === options.length) onChange(new Set());
    else onChange(current);
  };

  const label = allSelected
    ? `All (${options.length})`
    : selected.has('__none__')
    ? 'None'
    : `${selected.size} selected`;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="px-3 py-1.5 text-xs border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#CBD5E0] min-w-[260px] max-w-[420px] text-left flex items-center justify-between gap-2 disabled:opacity-50"
      >
        <span className="truncate text-[#2D3748]">{label}</span>
        <span className="text-[10px] text-[#A0AEC0]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[360px] bg-white border border-[#E2E8F0] shadow-lg z-50">
          <div className="p-2 border-b border-[#F1F5F9]">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${pluralLabel}...`}
              className="w-full px-2 py-1.5 text-xs border border-[#E2E8F0] focus:outline-none focus:border-[#CBD5E0]"
              autoFocus
            />
          </div>

          <div className="px-3 py-2 border-b border-[#F1F5F9] flex items-center justify-between text-[11px]">
            <span className="text-[#A0AEC0]">{selectedCount} of {options.length}</span>
            <div className="flex gap-3">
              <button onClick={selectAll} className="hover:underline" style={{ color: accentColor }}>Select all</button>
              <button onClick={clearAll} className="hover:underline text-[#718096]">Clear</button>
            </div>
          </div>

          {query && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-3 py-1.5 border-b border-[#F1F5F9] cursor-pointer hover:bg-[#FAFBFC] text-[11px] text-[#718096]">
              <input
                type="checkbox"
                checked={filteredAllChecked}
                onChange={toggleFilteredAll}
                style={{ accentColor }}
              />
              <span>{filteredAllChecked ? 'Deselect' : 'Select'} {filtered.length} matching</span>
            </label>
          )}

          <div className="max-h-[280px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#A0AEC0]">No {pluralLabel} match</div>
            ) : (
              filtered.map(pub => {
                const isChecked = selected.size === 0 ? true : selected.has(pub);
                return (
                  <label
                    key={pub}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#FAFBFC] text-xs text-[#2D3748]"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(pub)}
                      style={{ accentColor }}
                    />
                    <span className="truncate">{pub}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
