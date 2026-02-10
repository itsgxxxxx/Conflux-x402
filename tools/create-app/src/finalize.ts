import { spawn } from 'child_process';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { WizardAnswers } from './wizard.js';

/**
 * Run a command with streaming output
 */
function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

export async function finalizeProject(answers: WizardAnswers, targetDir: string): Promise<void> {
  const spinner = p.spinner();

  // Initialize git repository
  try {
    spinner.start('Initializing git repository');
    await runCommand('git', ['init'], targetDir);
    spinner.stop('Git repository initialized');
  } catch (error) {
    spinner.stop('Failed to initialize git repository');
    console.warn(pc.yellow('Warning: Could not initialize git repository'));
  }

  // Install dependencies with pnpm
  try {
    spinner.start('Installing dependencies with pnpm');
    await runCommand('pnpm', ['install'], targetDir);
    spinner.stop('Dependencies installed');
  } catch (error) {
    spinner.stop('Failed to install dependencies');
    console.warn(pc.yellow('Warning: Could not install dependencies. Please run "pnpm install" manually.'));
  }

  // Print next steps
  console.log();
  p.outro(pc.green('✓ Project created successfully!'));
  console.log();
  console.log(pc.bold('Next steps:'));
  console.log();
  console.log(`  ${pc.cyan('cd')} ${answers.projectName}`);
  console.log(`  ${pc.cyan('cp')} .env.example .env`);
  console.log(`  ${pc.dim('# Edit .env with your configuration')}`);
  console.log();
  console.log(`  ${pc.cyan('pnpm build')}`);
  console.log(`  ${pc.cyan('pnpm dev:facilitator')}`);
  console.log(`  ${pc.dim('# In another terminal:')}`);
  console.log(`  ${pc.cyan('pnpm dev:sandbox')}`);
  console.log();
  console.log(pc.dim('For more information, see the README.md file.'));
  console.log();
}
