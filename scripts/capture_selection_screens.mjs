import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_BIN = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

function capture(url, outFile) {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--virtual-time-budget=3000',
      '--window-size=1024,912',
      `--screenshot=${outFile}`,
      url
    ];
    const proc = spawn(BROWSER_BIN, args, { stdio: 'ignore' });
    proc.on('close', (code) => {
      console.log(`Captured ${url} -> ${outFile} (exit ${code})`);
      resolve();
    });
  });
}

async function main() {
  const brainDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a';
  await capture('http://localhost:5173/?screen=select-layout', `${brainDir}\\screen_select_layout.png`);
  await capture('http://localhost:5173/?screen=payment', `${brainDir}\\screen_payment_step1.png`);
  await capture('http://localhost:5173/?screen=payment&step=qr', `${brainDir}\\screen_payment_step2.png`);
  await capture('http://localhost:5173/?screen=select-theme', `${brainDir}\\screen_theme.png`);
  await capture('http://localhost:5173/?screen=select-filter', `${brainDir}\\screen_filter.png`);
  await capture('http://localhost:5173/?screen=select-size', `${brainDir}\\screen_select_size.png`);
}

main();
