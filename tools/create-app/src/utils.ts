import fs from 'fs-extra';
import path from 'path';

/**
 * Check if a file is a text file (not binary)
 */
export function isTextFile(filePath: string): boolean {
  const textExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt',
    '.yaml', '.yml', '.toml', '.env', '.example', '.gitignore',
    '.sol', '.html', '.css', '.scss', '.less', '.svg'
  ];

  const ext = path.extname(filePath).toLowerCase();
  return textExtensions.includes(ext) || path.basename(filePath).startsWith('.');
}

/**
 * Replace template variables in a string
 * Variables are in the format {{VAR_NAME}}
 */
export function substituteVars(content: string, vars: Record<string, string>): string {
  let result = content;

  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Recursively copy a directory
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copy(srcPath, destPath);
    }
  }
}

/**
 * Recursively substitute template variables in all text files in a directory
 */
export async function substituteInDir(dir: string, vars: Record<string, string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await substituteInDir(fullPath, vars);
    } else if (isTextFile(fullPath)) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const substituted = substituteVars(content, vars);
      await fs.writeFile(fullPath, substituted, 'utf-8');
    }
  }
}
