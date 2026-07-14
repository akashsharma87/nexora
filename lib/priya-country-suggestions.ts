// Autocomplete suggestions for Property.country input fields — helps staff enter a value that
// matches exactly what calling-server/server.js checks (case-insensitive) to pick Priya's
// language/accent tier. Country stays free text (not an enum) so unlisted countries still work
// and fall back to neutral English — this list just reduces typos on the common ones.
// Keep in sync with INDIAN_ACCENT_ENGLISH_COUNTRIES in calling-server/server.js.
export const PRIYA_COUNTRY_SUGGESTIONS = [
  'India',
  'UAE',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Nepal',
  'Bhutan',
  'Sri Lanka',
  'Bangladesh',
  'Singapore',
  'Malaysia',
  'Maldives',
  'Mauritius',
]
