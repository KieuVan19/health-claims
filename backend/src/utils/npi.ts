/**
 * Validates a US National Provider Identifier (NPI).
 * Rules: exactly 10 digits; passes the Luhn algorithm with a CMS-defined prefix constant.
 * CMS prepends "80840" to the 10-digit NPI before running Luhn, per the NPI Final Rule.
 */
export function validateNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;

  // Luhn check on the full 15-digit string "80840" + npi
  const digits = `80840${npi}`.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i]!;
    // Double every second digit from the right (0-indexed from right: positions 1,3,5,...)
    if ((digits.length - 1 - i) % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
