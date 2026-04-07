import { Command } from 'commander';
import { getCredentials, getCredentialsPath } from '../../../plugin/bin/lib/credentials.ts';

export const statusCommand = new Command('status')
  .description('Show current auth and connection status')
  .action(() => {
    const cred = getCredentials();
    if (!cred) {
      console.log('Not logged in. Run `uttero login` to authenticate.');
      return;
    }

    const expiresAt = new Date(cred.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`  User:    ${cred.email}`);
    console.log(`  Server:  ${cred.server_url}`);
    console.log(`  Token:   valid (expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'})`);
    console.log(`  File:    ${getCredentialsPath()}`);
  });
