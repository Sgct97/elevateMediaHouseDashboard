'use client';

import Image from 'next/image';
import { BrandConfig } from '@/lib/brands';

interface HeaderProps {
  brand: BrandConfig;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ brand, lastUpdated, onRefresh, isRefreshing = false }: HeaderProps) {
  const formatLastUpdated = (date: Date | null | undefined): string => {
    if (!date) return '—';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <header className="bg-white border-b border-[#E2E8F0] px-6 py-4">
      <div className="flex items-center justify-between">
        <Image
          src={brand.logo}
          alt={brand.name}
          width={220}
          height={70}
          className="object-contain"
          priority
        />

        <div className="flex items-center gap-6">
          <span className="text-xs text-[#718096]">
            Updated {formatLastUpdated(lastUpdated)}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
