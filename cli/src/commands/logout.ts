import { Command } from 'commander';
import { deleteCredentials } from '../../../plugin/bin/lib/credentials.ts';

export const logoutCommand = new Command('logout')
  .description('Sign out of Uttero')
  .action(() => {
    const deleted = deleteCredentials();
    if (deleted) {
      console.log('✓ Logged out. Credentials removed.');
    } else {
      console.log('Already logged out (no credentials found).');
    }
  });
