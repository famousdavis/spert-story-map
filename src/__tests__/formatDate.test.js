import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, parseDate, formatRelativeTime } from '../lib/formatDate';

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

describe('parseDate', () => {
  it('returns null for falsy input', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(0)).toBeNull();
  });

  it('returns the same Date object for Date input', () => {
    const d = new Date('2025-06-01T12:00:00Z');
    expect(parseDate(d)).toBe(d);
  });

  it('handles Firestore Timestamp objects with toDate()', () => {
    const expected = new Date('2025-06-01T12:00:00Z');
    const fakeTimestamp = { toDate: () => expected };
    expect(parseDate(fakeTimestamp)).toBe(expected);
  });

  it('parses an ISO string', () => {
    const result = parseDate('2025-06-01T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-06-01T12:00:00.000Z');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns "just now" for dates within 10 seconds', () => {
    vi.setSystemTime(new Date('2025-06-01T12:00:05Z'));
    expect(formatRelativeTime(new Date('2025-06-01T12:00:00Z'))).toBe('just now');
  });

  it('returns seconds ago for dates within 60 seconds', () => {
    vi.setSystemTime(new Date('2025-06-01T12:00:30Z'));
    expect(formatRelativeTime(new Date('2025-06-01T12:00:00Z'))).toBe('30s ago');
  });

  it('returns minutes ago for dates within 60 minutes', () => {
    vi.setSystemTime(new Date('2025-06-01T12:05:00Z'));
    expect(formatRelativeTime(new Date('2025-06-01T12:00:00Z'))).toBe('5m ago');
  });

  it('returns time string for dates older than 60 minutes', () => {
    vi.setSystemTime(new Date('2025-06-01T14:00:00Z'));
    const result = formatRelativeTime(new Date('2025-06-01T12:00:00Z'));
    expect(result).toBeTruthy();
    expect(result).not.toContain('ago');
  });
});
