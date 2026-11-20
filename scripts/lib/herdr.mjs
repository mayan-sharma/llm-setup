// Herdr desktop app payload: personal layouts, themes and mods, plus session
// resume after a reboot. Herdr is not a coding-agent harness, so it has no
// adapter; this runs only on machines where the app or its core is present.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PAYLOAD, adapterHome, sharedToolsDir } from './adapters.mjs';

export const HERDR_PAYLOAD = path.join(PAYLOAD, 'herdr-app');
export const RESUME_TOOL = 'herdr-app-resume.mjs';
const BEGIN = '# >>> llm-setup: herdr-app resume >>>';
const END = '# <<< llm-setup: herdr-app resume <<<';

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

function onPath(bin) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  return (process.env.PATH || '').split(path.delimiter).some(dir =>
    exts.some(ext => dir && existsSync(path.join(dir, bin + ext))));
}

// The app's folder, or null when the app is not on this machine.
export function herdrAppHome() {
  const candidates = [
    process.env.HERDR_APP_HOME,
    path.join(os.homedir(), '.config', 'herdr-app'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'herdr-app'),
  ].filter(Boolean);
  return candidates.find(dir => existsSync(dir)) ?? null;
}

// Layouts, themes and mods: every payload file except the resume tool.
export function herdrAppFiles() {
  if (!existsSync(HERDR_PAYLOAD)) return [];
  return walk(HERDR_PAYLOAD)
    .map(file => ({ file, rel: path.relative(HERDR_PAYLOAD, file) }))
    .filter(({ rel }) => rel.split(path.sep)[0] !== 'resume');
}

// The shell block: at the first prompt of a recovered terminal, reopen the
// Claude session it was running. `eval` so a `claude` alias still applies.
function shellBlock(shell, tool) {
  const quoted = `"${tool}"`;
  if (shell === 'zsh') return `${BEGIN}
# Managed by llm-setup (scripts/lib/herdr.mjs); edits here are overwritten.
# After a reboot Herdr gives each terminal a plain shell: reopen the Claude
# session it was running, once, at the first prompt.
if [[ -o interactive && -n $HC_TERMINAL_ID && -z $CLAUDECODE ]]; then
  _herdr_resume() {
    add-zsh-hook -d precmd _herdr_resume
    local id
    [[ -r ${quoted} ]] || return 0
    id=$(node ${quoted} pending $$ 2>/dev/null) || return 0
    [[ $id =~ '^[0-9a-f-]{36}$' ]] || return 0
    print -P "%F{green}herdr: resuming Claude session $id%f"
    eval "claude --resume $id"
  }
  autoload -Uz add-zsh-hook && add-zsh-hook precmd _herdr_resume
fi
${END}`;
  return `${BEGIN}
# Managed by llm-setup (scripts/lib/herdr.mjs); edits here are overwritten.
# After a reboot Herdr gives each terminal a plain shell: reopen the Claude
# session it was running, once, at the first prompt.
if [[ $- == *i* && -n $HC_TERMINAL_ID && -z $CLAUDECODE && -r ${quoted} ]]; then
  _herdr_resume() {
    PROMPT_COMMAND=\${PROMPT_COMMAND/_herdr_resume;/}
    local id
    id=$(node ${quoted} pending $$ 2>/dev/null) || return 0
    [[ $id =~ ^[0-9a-f-]{36}$ ]] || return 0
    echo "herdr: resuming Claude session $id"
    eval "claude --resume $id"
  }
  PROMPT_COMMAND="_herdr_resume;\${PROMPT_COMMAND:-}"
fi
${END}`;
}

function withBlock(text, block) {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start >= 0 && stop > start) return text.slice(0, start) + block + text.slice(stop + END.length);
  return `${text.replace(/\n*$/, '')}\n\n${block}\n`;
}

// Claude Code settings: our two hook entries, everything else untouched.
function withHooks(settings, tool) {
  const next = structuredClone(settings);
  next.hooks ??= {};
  for (const [event, action] of [['SessionStart', 'record'], ['SessionEnd', 'end']]) {
    const entry = { hooks: [{ type: 'command', command: `node "${tool}" ${action}`, timeout: 10 }] };
    const list = (next.hooks[event] ?? []).filter(group =>
      !(group.hooks ?? []).some(hook => String(hook.command ?? '').includes(RESUME_TOOL)));
    next.hooks[event] = [...list, entry];
  }
  return next;
}

// installFile: the installer's own (compare, back up, write). Returns notes to print.
export function installHerdr({ installFile, targets }) {
  const notes = [];
  const appHome = herdrAppHome();
  if (!appHome && !onPath('hc')) return notes;
  console.log(`--- Herdr app (${appHome ?? 'core only'}) ---`);

  if (appHome) for (const { file, rel } of herdrAppFiles())
    installFile(file, path.join(appHome, rel), `herdr-app:${rel.replaceAll(path.sep, '/')}`);

  const toolSrc = path.join(HERDR_PAYLOAD, 'resume', RESUME_TOOL);
  const claude = targets.find(adapter => adapter.name === 'claude');
  if (!existsSync(toolSrc) || !claude) return notes;
  const tool = path.join(sharedToolsDir(), RESUME_TOOL);
  installFile(toolSrc, tool, `~/.agents/tools/${RESUME_TOOL}`);

  const settingsFile = path.join(adapterHome(claude), 'settings.json');
  let settings = {};
  if (existsSync(settingsFile)) {
    try { settings = JSON.parse(readFileSync(settingsFile, 'utf8')); }
    catch { console.log('skip     claude:settings.json (not valid JSON; resume hooks not added)'); settings = null; }
  }
  if (settings) installFile(`${JSON.stringify(withHooks(settings, tool), null, 2)}\n`, settingsFile,
    'claude:settings.json (herdr resume hooks)', { content: true });

  if (process.platform === 'win32') {
    notes.push('Herdr resume: the shell block is not written on Windows yet; sessions are recorded but not reopened.');
    return notes;
  }
  for (const [shell, name] of [['zsh', '.zshrc'], ['bash', '.bashrc']]) {
    const rc = path.join(os.homedir(), name);
    if (!existsSync(rc)) continue;
    const text = readFileSync(rc, 'utf8');
    installFile(withBlock(text, shellBlock(shell, tool)), rc, `~/${name} (herdr resume block)`, { content: true });
  }
  notes.push('Herdr resume: new Claude sessions are recorded from now on; open a new shell to load the block.');
  return notes;
}
