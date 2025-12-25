export interface IAccountService {
  validateAccount(accountId: string, apiKey: string): Promise<boolean>;
  getCredits(accountId: string): Promise<number>;
  deductCredits(accountId: string, amount: number): Promise<void>;
  hasEnoughCredits(accountId: string): Promise<boolean>;
}

export interface AccountData {
  accountId: string;
  credits: number;
  isValid: boolean;
}
