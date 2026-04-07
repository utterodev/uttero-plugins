import { Command } from 'commander';
import { AGENTS, writeMcpConfig } from '../config/agents.js';
import { getCredentials } from '../../../plugin/bin/lib/credentials.ts';

export const setupCommand = new Command('setup')
  .description('Configure Uttero MCP for your agent')
  .action(async () => {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(q, resolve));

    console.log('Uttero Setup\n');

    const agentKeys = Object.keys(AGENTS);
    console.log('Which agent are you using?');
    agentKeys.forEach((key, i) => console.log(`  ${i + 1}. ${AGENTS[key].name}`));
    console.log('\n  Note: Claude Code users should install the plugin instead.');
    console.log('  See: https://uttero.dev/docs#quickstart\n');

    const agentChoice = await ask('Choice (number): ');
    const agentKey = agentKeys[parseInt(agentChoice) - 1];
    if (!agentKey) {
      console.error('Invalid choice');
      rl.close();
      process.exit(1);
    }
    const agent = AGENTS[agentKey];

    console.log('\nInstall scope?');
    console.log('  1. This project');
    console.log('  2. Global');
    const scopeChoice = await ask('\nChoice (number): ');
    const configPath = scopeChoice === '2' ? agent.globalConfigPath : agent.projectConfigPath;

    rl.close();

    writeMcpConfig(configPath, agentKey);
    console.log(`\n✓ MCP configured for ${agent.name}`);
    console.log(`  Config written to: ${configPath}`);

    const cred = getCredentials();
    if (!cred) {
      console.log('\n  Run `uttero login` to authenticate.');
    }
  });
