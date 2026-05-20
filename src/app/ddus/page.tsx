import { Dashboard } from '@/components/Dashboard';
import { getBrand } from '@/lib/brands';

export default function DDUSDashboardPage() {
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
