# MonikAI for VS Code

Monika lives in your Explorer sidebar. Every minute she says something from a list of idle lines, with her face changing per line, a blinking animation and a typewriter text box.

This branch contains **only the VS Code extension** (`vscode-extension/`). The original Windows WPF app lives on the `OLD.NET` branch.

## How it works

The extension is two TypeScript files, no runtime dependencies.

### `src/extension.ts`

- **Contribution** (`package.json`): one `webview` view, `monikai.view`, in the `explorer` container. There are no activation events and no commands.
- **`activate()`** loads the bundled `media/data/idle_dialogue.csv`, then tries to improve on it:
  1. Load the last good download from `globalStorageUri/idle_cache.csv`, if it exists, so offline starts use fresh content.
  2. Fetch the shared Google Sheet as CSV (following up to 3 redirects). On success it replaces the in-memory list and rewrites the cache.
  3. Any failure is silent. An empty or unparseable result never overwrites what is already loaded.
- **`MonikaProvider`** is a `WebviewViewProvider`:
  - `resolveWebviewView` builds the HTML, with CSP and nonce, and starts the idle timer.
  - A 60s timer (`IDLE_INTERVAL_MS`) picks a random entry, never the same one twice in a row, and posts `{ type: 'say', chain }` to the webview. It pauses while the view is hidden and resumes on `onDidChangeVisibility`.
- **Webview script** receives `say` messages and plays the chain. For each line it sets the face, splits the text into bubbles of at most 130 characters on sentence boundaries, and types each bubble at 25ms per character. A new message cancels the one in progress through a generation counter. A random blink (`j` face for 100ms) fires every 5 to 15s.

### `src/csv.ts`

A small port of the original app's `CSVParser.cs`. Row layout is `trigger(s), text, face, text, face, ...`. Rows starting with `#` are comments. Each row becomes an `Entry { triggers, chain: Line[] }`.

### Assets (`media/`)

- `faces/`: Monika's pose (`1.png`) plus face overlays (`a.png`, `j.png`, ...) positioned over the pose with percentage offsets.
- `gui/`: text box and background art.
- `data/`: the bundled fallback dialogue CSVs.

The webview's `localResourceRoots` is the extension folder, and assets are served through `asWebviewUri`.

## Develop

```bash
cd vscode-extension
npm install
npm run compile      # or: npm run watch
```

Then press F5 in VS Code and choose **Run Extension** (`.vscode/launch.json`). In the new window, open the Explorer and find the **MonikAI** panel.

## Package

```bash
cd vscode-extension
npx @vscode/vsce package
code --install-extension monikai-vscode-0.1.0.vsix
```

## Adding dialogue

Edit the Google Sheet referenced by `SHEET_CSV_URL` in `extension.ts`, or the bundled `media/data/idle_dialogue.csv` as the offline fallback. Faces are the filenames in `media/faces/` without `.png`.

## Security

- Dialogue comes from a Google Sheet, so it is treated as untrusted. Fetches are https-only, limited to Google hosts (including redirects), time out after 10s and are capped at 1MB.
- Text is rendered with `textContent`, face names are validated against `[A-Za-z0-9-]+`, and the webview CSP blocks everything except nonce'd inline script and local images.
- The extension makes one network request, to the sheet, and sends no user data.

## Disclaimer

Monika and the *Doki Doki Literature Club* art are the property of Team Salvato. This is an unofficial fan project, not affiliated with or endorsed by them, and the MIT license covers the code only. See the [IP guidelines](http://teamsalvato.com/ip-guidelines/).

## License

See [LICENSE](LICENSE).
