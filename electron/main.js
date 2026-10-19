// Electron 主进程（纯 CJS）：负责窗口创建与所有笔记文件读写 ipc
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

let mainWindow = null;

/** notes-data 目录：开发时放项目根目录，打包后放用户数据目录 */
function getNotesDir() {
  const dir = app.isPackaged
    ? path.join(app.getPath('userData'), 'notes-data')
    : path.join(__dirname, '..', 'notes-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 校验笔记 id，防止路径穿越 */
function notePath(id) {
  if (typeof id !== 'string' || !id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new Error('非法的笔记标识：' + id);
  }
  return path.join(getNotesDir(), id);
}

/** 解析文件头部的 front-matter，取出 tags 与正文 */
function parseNote(raw) {
  let tags = [];
  let body = raw;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (m) {
    const fm = m[1];
    const tagLine = fm.split(/\r?\n/).find((l) => /^\s*tags\s*:/.test(l));
    if (tagLine) {
      tags = tagLine
        .replace(/^\s*tags\s*:/, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    body = raw.slice(m[0].length);
  }
  // 去掉正文开头多余空行，方便编辑
  body = body.replace(/^[\r\n]+/, '');
  return { tags, body };
}

/** 把 tags 与正文组装成文件内容，无标签则不写 front-matter */
function serializeNote(tags, body) {
  if (tags && tags.length) {
    return '---\ntags: ' + tags.join(', ') + '\n---\n\n' + body;
  }
  return body;
}

function titleOf(id) {
  return id.replace(/\.md$/i, '');
}

/** 过滤文件名非法字符 */
function sanitizeTitle(name) {
  const clean = String(name || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return clean || '未命名笔记';
}

/** 生成不冲突的文件名，ext 形如 '.md' / '.html'，省略时按 .md 处理 */
function uniqueFile(dir, base, ext) {
  const suffix = ext || '.md';
  let name = base + suffix;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = base + ' ' + i + suffix;
    i++;
  }
  return name;
}

/** 让正文首个一级标题与文件名保持一致 */
function syncHeading(body, title) {
  const trimmed = body.replace(/^[\r\n]+/, '');
  if (/^#\s/.test(trimmed)) {
    return trimmed.replace(/^#\s.*$/m, '# ' + title).replace(/^[\r\n]+/, '');
  }
  if (!trimmed.trim()) return '# ' + title + '\n\n';
  return trimmed;
}

async function listNotes() {
  const dir = getNotesDir();
  const files = (await fsp.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));
  const notes = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = await fsp.stat(full);
    const raw = await fsp.readFile(full, 'utf8');
    notes.push({
      id: f,
      title: titleOf(f),
      updatedAt: stat.mtimeMs,
      tags: parseNote(raw).tags
    });
  }
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return notes;
}

async function readNote(id) {
  const full = notePath(id);
  const stat = await fsp.stat(full);
  const raw = await fsp.readFile(full, 'utf8');
  const { tags, body } = parseNote(raw);
  return { id, title: titleOf(id), body, tags, updatedAt: stat.mtimeMs };
}

async function writeNote(payload) {
  const { id, body, tags } = payload || {};
  const full = notePath(id);
  await fsp.writeFile(full, serializeNote(tags, body == null ? '' : body), 'utf8');
  const stat = await fsp.stat(full);
  return { id, title: titleOf(id), updatedAt: stat.mtimeMs, tags: tags || [] };
}

async function createNote(title) {
  const dir = getNotesDir();
  const name = sanitizeTitle(title);
  const fileId = uniqueFile(dir, name);
  const body = '# ' + name + '\n\n';
  await fsp.writeFile(path.join(dir, fileId), body, 'utf8');
  const stat = await fsp.stat(path.join(dir, fileId));
  return { id: fileId, title: titleOf(fileId), body, tags: [], updatedAt: stat.mtimeMs };
}

async function deleteNote(id) {
  await fsp.unlink(notePath(id));
  return { ok: true };
}

async function renameNote(payload) {
  const { id, title } = payload || {};
  const dir = getNotesDir();
  const srcFull = notePath(id);
  const name = sanitizeTitle(title);
  let targetId = id;
  if (name !== titleOf(id)) {
    targetId = uniqueFile(dir, name);
  }
  // 同步正文的一级标题
  const raw = await fsp.readFile(srcFull, 'utf8');
  const { tags, body } = parseNote(raw);
  const newBody = syncHeading(body, titleOf(targetId));
  await fsp.writeFile(srcFull, serializeNote(tags, newBody), 'utf8');
  if (targetId !== id) {
    await fsp.rename(srcFull, path.join(dir, targetId));
  }
  const stat = await fsp.stat(path.join(dir, targetId));
  return { id: targetId, title: titleOf(targetId), body: newBody, tags, updatedAt: stat.mtimeMs };
}

/** 全文搜索：同时匹配标题与正文，返回带回显片段的命中列表 */
async function searchNotes(query) {
  const dir = getNotesDir();
  const files = (await fsp.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));
  const q = String(query == null ? '' : query).trim();
  const lower = q.toLowerCase();
  const all = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = await fsp.stat(full);
    const raw = await fsp.readFile(full, 'utf8');
    const { tags, body } = parseNote(raw);
    all.push({ id: f, title: titleOf(f), updatedAt: stat.mtimeMs, tags, body });
  }
  all.sort((a, b) => b.updatedAt - a.updatedAt);

  const toMeta = (n) => ({
    id: n.id,
    title: n.title,
    updatedAt: n.updatedAt,
    tags: n.tags,
    titleHit: false,
    bodyHit: false,
    snippet: ''
  });
  if (!q) return all.map(toMeta);

  const hits = [];
  for (const n of all) {
    const titleHit = n.title.toLowerCase().includes(lower);
    const idx = n.body.toLowerCase().indexOf(lower);
    if (!titleHit && idx < 0) continue;
    let snippet = '';
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(n.body.length, idx + q.length + 60);
      snippet =
        (start > 0 ? '…' : '') +
        n.body.slice(start, end).replace(/\s+/g, ' ') +
        (end < n.body.length ? '…' : '');
    }
    hits.push({
      id: n.id,
      title: n.title,
      updatedAt: n.updatedAt,
      tags: n.tags,
      titleHit,
      bodyHit: idx >= 0,
      snippet
    });
  }
  return hits;
}

// 导出 HTML 用的内联样式，保证浏览器直接打开排版正常
const EXPORT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 24px; background: #f7f7f8; color: #1f2328; line-height: 1.75;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  article { max-width: 780px; margin: 0 auto; padding: 40px 48px; background: #fff; border-radius: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
  h1 { font-size: 28px; margin: 0 0 16px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
  h2 { font-size: 22px; margin: 28px 0 12px; }
  h3 { font-size: 18px; margin: 22px 0 10px; }
  p { margin: 12px 0; }
  a { color: #2563eb; }
  ul, ol { padding-left: 24px; margin: 12px 0; }
  li { margin: 4px 0; }
  li.task-list-item { list-style: none; }
  blockquote { margin: 16px 0; padding-left: 16px; border-left: 4px solid #d1d5db; color: #4b5563; }
  code { background: #f3f4f6; color: #be123c; padding: 2px 6px; border-radius: 4px;
    font-family: Consolas, "Courier New", monospace; font-size: 13px; }
  pre { background: #111827; color: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; }
  pre code { background: none; color: inherit; padding: 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  hr { margin: 28px 0; border: 0; border-top: 1px solid #e5e7eb; }
  img { max-width: 100%; border-radius: 6px; }
  footer { max-width: 780px; margin: 16px auto 0; font-size: 12px; color: #9ca3af; text-align: center; }
`;

/** 把渲染进程传来的 markdown HTML 包成完整文档 */
function buildExportDoc(title, html) {
  const safeTitle = String(title || '未命名笔记').replace(/[<>&]/g, '');
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + safeTitle + '</title>',
    '<style>' + EXPORT_CSS + '</style>',
    '</head>',
    '<body>',
    '<article class="markdown-body">',
    html || '',
    '</article>',
    '<footer>由「极简笔记」导出 · ' + new Date().toLocaleString('zh-CN') + '</footer>',
    '</body>',
    '</html>'
  ].join('\n');
}

/** 导出单篇笔记为带样式的 HTML，存到 notes-data/exports/ */
async function exportHtml(payload) {
  const { id, title, html } = payload || {};
  if (typeof id !== 'string' || !id) throw new Error('缺少笔记标识');
  const dir = path.join(getNotesDir(), 'exports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = uniqueFile(dir, sanitizeTitle(title || titleOf(id)), '.html');
  await fsp.writeFile(path.join(dir, fileName), buildExportDoc(titleOf(fileName), html), 'utf8');
  return { ok: true, fileName, file: path.join(dir, fileName) };
}

// 预置欢迎笔记：仅在目录内没有任何 md 文件时创建
const WELCOME_BODY = [
  '# 欢迎使用极简笔记',
  '',
  '这是一个**纯本地**的 Markdown 笔记应用，笔记以 `.md` 文件保存在 `notes-data` 目录，随时可用其他编辑器打开。',
  '',
  '## 快速上手',
  '',
  '- 点击右上角 **新建** 创建笔记',
  '- 左侧列表点击切换笔记；点击标题旁的 **铅笔** 图标可重命名',
  '- **删除** 需要二次确认，确认后文件会从 `notes-data` 目录移除',
  '- 停止输入 **1 秒** 后自动保存，右上角显示「保存中… / 已保存」',
  '',
  '## 支持的语法',
  '',
  '> 引用：先把想法记下来，整理可以慢慢来。',
  '',
  '行内代码示例：`npm run dev` 即可启动应用。',
  '',
  '```bash',
  '# 代码块示例',
  'npm install',
  'npm run dev',
  '```',
  '',
  '| 区域 | 作用 |',
  '| --- | --- |',
  '| 左侧 | 笔记列表（标题 / 更新时间 / 标签） |',
  '| 中间 | Markdown 源码编辑 |',
  '| 右侧 | 实时渲染预览 |',
  '',
  '1. 支持有序列表',
  '2. 也支持任务清单：',
  '',
  '- [x] 写下第一条笔记',
  '- [ ] 整理本周的想法',
  ''
].join('\n');

async function ensureWelcomeNote() {
  const dir = getNotesDir();
  const files = await fsp.readdir(dir);
  if (files.some((f) => f.toLowerCase().endsWith('.md'))) return;
  const file = path.join(dir, '欢迎使用极简笔记.md');
  await fsp.writeFile(file, serializeNote(['入门', '指南'], WELCOME_BODY), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '极简笔记',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 外部链接交给系统浏览器，避免把应用窗口导航走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 注册所有笔记相关 ipc
ipcMain.handle('notes:list', () => listNotes());
ipcMain.handle('notes:read', (_e, id) => readNote(id));
ipcMain.handle('notes:write', (_e, payload) => writeNote(payload));
ipcMain.handle('notes:create', (_e, title) => createNote(title));
ipcMain.handle('notes:delete', (_e, id) => deleteNote(id));
ipcMain.handle('notes:rename', (_e, payload) => renameNote(payload));
ipcMain.handle('notes:search', (_e, query) => searchNotes(query));
ipcMain.handle('notes:exportHtml', (_e, payload) => exportHtml(payload));

app.whenReady().then(async () => {
  await ensureWelcomeNote();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
