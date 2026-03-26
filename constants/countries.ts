export const AXIS_COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'AE', name: 'UAE' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'QA', name: 'Qatar' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'OM', name: 'Oman' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
];

export const COUNTRY_MAP = Object.fromEntries(
  AXIS_COUNTRIES.map((c) => [c.code, c.name])
);
