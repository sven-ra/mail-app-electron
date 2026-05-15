export function getUserLocale(): string | undefined {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return undefined;
}

export function parseEmailDate(dateValue: string | undefined): Date | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatInboxRowDate(dateValue: string | undefined): string {
  const date = parseEmailDate(dateValue);
  if (!date) return '';

  const locale = getUserLocale();
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString(locale);
}

export function formatEmailDetailDate(dateValue: string | undefined): string {
  const date = parseEmailDate(dateValue);
  if (!date) return '';

  const locale = getUserLocale();
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
