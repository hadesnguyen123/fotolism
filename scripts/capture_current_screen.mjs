import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_BIN = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

function capture(width, height, outFile) {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--virtual-time-budget=3000',
      `--window-size=${width},${height}`,
      `--screenshot=${outFile}`,
      'http://localhost:5173/?screen=select-layout'
    ];
    const proc = spawn(BROWSER_BIN, args, { stdio: 'ignore' });
    proc.on('close', (code) => {
      console.log(`Captured ${width}x${height} -> ${outFile} (exit ${code})`);
      resolve();
    });
  });
}

async function main() {
  await capture(
    1920,
    1080,
    'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\preview_1920x1080.png'
  );
  await capture(
    1024,
    912,
    'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\preview_user_1024x912.png'
  );
}

main();
