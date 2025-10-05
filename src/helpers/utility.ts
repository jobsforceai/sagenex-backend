/**
 * A utility function to format a date.
 * @param date The date to format.
 * @returns A formatted date string.
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  }).format(date);
};

/**
 * A utility function to capitalize the first letter of a string.
 * @param text The string to capitalize.
 * @returns The capitalized string.
 */
export const capitalize = (text: string): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};
