// Brand configuration for white-label support
// Add new brands here - that's all you need to do for new clients

export interface BrandConfig {
  id: string;
  name: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
}

export const brands: Record<string, BrandConfig> = {
  'dealer-media-house': {
    id: 'dealer-media-house',
    name: 'Dealer Media House',
    logo: '/logo.png',
    primaryColor: '#4BA5A5', // Teal
    secondaryColor: '#5A5A5A', // Gray
    textColor: '#333333',
  },
  // Add more brands here as needed:
  // 'another-brand': {
  //   id: 'another-brand',
  //   name: 'Another Brand',
  //   logo: '/another-logo.png',
  //   primaryColor: '#FF5733',
  //   secondaryColor: '#333333',
  //   textColor: '#333333',
  // },
};

export const defaultBrand = brands['dealer-media-house'];

export function getBrand(brandId?: string): BrandConfig {
  if (brandId && brands[brandId]) {
    return brands[brandId];
  }
  return defaultBrand;
}

