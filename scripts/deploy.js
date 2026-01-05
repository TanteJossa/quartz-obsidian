import { rm, cp, mkdir } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = 'C:\\Users\\joost\\My Drive\\obsidian_notes\\vaults\\EE';
const CONTENT_DIR = path.resolve(__dirname, '../content');

// Use all cores minus one for concurrency, minimum 1
const concurrency = Math.max(1, os.cpus().length - 1);

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  try {
    console.log('--- Step 1: Cleaning content directory ---');
    await rm(CONTENT_DIR, { recursive: true, force: true });
    await mkdir(CONTENT_DIR);

    console.log('--- Step 2: Copying notes ---');
    await cp(SOURCE_DIR, CONTENT_DIR, { recursive: true });

    console.log(`--- Step 3: Building Quartz site (Concurrency: ${concurrency}) ---`);
    await runCommand('npx', ['quartz', 'build', `--concurrency=${concurrency}`]);

    console.log('--- Step 4: Deploying to Firebase ---');
    await runCommand('firebase', ['deploy', '--only', 'hosting:obsidian-vault-ee-site']);

    console.log('--- Deployment complete! ---');
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();