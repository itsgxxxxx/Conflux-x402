#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import pc from 'picocolors';
import { runWizard } from './wizard.js';
import { generateProject } from './generator.js';
import { finalizeProject } from './finalize.js';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);
const VERSION = packageJson.version;

async function main() {
  const args = process.argv.slice(2);

  // Handle --version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`create-x402-app v${VERSION}`);
    process.exit(0);
  }

  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${pc.bold('create-x402-app')} - Scaffolding tool for Conflux eSpace x402 payment applications

${pc.bold('Usage:')}
  ${pc.cyan('npx create-x402-app')}
  ${pc.cyan('npm create x402-app')}
  ${pc.cyan('pnpm create x402-app')}

${pc.bold('Options:')}
  -v, --version    Show version number
  -h, --help       Show this help message

${pc.bold('Examples:')}
  ${pc.dim('# Interactive mode (recommended)')}
  ${pc.cyan('npx create-x402-app')}

  ${pc.dim('# Follow the prompts to configure your project')}
    `);
    process.exit(0);
  }

  try {
    // Run interactive wizard
    const answers = await runWizard();

    // Determine target directory
    const targetDir = path.resolve(process.cwd(), answers.projectName);

    // Generate project
    await generateProject(answers, targetDir);

    // Finalize project (git init, install deps, print next steps)
    await finalizeProject(answers, targetDir);

  } catch (error) {
    console.error();
    console.error(pc.red('Error:'), error instanceof Error ? error.message : String(error));
    console.error();
    process.exit(1);
  }
}

main();
