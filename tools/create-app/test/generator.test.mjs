import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { substituteVars, isTextFile } from '../dist/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('substituteVars', () => {
  it('should replace template variables', () => {
    const content = 'Hello {{NAME}}, your project is {{PROJECT_NAME}}';
    const vars = { NAME: 'World', PROJECT_NAME: 'my-app' };
    const result = substituteVars(content, vars);
    assert.strictEqual(result, 'Hello World, your project is my-app');
  });

  it('should handle multiple occurrences', () => {
    const content = '{{VAR}} and {{VAR}} again';
    const vars = { VAR: 'test' };
    const result = substituteVars(content, vars);
    assert.strictEqual(result, 'test and test again');
  });

  it('should not replace non-existent variables', () => {
    const content = 'Hello {{NAME}}';
    const vars = { OTHER: 'value' };
    const result = substituteVars(content, vars);
    assert.strictEqual(result, 'Hello {{NAME}}');
  });
});

describe('isTextFile', () => {
  it('should identify TypeScript files as text', () => {
    assert.strictEqual(isTextFile('test.ts'), true);
    assert.strictEqual(isTextFile('test.tsx'), true);
  });

  it('should identify JavaScript files as text', () => {
    assert.strictEqual(isTextFile('test.js'), true);
    assert.strictEqual(isTextFile('test.mjs'), true);
    assert.strictEqual(isTextFile('test.cjs'), true);
  });

  it('should identify config files as text', () => {
    assert.strictEqual(isTextFile('package.json'), true);
    assert.strictEqual(isTextFile('config.toml'), true);
    assert.strictEqual(isTextFile('config.yaml'), true);
    assert.strictEqual(isTextFile('.env'), true);
    assert.strictEqual(isTextFile('.gitignore'), true);
  });

  it('should identify Solidity files as text', () => {
    assert.strictEqual(isTextFile('Contract.sol'), true);
  });
});

describe('Template Structure', () => {
  it('should have core-base template', async () => {
    const templatePath = path.join(__dirname, '..', 'templates', 'core-base');
    const exists = await fs.pathExists(templatePath);
    assert.strictEqual(exists, true, 'core-base template should exist');
  });

  it('should have identity template', async () => {
    const templatePath = path.join(__dirname, '..', 'templates', 'identity');
    const exists = await fs.pathExists(templatePath);
    assert.strictEqual(exists, true, 'identity template should exist');
  });

  it('core-base should have required files', async () => {
    const basePath = path.join(__dirname, '..', 'templates', 'core-base');
    const requiredFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      '.env.example',
      '.gitignore'
    ];

    for (const file of requiredFiles) {
      const exists = await fs.pathExists(path.join(basePath, file));
      assert.strictEqual(exists, true, `${file} should exist in core-base template`);
    }
  });

  it('core-base should have required packages', async () => {
    const basePath = path.join(__dirname, '..', 'templates', 'core-base', 'packages');
    const requiredPackages = ['chain-config', 'facilitator', 'express-middleware'];

    for (const pkg of requiredPackages) {
      const exists = await fs.pathExists(path.join(basePath, pkg));
      assert.strictEqual(exists, true, `${pkg} package should exist`);
    }
  });

  it('identity template should have required packages', async () => {
    const basePath = path.join(__dirname, '..', 'templates', 'identity', 'packages');
    const requiredPackages = ['attestor', 'contracts', 'identity-cli'];

    for (const pkg of requiredPackages) {
      const exists = await fs.pathExists(path.join(basePath, pkg));
      assert.strictEqual(exists, true, `${pkg} package should exist in identity template`);
    }
  });

  it('template files should contain template variables', async () => {
    const packageJsonPath = path.join(
      __dirname,
      '..',
      'templates',
      'core-base',
      'packages',
      'chain-config',
      'package.json'
    );
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    assert.ok(
      content.includes('{{PROJECT_NAME}}'),
      'package.json should contain {{PROJECT_NAME}} template variable'
    );
  });

  it('template should not contain @conflux-x402/ references', async () => {
    const basePath = path.join(__dirname, '..', 'templates', 'core-base');

    // Check a few key files
    const filesToCheck = [
      'packages/chain-config/package.json',
      'packages/facilitator/package.json',
      'packages/facilitator/railway.json',
      'packages/facilitator/nixpacks.toml',
      'examples/sandbox/test/app.test.mjs'
    ];

    for (const file of filesToCheck) {
      const filePath = path.join(basePath, file);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        assert.ok(
          !content.includes('@conflux-x402/'),
          `${file} should not contain @conflux-x402/ (should use {{PROJECT_NAME}} instead)`
        );
      }
    }
  });
});
