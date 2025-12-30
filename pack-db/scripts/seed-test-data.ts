import { ServiceFactory } from '../src/impls/ServiceFactory';
import { sql } from 'kysely';
import { createHash } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TEST_EMAIL = 'test@example.com';
const TEST_PLAIN_KEY = 'rs_test_key_123456789';
const TEST_SESSION_ID = 'test-session-001';
const TEST_CREDITS = 100000;

async function seedTestData() {
  console.log('Starting database seeding...');

  const factory = ServiceFactory.getInstance();

  console.log('Running migrations...');
  const migrator = factory.getMigrator();
  const migrationResults = await migrator.runAll();
  for (const result of migrationResults) {
    if (result.status === 'failed') {
      throw new Error(`Migration ${result.name} failed: ${result.error}`);
    }
    console.log(`  ${result.status === 'executed' ? '✅' : '⏭️ '} ${result.name}`);
  }

  const accountRepo = factory.getAccountRepo();
  const db = factory.getDatabaseConnection().getDb();

  try {
    const existingAccounts = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM accounts WHERE email = ${TEST_EMAIL}
    `.execute(db);

    let accountId: string;

    if (existingAccounts.rows[0].count > 0) {
      console.log(`Account with email ${TEST_EMAIL} already exists. Updating credits...`);
      const account = await accountRepo.getAccount(TEST_EMAIL);
      if (!account) {
        throw new Error('Account not found after count check');
      }
      accountId = account.id;

      await sql`
        UPDATE accounts
        SET token_remaining = ${TEST_CREDITS},
            topup_remaining = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${accountId}
      `.execute(db);
      console.log(`✅ Updated account credits to ${TEST_CREDITS}`);
    } else {
      console.log('Creating test account...');
      const account = await accountRepo.createAccount({
        email: TEST_EMAIL,
        planName: 'Pro',
        tokenRemaining: TEST_CREDITS,
        topupRemaining: 0,
      });
      accountId = account.id;
      console.log(`✅ Created account: ${accountId}`);
    }

    const keyHash = createHash('sha256').update(TEST_PLAIN_KEY).digest('hex');
    const keyIndicator = `${TEST_PLAIN_KEY.slice(0, 5)}...${TEST_PLAIN_KEY.slice(-5)}`;

    const existingKeys = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM api_keys WHERE key_hash = ${keyHash}
    `.execute(db);

    if (existingKeys.rows[0].count > 0) {
      console.log('API key already exists. Skipping...');
    } else {
      console.log('Creating API key...');
      await sql`
        INSERT INTO api_keys (key_hash, account_id, key_indicator, label, created_at, expires_at, last_used_at)
        VALUES (
          ${keyHash},
          ${accountId},
          ${keyIndicator},
          'Test Key',
          CURRENT_TIMESTAMP,
          NULL,
          NULL
        )
      `.execute(db);
      console.log(`✅ Created API key: ${TEST_PLAIN_KEY}`);
    }

    const existingSessions = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM sessions
      WHERE account_id = ${accountId} AND session_id = ${TEST_SESSION_ID} AND type = 'SESSION'
    `.execute(db);

    if (existingSessions.rows[0].count > 0) {
      console.log('Session already exists. Skipping...');
    } else {
      console.log('Creating test session...');
      await sql`
        INSERT INTO sessions (account_id, session_id, type, data, created_at)
        VALUES (${accountId}, ${TEST_SESSION_ID}, 'SESSION', '{}', CURRENT_TIMESTAMP)
      `.execute(db);
      console.log(`✅ Created session: ${TEST_SESSION_ID}`);
    }

    console.log('\n📋 Test Credentials:');
    console.log(`   Email:      ${TEST_EMAIL}`);
    console.log(`   API Key:    ${TEST_PLAIN_KEY}`);
    console.log(`   Session ID: ${TEST_SESSION_ID}`);
    console.log(`   Credits:    ${TEST_CREDITS}`);
    console.log(`   Account ID: ${accountId}`);
    console.log('\n🔗 WebSocket URL:');
    console.log(`   ws://localhost:3000?rs_key=${TEST_PLAIN_KEY}&rs_sessid=${TEST_SESSION_ID}&rs_api=OPENAI`);
    console.log('\n✅ Database seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    ServiceFactory.reset();
  }
}

seedTestData();
