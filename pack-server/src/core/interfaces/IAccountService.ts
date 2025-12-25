export interface IAccountService {
  /**
   * Get account details and validate API key
   * @param accountId - Firestore document ID
   * @param apiKey - API key to validate against stored key
   * @returns AccountDetails with credits (tokenRemaining + topupRemaining)
   * @throws Error("UNAUTHORIZED") if apiKey doesn't match
   * @throws Error("ACCOUNT_NOT_FOUND") if account doesn't exist
   */
  getAccountDetails(accountId: string, apiKey: string): Promise<AccountDetails>;

  /**
   * Get available credits for an account (tokenRemaining + topupRemaining)
   * @param accountId - Firestore document ID
   * @returns Total available credits
   */
  getCredits(accountId: string): Promise<number>;
}

export interface AccountDetails {
  accountId: string;
  email: string;
  credits: number;  // tokenRemaining + topupRemaining
  tokenRemaining: number;
  topupRemaining: number;
  planName: string;
  status: boolean;
}
