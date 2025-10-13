/**
 * Calculates the tiered monthly ROI rate based on the package value.
 * Rates are from the "Package & Earnings Structure" on page 19 of the PDF.
 * @param packageUSD The user's package investment in USD.
 * @returns The ROI rate as a decimal (e.g., 0.16 for 16%).
 */
export function getTieredROIRate(packageUSD: number): number {
  if (packageUSD >= 10000) return 0.16; // 16% (Crown)
  if (packageUSD >= 5000) return 0.14;  // 14% (Diamond)
  if (packageUSD >= 2500) return 0.12;  // 12% (Titanium)
  if (packageUSD >= 1000) return 0.10;  // 10% (Platinum)
  if (packageUSD >= 500) return 0.08;   // 8% (Gold)
  if (packageUSD >= 300) return 0.07;   // 7% (Silver - interpolated)
  if (packageUSD >= 100) return 0.06;   // 6% (Bronze)
  if (packageUSD >= 50) return 0.05;    // 5% (Starter)
  return 0; // No ROI for packages less than 50
}

// The direct bonus percentage paid to the original sponsor on a user's FIRST deposit.
export const FIRST_DEPOSIT_DIRECT_BONUS_PCT = 0.10; // 10%

// The direct bonus percentage paid to the PARENT on all SUBSEQUENT deposits (package upgrades).
export const SUBSEQUENT_DEPOSIT_DIRECT_BONUS_PCT = 0.10; // 10% - Currently the same, but can be changed independently.

// Unilevel bonuses for levels 1 through 6
export const UNILEVEL_PCTS = [
  0.10, // Level 1: 10%
  0.06, // Level 2: 6%
  0.05, // Level 3: 5%
  0.04, // Level 4: 4%
  0.03, // Level 5: 3%
  0.02, // Level 6: 2%
];

/**
 * Calculates the tiered reinvestment bonus percentage based on the number of previous deposits.
 * @param depositCount The number of VERIFIED deposits the user has already made.
 * @returns The bonus rate as a decimal (e.g., 0.08 for 8%).
 */
export function getReinvestmentBonusPct(depositCount: number): number {
  switch (depositCount) {
    case 1: return 0.08; // R1: 8%
    case 2: return 0.06; // R2: 6%
    case 3: return 0.05; // R3: 5%
    case 4: return 0.04; // R4: 4%
    case 5: return 0.03; // R5: 3%
    default: return 0.02; // R6 and onwards: 2%
  }
}
