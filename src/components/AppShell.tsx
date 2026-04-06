'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dashboard } from './Dashboard';
import { CTVDashboard } from './CTVDashboard';
import { PacingDashboard } from './PacingDashboard';
import { BrandConfig } from '@/lib/brands';

interface AppShellProps {
  brand: BrandConfig;
}

const TABS = [
  { id: 'email', label: 'Email Campaigns' },
  { id: 'ctv', label: 'CTV Dashboard' },
  { id: 'pacing', label: 'Pacing Report' },
] as const;

type TabId = typeof TABS[number]['id'];

export function AppShell({ brand }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('email');

  return (
    <div className="flex min-h-screen">
      <nav className="w-52 bg-white border-r border-[#E2E8F0] flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[#E2E8F0]">
          <Image
            src={brand.logo}
            alt={brand.name}
            width={160}
            height={50}
            className="object-contain"
            priority
          />
        </div>

        <div className="flex-1 py-3 px-3 space-y-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2.5 text-[13px] rounded transition-all ${
                  isActive
                    ? 'font-semibold text-white shadow-sm'
                    : 'text-[#4A5568] hover:bg-[#F7F8FA] hover:text-[#2D3748] font-medium'
                }`}
                style={isActive ? { backgroundColor: brand.primaryColor } : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] text-[10px] text-[#A0AEC0] tracking-wide uppercase">
          Powered by Elevate
        </div>
      </nav>

      <main className="flex-1 min-w-0">
        {activeTab === 'email' && <Dashboard brand={brand} />}
        {activeTab === 'ctv' && <CTVDashboard brand={brand} />}
        {activeTab === 'pacing' && <PacingDashboard brand={brand} />}
      </main>
    </div>
  );
}
