import setupSshd from '../integration/global-setup';

/** Mesmo servidor OpenSSH de teste usado pela integração. */
export default async function setup(): Promise<void> {
  await setupSshd();
}
