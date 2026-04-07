import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { setupCommand } from './commands/setup.js';
import { statusCommand } from './commands/status.js';
import { bridgeCommand } from './commands/bridge.js';

const program = new Command();

program
  .name('uttero')
  .description('Voice for agents — Uttero CLI')
  .version('0.1.0');

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(setupCommand);
program.addCommand(statusCommand);
program.addCommand(bridgeCommand);

program.parse();
