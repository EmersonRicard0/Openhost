import { up } from '../../scripts/sshd.mjs';
import { KEYS_DIR, TEST_PASSPHRASE } from '../../scripts/gen-test-keys.mjs';

export default async function setup(): Promise<void> {
  await up();
  process.env.SSHD_HOST = '127.0.0.1';
  process.env.SSHD_PORT = '2222';
  process.env.SSHD_KEYS_DIR = KEYS_DIR;
  process.env.SSHD_KEY_PASSPHRASE = TEST_PASSPHRASE;
}
