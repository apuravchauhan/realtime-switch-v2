export enum AccountTestCases {
  EXPECT_ACCOUNT_ID_DEFINED = 'Account ID should be defined',
  EXPECT_EMAIL_MATCHES = 'Email should match input',
  EXPECT_DEFAULT_PLAN_FREE = 'Default plan should be Free',
  EXPECT_DEFAULT_TOKENS_1000 = 'Default tokens should be 1000',
  EXPECT_DEFAULT_TOPUP_0 = 'Default topup should be 0',
  EXPECT_STATUS_ACTIVE = 'Status should be active (1)',
  EXPECT_PRO_PLAN = 'Plan should be Pro',
  EXPECT_PRO_TOKENS_50000 = 'Pro plan tokens should be 50000',
  EXPECT_CUSTOM_TOKENS = 'Custom token value should be set',
  EXPECT_CUSTOM_TOPUP = 'Custom topup value should be set',
  EXPECT_ACCOUNT_NOT_NULL = 'Account should not be null',
  EXPECT_ACCOUNT_NULL_FOR_NONEXISTENT = 'Account should be null for non-existent ID',
}
