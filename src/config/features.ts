/**
 * Contains feature flags and configuration settings for application-wide features.
 * This allows for easy enabling, disabling, or tuning of specific behaviors.
 */

export const featureFlags = {
  splitSponsor: {
    /**
     * If true, when a sponsor's direct line is full, a new user must be placed
     * under one of the sponsor's directs. The original sponsor gets the direct
     * referral bonus, but the placement designee's line gets the unilevel bonuses.
     */
    requireDesigneeWhenFull: true,

    /**
     * If true, and a user is a result of a "split sponsor" placement, the original
     * sponsor will be skipped during unilevel commission calculations for this user's
     * subsequent activities.
     */
    skipOriginalInUnilevel: true,
  },

  /**
   * The maximum number of direct children a user can have in the unilevel tree.
   * This is the "width cap".
   */
  directWidthCap: 6,
};
