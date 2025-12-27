export enum MigratorTestCases {
  EXPECT_MIGRATIONS_RUN = 'At least one migration should run',
  EXPECT_ALL_EXECUTED_OR_SKIPPED = 'All migrations should be executed or skipped',
  EXPECT_ACCOUNTS_TABLE_EXISTS = 'Accounts table should exist after migration',
  EXPECT_ALL_SKIPPED_ON_RERUN = 'All migrations should be skipped on second run',
  EXPECT_TABLE_EXISTS_TRUE = 'tableExists should return true for existing table',
  EXPECT_TABLE_EXISTS_FALSE = 'tableExists should return false for non-existent table',
  EXPECT_COLUMN_EXISTS_TRUE = 'columnExists should return true for existing column',
  EXPECT_COLUMN_EXISTS_FALSE = 'columnExists should return false for non-existent column',
  EXPECT_INDEX_EXISTS_TRUE = 'indexExists should return true for existing index',
  EXPECT_INDEX_EXISTS_FALSE = 'indexExists should return false for non-existent index',
}
