import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/components/Dashboard';
import { getBrand } from '@/lib/brands';

export default function Home() {
  const client = process.env.DASHBOARD_CLIENT?.toLowerCase();
  if (client === 'ddus') {
    return (
      <Dashboard
        brand={getBrand('dealers-direct-us')}
        clientFilter="ddus"
        hideInvoiceFilter
        hideLinkClicks
        retargetingTitle="Retargeting Performance"
        hideRetargetingCpcv
      />
    );
  }

  const brand = getBrand('dealer-media-house');
  return <AppShell brand={brand} />;
}
