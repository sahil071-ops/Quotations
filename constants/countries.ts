export const AXIS_REGIONS = [
  { code: 'IN', name: 'India' },
  { code: 'SAARC', name: 'SAARC' },
  { code: 'MENA', name: 'MENA' },
  { code: 'AFRICA', name: 'Africa' },
  { code: 'EUROPE', name: 'Europe' },
  { code: 'OCEANIA', name: 'Oceania' },
  { code: 'NA', name: 'North America' },
  { code: 'SA', name: 'South America' },
  { code: 'SEA', name: 'South East Asia' },
];

export const REGION_MAP = Object.fromEntries(
  AXIS_REGIONS.map((r) => [r.code, r.name])
);

// Legacy alias so existing imports of AXIS_COUNTRIES still work
export const AXIS_COUNTRIES = AXIS_REGIONS;
export const COUNTRY_MAP = REGION_MAP;

