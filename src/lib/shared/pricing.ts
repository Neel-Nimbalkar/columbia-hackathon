/** Round a margin price up in integer cents using the exact decimal margin. */
export function marginPriceCents(costCents: number, margin: number): number {
  if (!Number.isSafeInteger(costCents) || costCents < 0 || !Number.isFinite(margin) || margin < 0 || margin >= 1) throw new RangeError('Invalid cost or margin.');
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
