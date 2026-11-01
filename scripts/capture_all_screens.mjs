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
  const list = [
    { url: 'http://localhost:5173/?screen=idle', file: 'screen_idle_final.png' },
    { url: 'http://localhost:5173/?screen=select-layout', file: 'screen_select_layout_final.png' },
    { url: 'http://localhost:5173/?screen=payment', file: 'screen_payment_confirm_final.png' },
    { url: 'http://localhost:5173/?screen=payment&step=qr', file: 'screen_payment_qr_final.png' },
    { url: 'http://localhost:5173/?screen=select-theme', file: 'screen_theme_final.png' },
    { url: 'http://localhost:5173/?screen=select-filter', file: 'screen_filter_final.png' },
    { url: 'http://localhost:5173/?screen=review', file: 'screen_review_final.png' },
  ];

  for (const item of list) {
    const out = `C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\b2b8665b-ac83-4256-ac38-a098a30c7e1a\\${item.file}`;
    await capture(item.url, out);
  }
  console.log('All screens verified and captured successfully!');
}

main();
