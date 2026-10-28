import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { parseCsv, parseCsvContent, Entry } from './csv';

const IDLE_INTERVAL_MS = 60 * 1000;
const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1HZVg81cmAFULlnra5k1fysK6cIoT9QbCsBasPimnPCE/export?format=csv&gid=0';

// Google's export URL redirects once to a signed download link.
function fetchSheetCsv(url: string = SHEET_CSV_URL, redirectsLeft = 3): Promise<string> {
  return new Promise(resolve => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        resolve(fetchSheetCsv(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        resolve('');
        return;
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

export function activate(ctx: vscode.ExtensionContext) {
  const dataDir = path.join(ctx.extensionPath, 'media', 'data');
  const idle = parseCsv(path.join(dataDir, 'idle_dialogue.csv'));

  // sheet data wins over the bundled fallback; the last good download is cached for offline starts
  const cacheFile = path.join(ctx.globalStorageUri.fsPath, 'idle_cache.csv');
  const apply = (csv: string) => {
    const remote = parseCsvContent(csv);
    if (remote.length) {
      idle.length = 0;
      idle.push(...remote);
    }
    return remote.length > 0;
  };
  try { apply(fs.readFileSync(cacheFile, 'utf8')); } catch { /* no cache yet */ }
  fetchSheetCsv().then(csv => {
    if (!apply(csv)) return;
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, csv);
    } catch { /* cache is best-effort */ }
  });

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('monikai.view', new MonikaProvider(ctx.extensionUri, idle))
  );
}

class MonikaProvider implements vscode.WebviewViewProvider {
  private timer: NodeJS.Timeout | undefined;
  private view: vscode.WebviewView | undefined;
  private lastIdle: Entry | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly idle: Entry[]
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);

    view.onDidChangeVisibility(() => {
      if (view.visible) this.scheduleIdle();
      else clearTimeout(this.timer);
    });
    view.onDidDispose(() => clearTimeout(this.timer));

    this.scheduleIdle();
  }

  private scheduleIdle() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.view?.visible) this.say(this.pickIdle());
      this.scheduleIdle();
    }, IDLE_INTERVAL_MS);
  }

  private pickIdle(): Entry {
    let entry: Entry;
    do {
      entry = this.idle[Math.floor(Math.random() * this.idle.length)];
    } while (entry === this.lastIdle && this.idle.length > 1);
    this.lastIdle = entry;
    return entry;
  }

  private say(entry: Entry | undefined) {
    if (entry) this.view?.webview.postMessage({ type: 'say', chain: entry.chain });
  }

  private html(webview: vscode.Webview): string {
    const nonce = String(Math.random()).slice(2);
    const faceBase = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'faces')).toString();
    const guiBase = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'gui')).toString();

    return /* html */ `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { --mas-pink: #e5416c; }
  html, body { height: 100%; }
  body {
    font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
    background: var(--vscode-editor-background); padding: 0; margin: 0;
    overflow: hidden;
  }
  #stage {
    width: 100%; height: 100%; box-sizing: border-box; display: flex; align-items: stretch; justify-content: center;
    background: url('${guiBase}/background.png'); background-size: 90px;
    padding: 10px;
  }
  #content { width: 100%; display: flex; flex-direction: row; align-items: stretch; gap: 14px; }
  #portrait { position: relative; height: 100%; aspect-ratio: 1 / 1; flex: none; }
  #pose { position: absolute; width: 100%; height: 100%; object-fit: contain; }
  #face {
    position: absolute; left: 32.9%; top: 32.4%; width: 30.6%; height: 21.9%;
    object-fit: cover;
  }
  #box {
    position: relative; flex: 1; height: 100%; box-sizing: border-box;
    background: url('${guiBase}/textbox.png') center / 100% 100% no-repeat;
    padding: 20px 20px 16px; display: flex; flex-direction: column; justify-content: center;
  }
  #name {
    position: absolute; top: -14px; left: 10px;
    background: #fff; color: var(--mas-pink); font-weight: bold; font-size: 0.75em;
    padding: 3px 14px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  #text {
    color: #fff; line-height: 1.4; font-size: 0.8em; text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    max-height: 100%; overflow-y: auto;
  }
</style>
</head>
<body>
  <div id="stage">
    <div id="content">
      <div id="portrait">
        <img id="pose" src="${faceBase}/1.png" />
        <img id="face" src="${faceBase}/a.png" />
      </div>
      <div id="box">
        <span id="name">Monika</span>
        <div id="text"></div>
      </div>
    </div>
  </div>
<script nonce="${nonce}">
  const textEl = document.getElementById('text');
  const faceEl = document.getElementById('face');
  const faceBase = "${faceBase}";
  let blinkTimer;

  function setFace(face) { faceEl.src = faceBase + '/' + face + '.png'; }

  const MAX_BUBBLE = 130;
  function splitBubbles(text) {
    const sentences = text.match(/[^.!?]+[.!?]*\\s*|[^.!?]+$/g) || [text];
    const bubbles = [];
    let current = '';
    for (const sentence of sentences) {
      if (sentence.length > MAX_BUBBLE) {
        if (current) { bubbles.push(current.trim()); current = ''; }
        const words = sentence.split(' ');
        let chunk = '';
        for (const word of words) {
          if ((chunk + ' ' + word).trim().length > MAX_BUBBLE) { bubbles.push(chunk.trim()); chunk = ''; }
          chunk += (chunk ? ' ' : '') + word;
        }
        if (chunk) bubbles.push(chunk.trim());
      } else if ((current + sentence).length > MAX_BUBBLE) {
        bubbles.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) bubbles.push(current.trim());
    return bubbles;
  }

  let playGen = 0;

  async function typeLine(text, gen) {
    textEl.textContent = '';
    for (let i = 0; i < text.length; i++) {
      if (gen !== playGen) return;
      textEl.textContent = text.slice(0, i + 1);
      await new Promise(r => setTimeout(r, 25));
    }
    await new Promise(r => setTimeout(r, Math.max(2000, 52 * text.length)));
  }

  async function play(chain) {
    const gen = ++playGen;
    clearInterval(blinkTimer);
    blinkTimer = setInterval(() => {
      setFace('j');
      setTimeout(() => setFace('a'), 100);
    }, 5000 + Math.random() * 10000);
    for (const line of chain) {
      if (gen !== playGen) return;
      setFace(line.face);
      for (const bubble of splitBubbles(line.text)) {
        if (gen !== playGen) return;
        await typeLine(bubble, gen);
      }
    }
    if (gen !== playGen) return;
    setFace('a');
    textEl.textContent = '';
  }

  window.addEventListener('message', e => {
    if (e.data.type === 'say') play(e.data.chain);
  });
</script>
</body></html>`;
  }
}
