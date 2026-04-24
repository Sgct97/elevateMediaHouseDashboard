import { BrandConfig } from '@/lib/brands';

interface Props {
  brand: BrandConfig;
  title: string;
  /** Optional subtitle line (e.g. date range or active filters). */
  subtitle?: string;
}

/**
 * Branded header rendered inside the PDF capture area. Hidden on-screen (via
 * the `hidden` class) and toggled visible during capture by `usePdfExport`.
 */
export function PdfHeader({ brand, title, subtitle }: Props) {
  return (
    <div className="pdf-header hidden mb-6">
      <div
        className="flex items-center justify-between pb-4 border-b-2"
        style={{ borderColor: brand.primaryColor }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt={brand.name} className="h-14 object-contain" />
        <div className="text-right">
          <h2 className="text-xl font-light text-[#2D3748]">{title}</h2>
          {subtitle && (
            <p className="text-xs text-[#718096] mt-1">{subtitle}</p>
          )}
          <p className="text-[10px] text-[#A0AEC0] mt-0.5">
            Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
