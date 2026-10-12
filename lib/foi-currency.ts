// FOI fees currency — configured in system_config as `foi_currency_code`
// (Administration → Configuration → FOI Settings). Safe to import client-side.

export const FOI_CURRENCY_CONFIG_KEY = "foi_currency_code";
export const DEFAULT_FOI_CURRENCY = "SAR";

// True for a 3-letter ISO 4217 code the runtime knows how to format.
export function isValidCurrencyCode(code: unknown): code is string {
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

export function normalizeCurrencyCode(code: unknown): string {
  const upper = typeof code === "string" ? code.trim().toUpperCase() : "";
  return isValidCurrencyCode(upper) ? upper : DEFAULT_FOI_CURRENCY;
}

// "SAR 1,234.00" — code first, Western digits, matching the existing FOI screens.
export function formatFoiAmount(amount: number, currency: string | null | undefined, fractionDigits = 2): string {
  const n = Number(amount).toLocaleString("en-US", { minimumFractionDigits: fractionDigits });
  return `${currency || DEFAULT_FOI_CURRENCY} ${n}`;
}
