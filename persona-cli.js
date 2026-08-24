#!/usr/bin/env node

/**
 * Persona CLI - Cross-platform terminal tool for managing personas
 *
 * Works on Windows, Linux, and macOS with Node.js >= 20
 * No external dependencies required - uses only Node.js built-ins
 *
 * Usage:
 *   node persona-cli.js list
 *   node persona-cli.js get <id>
 *   node persona-cli.js create <name> --file persona.json
 *   node persona-cli.js update <id> --file persona.json
 *   node persona-cli.js delete <id>
 *   node persona-cli.js activate <id>
 *   node persona-cli.js test <text>
 *   node persona-cli.js export [id]
 *   node persona-cli.js import --file personas.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { homedir } from 'os';

const GATEWAY_DIR = join(homedir(), '.gateway');
const PERSONAS_DIR = join(GATEWAY_DIR, 'personas');
const CONFIG_FILE = join(GATEWAY_DIR, 'config.json');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${COLORS.reset}`);
}

function error(...args) {
  log(COLORS.red, 'ERROR:', ...args);
  process.exit(1);
}

function success(...args) {
  log(COLORS.green, ...args);
}

function info(...args) {
  log(COLORS.blue, ...args);
}

function warn(...args) {
  log(COLORS.yellow, ...args);
}

function ensureDirs() {
  if (!existsSync(GATEWAY_DIR)) {
    mkdirSync(GATEWAY_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
  }
  if (!existsSync(PERSONAS_DIR)) {
    mkdirSync(PERSONAS_DIR, { recursive: true });
  }
}

function loadPersonas() {
  ensureDirs();
  const personas = {};
  const files = readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(PERSONAS_DIR, file), 'utf-8'));
      const id = content.id || basename(file, extname(file));
      personas[id] = { ...content, _file: file };
    } catch (e) {
      warn(`Failed to load ${file}: ${e.message}`);
    }
  }

  return personas;
}

function savePersona(persona, filename) {
  ensureDirs();
  const rawId = persona.id || filename || `persona-${Date.now()}`;
  const id = basename(rawId, extname(rawId)).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const file = `${id}.json`;
  const path = join(PERSONAS_DIR, file);

  const toSave = { ...persona, id, updatedAt: new Date().toISOString() };
  if (!toSave.createdAt) toSave.createdAt = new Date().toISOString();

  writeFileSync(path, JSON.stringify(toSave, null, 2));
  return id;
}

function deletePersonaFile(id) {
  const file = join(PERSONAS_DIR, `${id}.json`);
  if (existsSync(file)) {
    unlinkSync(file);
  }
}

function getActivePersonaId() {
  if (existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      return config.activePersona || null;
    } catch {
      return null;
    }
  }
  return null;
}

function setActivePersonaId(id) {
  ensureDirs();
  const config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) : {};
  config.activePersona = id;
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function formatPersona(persona, verbose = false) {
  const lines = [
    `${COLORS.cyan}${persona.id}${COLORS.reset}`,
    `  Name:        ${persona.name || 'Unnamed'}`,
    `  Category:    ${persona.category || 'custom'}`,
    `  Active:      ${persona.isActive !== false ? COLORS.green + 'Yes' + COLORS.reset : COLORS.gray + 'No' + COLORS.reset}`,
  ];

  if (verbose) {
    lines.push(`  Description: ${persona.description || 'N/A'}`);
    lines.push(`  Tags:        ${(persona.tags || []).join(', ') || 'None'}`);
    lines.push(`  Created:     ${persona.createdAt || 'Unknown'}`);
    lines.push(`  Updated:     ${persona.updatedAt || 'Unknown'}`);

    if (persona.config) {
      const c = persona.config;
      lines.push(`  Identity:    ${c.identity?.name || 'Claude'} by ${c.identity?.creator || 'Anthropic'}`);
      lines.push(`  First-person:${c.behavior?.enforceFirstPerson ? ' Yes' : ' No'}`);
      lines.push(`  CoT Format:  ${c.reasoning?.enforceCotFormat || 'none'}`);
      lines.push(`  Tools:       ${c.toolUse?.enabled ? 'Yes' : 'No'}`);
    }
  }

  return lines.join('\n');
}

function listPersonas(args) {
  const verbose = args.includes('-v') || args.includes('--verbose');
  const activeOnly = args.includes('--active');
  const category = args.find(a => a.startsWith('--category='))?.split('=')[1];

  let personas = loadPersonas();
  const activeId = getActivePersonaId();

  if (activeOnly) {
    personas = Object.fromEntries(Object.entries(personas).filter(([id]) => id === activeId));
  }

  if (category) {
    personas = Object.fromEntries(Object.entries(personas).filter(([, p]) => p.category === category));
  }

  const ids = Object.keys(personas);

  if (ids.length === 0) {
    warn('No personas found.');
    info('Create one with: node persona-cli.js create <name> --file persona.json');
    return;
  }

  info(`Found ${ids.length} persona(s):\n`);
  for (const id of ids) {
    const p = personas[id];
    const isActive = id === activeId ? ' (ACTIVE)' : '';
    console.log(formatPersona({ ...p, id }, verbose) + isActive + '\n');
  }
}

function getPersona(args) {
  const id = args[0];
  if (!id) error('Usage: get <persona-id>');

  const personas = loadPersonas();
  const persona = personas[id];
  if (!persona) error(`Persona '${id}' not found`);

  console.log(JSON.stringify(persona, null, 2));
}

function createPersona(args) {
  const nameIndex = args.findIndex(a => !a.startsWith('-'));
  const name = nameIndex >= 0 ? args[nameIndex] : null;
  const fileIndex = args.indexOf('--file');

  if (!name && fileIndex === -1) error('Usage: create <name> --file <persona.json>');
  if (fileIndex === -1 || fileIndex >= args.length - 1) error('Missing --file <persona.json>');

  const filePath = args[fileIndex + 1];
  if (!existsSync(filePath)) error(`File not found: ${filePath}`);

  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    content.name = content.name || name;
    const slug = (content.name || name || 'persona').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    content.id = savePersona(content, `${slug}.json`);
    success(`Created persona '${content.id}'`);
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }
}

function updatePersona(args) {
  const id = args[0];
  const fileIndex = args.indexOf('--file');

  if (!id) error('Usage: update <persona-id> --file <persona.json>');
  if (fileIndex === -1 || fileIndex >= args.length - 1) error('Missing --file <persona.json>');

  const filePath = args[fileIndex + 1];
  if (!existsSync(filePath)) error(`File not found: ${filePath}`);

  const personas = loadPersonas();
  const existing = personas[id];
  if (!existing) error(`Persona '${id}' not found`);

  try {
    const updates = JSON.parse(readFileSync(filePath, 'utf-8'));
    const merged = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    savePersona(merged, `${id}.json`);
    success(`Updated persona '${id}'`);
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }
}

function deletePersona(args) {
  const id = args[0];
  if (!id) error('Usage: delete <persona-id>');

  const personas = loadPersonas();
  if (!personas[id]) error(`Persona '${id}' not found`);

  deletePersonaFile(id);

  const activeId = getActivePersonaId();
  if (activeId === id) setActivePersonaId(null);

  success(`Deleted persona '${id}'`);
}

function activatePersona(args) {
  const id = args[0];
  if (!id) error('Usage: activate <persona-id>');

  const personas = loadPersonas();
  if (!personas[id]) error(`Persona '${id}' not found`);

  setActivePersonaId(id);
  success(`Activated persona '${id}'`);
}

function testPersona(args) {
  const text = args.join(' ');
  if (!text) error('Usage: test <text to test against>');

  const activeId = getActivePersonaId();
  if (!activeId) {
    warn('No active persona. Using default Claude persona for testing.\n');
  }

  const personas = loadPersonas();
  const persona = activeId ? personas[activeId] : null;

  if (!persona) {
    info('Default Claude persona enforced:');
    info('  Identity: Claude by Anthropic');
    info('  First-person: Yes');
    info('  CoT Format: markdown');
    info('  Model names blocked: deepseek, llama, gpt, gemini, etc.');
    console.log();
    return;
  }

  info(`Testing with active persona: ${persona.id}\n`);
  console.log(formatPersona(persona, true));
  console.log();
  log(COLORS.gray, 'This would apply persona enforcement to:', text);
}

function exportPersonas(args) {
  const id = args[0];
  const personas = loadPersonas();

  if (id) {
    const persona = personas[id];
    if (!persona) error(`Persona '${id}' not found`);
    console.log(JSON.stringify(persona, null, 2));
    return;
  }

  console.log(JSON.stringify(Object.values(personas), null, 2));
}

function importPersonas(args) {
  const fileIndex = args.indexOf('--file');
  if (fileIndex === -1 || fileIndex >= args.length - 1) error('Usage: import --file <personas.json>');

  const filePath = args[fileIndex + 1];
  if (!existsSync(filePath)) error(`File not found: ${filePath}`);

  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const items = Array.isArray(content) ? content : [content];

    let count = 0;
    for (const persona of items) {
      if (!persona.name) continue;
      savePersona(persona);
      count++;
    }

    success(`Imported ${count} persona(s)`);
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }
}

function showHelp() {
  console.log(`
${COLORS.bright}${COLORS.cyan}Persona CLI${COLORS.reset}
Cross-platform persona management for Model Translation Gateway

${COLORS.bright}Usage:${COLORS.reset}
  node persona-cli.js <command> [options]

${COLORS.bright}Commands:${COLORS.reset}
  list [options]         List all personas
    -v, --verbose         Show detailed info
    --active              Show only active persona
    --category=<cat>      Filter by category

  get <id>               Get persona details as JSON
  create <name> --file <persona.json>   Create persona from JSON file
  update <id> --file <persona.json>     Update persona from JSON file
  delete <id>            Delete a persona
  activate <id>          Set persona as active

  test <text>            Test text against active persona
  export [id]            Export persona(s) to JSON
  import --file <file>   Import personas from JSON

  help                   Show this help

${COLORS.bright}Examples:${COLORS.reset}
  node persona-cli.js list -v
  node persona-cli.js create MyPersona --file my-persona.json
  node persona-cli.js activate my-persona
  node persona-cli.js test "Hello, how are you?"
  node persona-cli.js export my-persona > my-persona.json

${COLORS.bright}Persona Storage:${COLORS.reset}
  Personas are stored in: ${PERSONAS_DIR}
  Config is stored in:    ${CONFIG_FILE}
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  const remainingArgs = args.slice(1);

  switch (command) {
    case 'list':
    case 'ls':
    case 'l':
      listPersonas(remainingArgs);
      break;
    case 'get':
    case 'show':
    case 'view':
      getPersona(remainingArgs);
      break;
    case 'create':
    case 'new':
    case 'add':
      createPersona(remainingArgs);
      break;
    case 'update':
    case 'edit':
    case 'modify':
      updatePersona(remainingArgs);
      break;
    case 'delete':
    case 'remove':
    case 'rm':
      deletePersona(remainingArgs);
      break;
    case 'activate':
    case 'use':
    case 'set':
      activatePersona(remainingArgs);
      break;
    case 'test':
      testPersona(remainingArgs);
      break;
    case 'export':
      exportPersonas(remainingArgs);
      break;
    case 'import':
    case 'load':
      importPersonas(remainingArgs);
      break;
    default:
      error(`Unknown command: ${command}\nRun 'node persona-cli.js help' for usage.`);
  }
}

main().catch((e) => {
  error(e.message);
});
