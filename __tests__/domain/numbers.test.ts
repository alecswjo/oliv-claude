import { parseNumericInput } from '@/domain/numbers';

describe('parseNumericInput', () => {
  it.each([
    ['1200', 1200],
    ['1,200', 1200], // thousands comma — the old parser made this 1.2 kcal
    ['1,200,000', 1200000],
    ['12,5', 12.5], // decimal comma
    ['1.5', 1.5],
    ['1,234.5', 1234.5],
    ['1.234,5', 1234.5],
    [' 250 ', 250],
    ['', 0],
    ['abc', 0],
  ])('parses %s → %s', (input, expected) => {
    expect(parseNumericInput(input)).toBe(expected);
  });
});
