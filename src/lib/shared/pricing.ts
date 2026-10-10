/** A percentage from an input (12.3) as an exact margin fraction (0.123). */
export const percentToMargin = (percent: number) => Number((percent / 100).toPrecision(12));

/** Round a margin price up in integer cents using the exact decimal margin. */
export function marginPriceCents(costCents: number, margin: number): number {
  if (!Number.isSafeInteger(costCents) || costCents < 0 || !Number.isFinite(margin) || margin < 0 || margin >= 1) throw new RangeError('Invalid cost or margin.');
  // Percent inputs arrive as e.g. 12.3 / 100 = 0.12300000000000001; price the intended decimal, not the float noise.
  margin = Number(margin.toPrecision(12));
  if (margin >= 1) throw new RangeError('Invalid cost or margin.');
  const [decimal, exponent = '0'] = String(margin).split('e');
  const places = (decimal!.split('.')[1]?.length ?? 0) - Number(exponent);
  const numerator = BigInt(decimal!.replace('.', '')) * 10n ** BigInt(Math.max(0, -places));
  const denominator = 10n ** BigInt(Math.max(0, places));
  const divisor = denominator - numerator;
  const cost = BigInt(costCents) * denominator;
  const result = Number((cost + divisor - 1n) / divisor);
  if (!Number.isSafeInteger(result)) throw new RangeError('Price is too large.');
  return result;
}
