import { AppShell } from '@/components/AppShell';
import { getBrand } from '@/lib/brands';

export default function Home() {
  const brand = getBrand('dealer-media-house');

  return <AppShell brand={brand} />;
}
