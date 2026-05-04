import { describe, expect, it } from 'vitest';
import { IdSchema, TimestampSchema } from './common.js';

describe('IdSchema', () => {
  it('accepts non-empty strings', () => {
    expect(IdSchema.parse('topic_1')).toBe('topic_1');
  });

  it('rejects empty strings', () => {
    expect(() => IdSchema.parse('')).toThrow();
  });

  it('rejects non-strings', () => {
    expect(() => IdSchema.parse(123)).toThrow();
  });
});

describe('TimestampSchema', () => {
  it('accepts non-negative integers', () => {
    expect(TimestampSchema.parse(0)).toBe(0);
    expect(TimestampSchema.parse(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('rejects negative numbers', () => {
    expect(() => TimestampSchema.parse(-1)).toThrow();
  });

  it('rejects floats', () => {
    expect(() => TimestampSchema.parse(1.5)).toThrow();
  });
});
