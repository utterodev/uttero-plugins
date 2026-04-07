#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const scope = args.find(a => a === '--global') ? 'global' : 'project';
const bridgePath = args.find(a => a.startsWith('--bridge='))?.split('=').slice(1).join('=');

if (!bridgePath) {
  console.error('Usage: setup-mcp.ts --bridge=/path/to/bridge.ts [--global]');
  process.exit(1);
}

const configPath = scope === 'global'
  ? join(homedir(), '.claude', 'settings.json')
  : '.mcp.json';

const mcpServer = {
  command: 'bun',
  args: [bridgePath],
};

let config: any = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    config = {};
  }
}

if (!config.mcpServers) config.mcpServers = {};
config.mcpServers.uttero = mcpServer;

writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.error(`✓ MCP server configured (${scope})`);
console.error(`  Config: ${configPath}`);
console.error(`  Bridge: ${bridgePath}`);
console.error('');
console.error('Start with voice channel:');
console.error('  claude --dangerously-load-development-channels server:uttero');
