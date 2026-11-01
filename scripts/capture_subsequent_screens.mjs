import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_BIN = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

function capture(screen, outFile) {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--virtual-time-budget=3000',
      '--window-size=1024,912',
      `--screenshot=${outFile}`,
      `http://localhost:5173/?screen=${screen}&noLiveStream=1`
    ];
    const proc = spawn(BROWSER_BIN, args, { stdio: 'ignore' });
    proc.on('close', (code) => {
      console.log(`Captured ${screen} -> ${outFile} (exit ${code})`);
      resolve();
    });
  });
}

async function main() {
  await capture('capture', 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\screen_capture.png');
  await capture('select-theme', 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\screen_theme.png');
  await capture('select-filter', 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\screen_filter.png');
  await capture('review', 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\screen_review.png');
}

main();

