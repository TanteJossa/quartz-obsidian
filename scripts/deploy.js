import { rm, copyFile, mkdir, readdir, stat, utimes } from 'fs/promises';
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

async function syncDirectories(src, dest) {
  // Ensure destination directory exists
  try {
    await mkdir(dest, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  const srcEntries = await readdir(src, { withFileTypes: true });
  const destEntries = await readdir(dest, { withFileTypes: true });

  const srcMap = new Map(srcEntries.map(e => [e.name, e]));
  const destMap = new Map(destEntries.map(e => [e.name, e]));

  // 1. Copy/Update from Src to Dest
  for (const [name, srcEntry] of srcMap) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);

    if (srcEntry.isDirectory()) {
      await syncDirectories(srcPath, destPath);
    } else if (srcEntry.isFile()) {
      const srcStat = await stat(srcPath);
      let needsCopy = true;

      if (destMap.has(name)) {
        const destEntry = destMap.get(name);
        if (destEntry.isFile()) {
          const destStat = await stat(destPath);
          // Compare size and mtime (allowing for small differences due to filesystem precision)
          if (srcStat.size === destStat.size && Math.abs(srcStat.mtimeMs - destStat.mtimeMs) < 1000) {
            needsCopy = false;
          }
        }
      }

      if (needsCopy) {
        // console.log(`Copying ${name}`); // Verbose logging can be disabled
        await copyFile(srcPath, destPath);
        // Preserve mtime
        await utimes(destPath, srcStat.atime, srcStat.mtime);
      }
    }
  }

  // 2. Delete from Dest if not in Src
  for (const [name, destEntry] of destMap) {
    if (!srcMap.has(name)) {
      const destPath = path.join(dest, name);
      console.log(`Deleting ${destPath}`);
      await rm(destPath, { recursive: true, force: true });
    }
  }
}

async function main() {
  try {
    console.log('--- Step 1: Syncing content directory (Smart Copy) ---');
    await syncDirectories(SOURCE_DIR, CONTENT_DIR);

    console.log(`--- Step 2: Building Quartz site (Concurrency: ${concurrency}) ---`);
    // Pass --incremental flag to quartz build
    await runCommand('npx', ['quartz', 'build', '--incremental', `--concurrency=${concurrency}`]);

    console.log('--- Step 3: Deploying to Firebase ---');
    await runCommand('firebase', ['deploy', '--only', 'hosting:obsidian-vault-ee-site']);

    console.log('--- Deployment complete! ---');
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();
