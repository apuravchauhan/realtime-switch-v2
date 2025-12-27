export enum EncryptionTestCases {
  EXPECT_CONNECT_AND_WRITE_SUCCESS = 'Should connect and write data successfully',
  EXPECT_READ_PLAIN_TEXT = 'Should read data back in plain text',
  EXPECT_FILE_ENCRYPTED = 'Raw file should not contain plain text data',
  EXPECT_FAIL_WRONG_KEY = 'Should fail to open with wrong key',
  EXPECT_FAIL_NO_KEY = 'Should fail to open without any key',
  EXPECT_SUCCESS_CORRECT_KEY = 'Should succeed with correct key',
}
