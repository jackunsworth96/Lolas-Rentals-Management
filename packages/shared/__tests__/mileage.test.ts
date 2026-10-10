import { describe, expect, it } from 'vitest';
import { assessMileageChange, parseInspectionKm } from '../src/utils/mileage.js';

describe('assessMileageChange', () => {
  it('flags Tanggol’s extra digit typed as a missing digit on the way back down', () => {
    const result = assessMileageChange(21000, 2100);
    expect(result.warn).toBe(true);
    expect(result.reasonRequired).toBe(true);
    expect(result.extraDigit).toBe(true);
    expect(result.message).toMatch(/missing digit/i);
    expect(result.message).toMatch(/21[,.]?000/);
    expect(result.message).toMatch(/2[,.]?100/);
  });

  it('flags an extra digit on the way up', () => {
    const result = assessMileageChange(2148, 21480);
    expect(result.warn).toBe(true);
    expect(result.extraDigit).toBe(true);
    expect(result.message).toMatch(/extra digit/i);
  });

  it('flags a ten-times reading even when the jump is under 2,000 km', () => {
    const result = assessMileageChange(100, 1000);
    expect(result.warn).toBe(true);
    expect(result.extraDigit).toBe(true);
  });

  it('does not warn on a normal increase', () => {
    const result = assessMileageChange(2148, 2500);
    expect(result).toMatchObject({ warn: false, reasonRequired: false, extraDigit: false, message: null });
  });

  it('warns when the reading jumps by 2,000 km', () => {
    const result = assessMileageChange(2148, 4148);
    expect(result.warn).toBe(true);
    expect(result.extraDigit).toBe(false);
    expect(result.message).toMatch(/higher than the last reading/i);
  });

  it('warns on any decrease', () => {
    const result = assessMileageChange(5000, 4999);
    expect(result.warn).toBe(true);
    expect(result.extraDigit).toBe(false);
    expect(result.message).toMatch(/do not go backwards/i);
  });

  it('treats a vehicle still at 0 as a first reading', () => {
    const result = assessMileageChange(0, 2100);
    expect(result.warn).toBe(false);
    expect(result.reasonRequired).toBe(false);
    expect(result.firstReading).toBe(true);
    expect(result.message).toMatch(/No previous mileage/);
  });

  it('does not warn when the reading is unchanged', () => {
    expect(assessMileageChange(21000, 21000).warn).toBe(false);
    expect(assessMileageChange(21000.04, 21000).warn).toBe(false);
  });
});

describe('parseInspectionKm', () => {
  it('returns the whole kilometers an inspection will store', () => {
    expect(parseInspectionKm('21000')).toBe(21000);
    expect(parseInspectionKm('21000.9')).toBe(21000);
  });

  it('ignores blank and zero because those do not update the vehicle', () => {
    expect(parseInspectionKm('')).toBeNull();
    expect(parseInspectionKm('0')).toBeNull();
    expect(parseInspectionKm(undefined)).toBeNull();
  });
});
