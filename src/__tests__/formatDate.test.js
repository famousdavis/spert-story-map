import { describe, it, expect } from 'vitest';
import { formatDate } from '../lib/formatDate';

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats a date-only ISO string', () => {
    const result = formatDate('2025-03-15');
    expect(result).toBe('Mar 15, 2025');
  });

  it('formats a full ISO datetime string', () => {
    const result = formatDate('2025-06-01T14:30:00Z');
    // toLocaleDateString may shift day based on timezone, so just check it parses
    expect(result).toMatch(/\w{3} \d{1,2}, 2025/);
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});
