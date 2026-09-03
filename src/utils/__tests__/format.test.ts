import { derivePreview, deriveTitle, relativeTime } from '@/utils/format';

describe('deriveTitle', () => {
  it('uses the first non-empty line', () => {
    expect(deriveTitle('Hello world\nsecond line')).toBe('Hello world');
  });
  it('skips leading blank lines', () => {
    expect(deriveTitle('\n\n  Groceries\nmilk')).toBe('Groceries');
  });
  it('returns empty string for whitespace-only content', () => {
    expect(deriveTitle('   \n  ')).toBe('');
  });
});

describe('derivePreview', () => {
  it('returns text after the title line, collapsed to one line', () => {
    expect(derivePreview('Title\nfirst\nsecond')).toBe('first second');
  });
  it('is empty when there is only a title', () => {
    expect(derivePreview('Only a title')).toBe('');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-03T12:00:00').getTime();

  it('labels yesterday', () => {
    const yesterday = new Date('2026-09-02T09:00:00').getTime();
    expect(relativeTime(yesterday, now)).toBe('Yesterday');
  });

  it('shows a weekday within the last week', () => {
    const threeDaysAgo = new Date('2026-08-31T09:00:00').getTime();
    // Locale-dependent weekday name, but always a non-empty word (no slash).
    const label = relativeTime(threeDaysAgo, now);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toContain('/');
  });

  it('shows a numeric date for older notes', () => {
    const longAgo = new Date('2026-01-01T09:00:00').getTime();
    expect(relativeTime(longAgo, now)).toContain('/');
  });
});
