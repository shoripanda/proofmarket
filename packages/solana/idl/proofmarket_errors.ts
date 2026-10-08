export const ProofmarketErrorCode = {
  Paused: 6000,
  Unauthorized: 6001,
  InvalidMint: 6002,
  InvalidTreasury: 6003,
  InvalidAmount: 6004,
  InvalidWitnessConfig: 6005,
  DeadlineInPast: 6006,
  AmountOverflow: 6007,
  InvalidStatus: 6008,
  InvalidRoot: 6009,
  InvalidRecipients: 6010,
  RecipientCountMismatch: 6011,
  RecipientAccountMismatch: 6012,
  InsufficientVaultBalance: 6013,
  NotExpired: 6014,
  AmountIncrease: 6015,
};

export type ProofmarketErrorName = keyof typeof ProofmarketErrorCode;
