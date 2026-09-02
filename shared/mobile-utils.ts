/** Normalise SA mobile numbers to E.164 (+27...). */
export function normaliseMobile(raw: string): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && digits.length >= 11) return "+" + digits;
  if (digits.length >= 9) return "+27" + digits;
  return digits.length >= 7 ? "+27" + digits : null;
}

export function phoneToPlaceholderEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `p${digits}@phone.lekker.chat`;
}

export function phoneToUsername(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-12);
  return `u_${digits}`;
}