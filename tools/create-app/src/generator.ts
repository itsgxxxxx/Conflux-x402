import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { WizardAnswers } from './wizard.js';
import { copyDir, substituteInDir } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateProject(answers: WizardAnswers, targetDir: string): Promise<void> {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const coreBaseTemplate = path.join(templatesDir, 'core-base');
  const identityTemplate = path.join(templatesDir, 'identity');

  // Check if target directory exists
  if (await fs.pathExists(targetDir)) {
    const files = await fs.readdir(targetDir);
    if (files.length > 0) {
      throw new Error(`Directory ${targetDir} is not empty`);
    }
  }

  // Copy core-base template
  await copyDir(coreBaseTemplate, targetDir);

  // If core+identity preset, overlay identity template
  if (answers.preset === 'core+identity') {
    await copyDir(identityTemplate, targetDir);
  }

  // Prepare substitution variables
  const vars: Record<string, string> = {
    PROJECT_NAME: answers.projectName,
    CHAIN_ID: answers.chainId,
    RPC_URL: answers.rpcUrl,
    NETWORK_CAIP2: answers.networkCaip2,
    AUTH_MODE: answers.authMode,
    AUTH_ENABLED: answers.authEnabled,
  };

  // Substitute variables in all text files
  await substituteInDir(targetDir, vars);
}
