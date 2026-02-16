import { Dashboard } from '@/components/Dashboard';
import { getBrand } from '@/lib/brands';

export default function Home() {
  // Get brand from URL param, cookie, or default
  // For now, using default brand
  const brand = getBrand('dealer-media-house');

  return <Dashboard brand={brand} />;
}
