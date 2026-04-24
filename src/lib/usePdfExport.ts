'use client';

import { useCallback, useRef, useState } from 'react';

export interface UsePdfExportOptions {
  /** Base filename (without extension or date). e.g. "Campaign_Report", "CTV_Dashboard" */
  filename: string;
  /** Optional filename suffix (e.g. a date range) appended before the generated date. */
  filenameSuffix?: string | (() => string);
}

export interface UsePdfExportResult<T extends HTMLElement> {
  /** Attach to the DOM element that should be captured into the PDF. */
  reportRef: React.RefObject<T | null>;
  /** Trigger the export. */
  exportPdf: () => Promise<void>;
  /** True while the export is running. */
  isExporting: boolean;
}

/**
 * Reusable PDF export hook used across dashboard tabs. Captures the element
 * referenced by `reportRef` and saves it as a multi-page landscape A4 PDF.
 *
 * Convention: any element inside the ref with the class `pdf-header` will be
 * temporarily shown only during capture (so dashboards can render a branded
 * header that appears in the PDF but not on-screen). The class should include
 * `hidden` in the DOM; we set `display: block` while capturing.
 */
export function usePdfExport<T extends HTMLElement = HTMLDivElement>(
  options: UsePdfExportOptions
): UsePdfExportResult<T> {
  const reportRef = useRef<T | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const el = reportRef.current;

      const pdfHeader = el.querySelector('.pdf-header') as HTMLElement | null;
      if (pdfHeader) pdfHeader.style.display = 'block';

      // Let layout settle so the pdf-header renders before capture.
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FAFBFC',
        windowWidth: 1400,
      });

      if (pdfHeader) pdfHeader.style.display = '';

      const imgWidth = 277; // landscape A4 content width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageHeight = pdf.internal.pageSize.getHeight();

      let position = 0;
      let heightLeft = imgHeight;
      const imgData = canvas.toDataURL('image/png');

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);

      while (heightLeft > 0) {
        position -= (pageHeight - 10);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 10);
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const suffixRaw = typeof options.filenameSuffix === 'function'
        ? options.filenameSuffix()
        : options.filenameSuffix;
      const suffix = suffixRaw ? `_${suffixRaw}` : '';
      pdf.save(`${options.filename}${suffix}_${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [options]);

  return { reportRef, exportPdf, isExporting };
}
