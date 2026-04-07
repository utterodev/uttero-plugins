import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentConfig {
  name: string;
  projectConfigPath: string;
  globalConfigPath: string;
}

export const AGENTS: Record<string, AgentConfig> = {
  'cursor': {
    name: 'Cursor',
    projectConfigPath: join('.cursor', 'mcp.json'),
    globalConfigPath: join(homedir(), '.cursor', 'mcp.json'),
  },
  'windsurf': {
    name: 'Windsurf',
    projectConfigPath: join('.windsurf', 'mcp.json'),
    globalConfigPath: join(homedir(), '.windsurf', 'mcp.json'),
  },
};

const MCP_SERVER_CONFIG = {
  command: 'npx',
  args: ['-y', 'uttero', 'bridge'],
};

export function writeMcpConfig(configPath: string, agentType: string): void {
  let config: any = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      config = {};
    }
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.uttero = MCP_SERVER_CONFIG;

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
