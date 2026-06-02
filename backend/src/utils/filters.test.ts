import { describe, it, expect } from 'vitest';
import { parseDateRange, buildSearchWhere } from './filters';

describe('filters utility', () => {
  describe('parseDateRange', () => {
    it('returns undefined when no dates provided', () => {
      expect(parseDateRange()).toBeUndefined();
      expect(parseDateRange(undefined, undefined)).toBeUndefined();
    });

    it('parses from date only', () => {
      const result = parseDateRange('2024-01-15');
      expect(result).toEqual({
        gte: new Date('2024-01-15'),
      });
    });

    it('parses to date and sets to end of day', () => {
      const result = parseDateRange(undefined, '2024-01-15');
      expect(result?.lte?.getHours()).toBe(23);
      expect(result?.lte?.getMinutes()).toBe(59);
      expect(result?.lte?.getSeconds()).toBe(59);
      expect(result?.lte?.getMilliseconds()).toBe(999);
    });

    it('parses both from and to dates', () => {
      const result = parseDateRange('2024-01-01', '2024-01-31');
      expect(result?.gte).toEqual(new Date('2024-01-01'));
      expect(result?.lte?.getHours()).toBe(23);
    });
  });

  describe('buildSearchWhere', () => {
    it('returns undefined when no search term provided', () => {
      expect(buildSearchWhere(undefined, ['field1', 'field2'])).toBeUndefined();
      expect(buildSearchWhere('', ['field1'])).toBeUndefined();
    });

    it('builds OR filter for single field', () => {
      const result = buildSearchWhere('test', ['description']);
      expect(result).toEqual({
        OR: [{ description: { contains: 'test' } }],
      });
    });

    it('builds OR filter for multiple fields', () => {
      const result = buildSearchWhere('test', ['description', 'notes', 'claimNumber']);
      const orArray = (result?.OR as unknown[]) || [];
      expect(orArray).toHaveLength(3);
      expect(orArray[0]).toEqual({ description: { contains: 'test' } });
      expect(orArray[1]).toEqual({ notes: { contains: 'test' } });
      expect(orArray[2]).toEqual({ claimNumber: { contains: 'test' } });
    });
  });
});
