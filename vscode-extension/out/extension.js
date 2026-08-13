"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const path = require("path");
const https = require("https");
const csv_1 = require("./csv");
const IDLE_INTERVAL_MS = 4 * 60 * 1000;
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1HZVg81cmAFULlnra5k1fysK6cIoT9QbCsBasPimnPCE/export?format=csv&gid=0';
// Google's export URL redirects once to a signed download link.
function fetchSheetIdle(url = SHEET_CSV_URL, redirectsLeft = 3) {
    return new Promise(resolve => {
        https.get(url, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
                resolve(fetchSheetIdle(res.headers.location, redirectsLeft - 1));
                return;
            }
            if (res.statusCode !== 200) {
                resolve([]);
                return;
            }
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => resolve((0, csv_1.parseCsvContent)(data)));
        }).on('error', () => resolve([]));
    });
}
function activate(ctx) {
    const dataDir = path.join(ctx.extensionPath, 'media', 'data');
    const idle = (0, csv_1.parseCsv)(path.join(dataDir, 'idle_dialogue.csv'));
    // ponytail: replace bundled fallback with sheet data when reachable; no retry/cache, add if offline use matters
    fetchSheetIdle().then(remote => {
        if (remote.length) {
            idle.length = 0;
            idle.push(...remote);
        }
    });
    ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('monikai.view', new MonikaProvider(ctx.extensionUri, idle)));
}
class MonikaProvider {
    constructor(extensionUri, idle) {
        this.extensionUri = extensionUri;
        this.idle = idle;
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.html = this.html(view.webview);
        view.onDidChangeVisibility(() => {
            if (view.visible)
                this.scheduleIdle();
            else
                clearTimeout(this.timer);
        });
        view.onDidDispose(() => clearTimeout(this.timer));
        this.scheduleIdle();
    }
    scheduleIdle() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            if (this.view?.visible)
                this.say(this.pickIdle());
            this.scheduleIdle();
        }, IDLE_INTERVAL_MS);
    }
    pickIdle() {
        let entry;
        do {
            entry = this.idle[Math.floor(Math.random() * this.idle.length)];
        } while (entry === this.lastIdle && this.idle.length > 1);
        this.lastIdle = entry;
        return entry;
    }
    say(entry) {
        if (entry)
            this.view?.webview.postMessage({ type: 'say', chain: entry.chain });
    }
    html(webview) {
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
    display: flex; align-items: center; justify-content: center;
    font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
    background: var(--vscode-editor-background); padding: 0; margin: 0;
    overflow: hidden;
  }
  #stage {
    width: 280px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
    background: url('${guiBase}/background.png'); background-size: 90px;
    border-radius: 4px; padding: 10px;
  }
  #portrait { position: relative; width: 100%; max-width: 260px; aspect-ratio: 1 / 1; }
  #pose { position: absolute; width: 100%; height: 100%; object-fit: contain; }
  #face {
    position: absolute; left: 32.9%; top: 32.4%; width: 30.6%; height: 21.9%;
    object-fit: cover;
  }
  #box {
    position: relative; width: 100%; box-sizing: border-box; margin-top: 6px;
    background: url('${guiBase}/textbox.png') center / 100% 100% no-repeat;
    padding: 14px 14px 10px;
  }
  #name {
    position: absolute; top: -12px; left: 8px;
    background: #fff; color: var(--mas-pink); font-weight: bold; font-size: 0.85em;
    padding: 2px 12px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  #text { min-height: 3em; color: #fff; line-height: 1.4; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
</style>
</head>
<body>
  <div id="stage">
    <div id="portrait">
      <img id="pose" src="${faceBase}/1.png" />
      <img id="face" src="${faceBase}/a.png" />
    </div>
    <div id="box">
      <span id="name">Monika</span>
      <div id="text"></div>
    </div>
  </div>
<script nonce="${nonce}">
  const textEl = document.getElementById('text');
  const faceEl = document.getElementById('face');
  const stageEl = document.getElementById('stage');
  const faceBase = "${faceBase}";
  let blinkTimer;

  function fitScale() {
    const scale = Math.min(1, (window.innerWidth - 4) / stageEl.offsetWidth, (window.innerHeight - 4) / stageEl.offsetHeight);
    stageEl.style.transform = 'scale(' + scale + ')';
  }
  new ResizeObserver(fitScale).observe(stageEl);
  window.addEventListener('resize', fitScale);
  fitScale();

  function setFace(face) { faceEl.src = faceBase + '/' + face + '.png'; }

  async function typeLine(text) {
    textEl.textContent = '';
    for (let i = 0; i < text.length; i++) {
      textEl.textContent = text.slice(0, i + 1);
      await new Promise(r => setTimeout(r, 25));
    }
    await new Promise(r => setTimeout(r, Math.max(2000, 52 * text.length)));
  }

  async function play(chain) {
    clearInterval(blinkTimer);
    blinkTimer = setInterval(() => {
      setFace('j');
      setTimeout(() => setFace('a'), 100);
    }, 5000 + Math.random() * 10000);
    for (const line of chain) {
      setFace(line.face);
      await typeLine(line.text);
    }
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
//# sourceMappingURL=extension.js.map