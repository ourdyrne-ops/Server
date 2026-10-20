export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🌐' },
];

export const DEFAULT_LANGUAGE = 'en';

export function isLanguageSupported(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

export function getLanguageName(code: string): string {
  const found = SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
  return found ? `${found.nativeName} (${found.name})` : code;
}
