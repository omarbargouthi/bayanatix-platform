export type LanguageDef = {
  code:        string;        // BCP-47 language code, e.g. "ar", "fr"
  displayName: string;        // English name shown in admin UI
  nativeName:  string;        // Name in that language itself
  direction:   "ltr" | "rtl";
  locale:      string;        // For Intl formatting
};

// Add new languages here without changing any other code.
// The active second language is controlled by the system_config DB table.
export const LANGUAGE_REGISTRY: LanguageDef[] = [
  { code: "ar", displayName: "Arabic",    nativeName: "العربية",  direction: "rtl", locale: "ar-AE" },
  { code: "fr", displayName: "French",    nativeName: "Français", direction: "ltr", locale: "fr-FR" },
  { code: "es", displayName: "Spanish",   nativeName: "Español",  direction: "ltr", locale: "es-ES" },
  { code: "de", displayName: "German",    nativeName: "Deutsch",  direction: "ltr", locale: "de-DE" },
  { code: "zh", displayName: "Chinese",   nativeName: "中文",      direction: "ltr", locale: "zh-CN" },
  { code: "ur", displayName: "Urdu",      nativeName: "اردو",      direction: "rtl", locale: "ur-PK" },
  { code: "he", displayName: "Hebrew",    nativeName: "עברית",    direction: "rtl", locale: "he-IL" },
  { code: "ja", displayName: "Japanese",  nativeName: "日本語",    direction: "ltr", locale: "ja-JP" },
  { code: "tr", displayName: "Turkish",   nativeName: "Türkçe",   direction: "ltr", locale: "tr-TR" },
  { code: "hi", displayName: "Hindi",     nativeName: "हिन्दी",   direction: "ltr", locale: "hi-IN" },
];

export const DEFAULT_SECONDARY: LanguageDef = LANGUAGE_REGISTRY.find(l => l.code === "ar")!;

export function getLangDef(code: string): LanguageDef | undefined {
  return LANGUAGE_REGISTRY.find(l => l.code === code);
}
