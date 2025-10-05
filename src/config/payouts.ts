/**
 * Calculates the tiered monthly ROI rate based on the package value.
 * Rates are from the "Package & Earnings Structure" on page 19 of the PDF.
 * @param packageUSD The user's package investment in USD.
 * @returns The ROI rate as a decimal (e.g., 0.16 for 16%).
 */
export function getTieredROIRate(packageUSD: number): number {
  if (packageUSD >= 10000) return 0.16; // 16%
  if (packageUSD >= 5000) return 0.14;  // 14%
  if (packageUSD >= 2000) return 0.12;  // 12%
  if (packageUSD >= 1000) return 0.10;  // 10%
  if (packageUSD >= 500) return 0.08;   // 8%
  if (packageUSD >= 100) return 0.06;   // 6%
  if (packageUSD >= 50) return 0.05;    // 5%
  return 0; // No ROI for packages less than 50
}

export const DIRECT_REFERRAL_PCT = 0.10; // 10%

// Unilevel bonuses for levels 1 through 6
export const UNILEVEL_PCTS = [
  0.10, // Level 1: 10%
  0.06, // Level 2: 6%
  0.05, // Level 3: 5%
  0.04, // Level 4: 4%
  0.03, // Level 5: 3%
  0.02, // Level 6: 2%
];
