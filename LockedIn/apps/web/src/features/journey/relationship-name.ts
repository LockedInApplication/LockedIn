export function knownPartnerName(value?: string | null, email?: string): string | undefined {
  const name = value?.trim();
  if (name && name.toLowerCase() !== "your partner" && name !== email) return name;
}
