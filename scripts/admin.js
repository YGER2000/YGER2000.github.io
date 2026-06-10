const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'content', 'posts');
const thoughtsDir = path.join(root, 'content', 'thoughts');
const excerptsFile = path.join(root, 'content', 'excerpts.json');
const adminAssetsDir = path.join(root, 'assets', 'admin');
const port = Number(process.argv[2] || process.env.PORT || 4010);
const host = process.argv[3] || process.env.HOST || '127.0.0.1';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) return [{}, raw.trim()];
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return [{}, raw.trim()];
  const metaRaw = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta = {};
  for (const line of metaRaw.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) meta[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return [meta, body];
}

function slugify(value) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || `post-${Date.now()}`;
}

function datePrefix(date) {
  return String(date || new Date().toISOString()).slice(0, 10);
}

function normalizeTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
}

function toFileName(post) {
  const slug = slugify(post.slug || post.title);
  return `${datePrefix(post.date)}-${slug}.md`;
}

function readPosts() {
  ensureDir(postsDir);
  return fs.readdirSync(postsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
      const [meta, body] = parseFrontMatter(raw);
      return {
        file,
        title: meta.title || '',
        date: meta.date || '',
        excerpt: meta.excerpt || '',
        slug: meta.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''),
        tags: normalizeTags(meta.tags),
        body,
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function serializePost(post) {
  const title = String(post.title || '').trim();
  const date = String(post.date || '').trim();
  const excerpt = String(post.excerpt || '').trim();
  const slug = slugify(post.slug || title);
  const tags = normalizeTags(post.tags);
  const body = String(post.body || '').trim();
  if (!title) throw new Error('文章标题不能为空');
  if (!date) throw new Error(`「${title}」缺少日期`);
  if (!body) throw new Error(`「${title}」正文不能为空`);
  return `---\ntitle: ${title}\ndate: ${date}\nexcerpt: ${excerpt}\nslug: ${slug}${tags ? `\ntags: ${tags}` : ''}\n---\n\n${body}\n`;
}

function savePosts(posts) {
  ensureDir(postsDir);
  const existing = new Set(fs.readdirSync(postsDir).filter((file) => file.endsWith('.md')));
  const written = [];
  for (const post of posts) {
    const original = post.file && path.basename(post.file);
    const file = toFileName(post);
    const raw = serializePost(post);
    fs.writeFileSync(path.join(postsDir, file), raw);
    written.push(file);
    existing.delete(file);
    if (original && original !== file && existing.has(original)) {
      fs.unlinkSync(path.join(postsDir, original));
      existing.delete(original);
    }
  }
  return written;
}

function readExcerpts() {
  if (!fs.existsSync(excerptsFile)) return [];
  const raw = fs.readFileSync(excerptsFile, 'utf8').trim();
  if (!raw) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    order: Number(item.order) || index + 1,
    text: String(item.text || ''),
    source: String(item.source || ''),
  })).sort((a, b) => b.order - a.order);
}

function saveExcerpts(excerpts) {
  ensureDir(path.dirname(excerptsFile));
  const items = (Array.isArray(excerpts) ? excerpts : [])
    .map((item, index) => ({
      order: Number(item.order) || index + 1,
      text: String(item.text || ''),
      source: String(item.source || '').trim(),
    }))
    .filter((item) => item.text.trim())
    .sort((a, b) => b.order - a.order);
  fs.writeFileSync(excerptsFile, `${JSON.stringify(items, null, 2)}\n`);
  return items.length;
}

function readThoughts() {
  ensureDir(thoughtsDir);
  return fs.readdirSync(thoughtsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(thoughtsDir, file), 'utf8');
      const [meta, body] = parseFrontMatter(raw);
      return {
        file,
        date: meta.date || '',
        body,
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function thoughtFileName(thought, index) {
  if (thought.file) return path.basename(thought.file);
  const date = datePrefix(thought.date);
  const slug = slugify(String(thought.body || '').slice(0, 24)) || `thought-${index + 1}`;
  return `${date}-${slug}.md`;
}

function serializeThought(thought) {
  const date = String(thought.date || '').trim();
  const body = String(thought.body || '').trim();
  if (!date) throw new Error('碎念缺少时间');
  if (!body) throw new Error('碎念正文不能为空');
  return `---\ndate: ${date}\n---\n\n${body}\n`;
}

function saveThoughts(thoughts) {
  ensureDir(thoughtsDir);
  const existing = new Set(fs.readdirSync(thoughtsDir).filter((file) => file.endsWith('.md')));
  const used = new Set();
  const written = [];
  for (const [index, thought] of thoughts.entries()) {
    let file = thoughtFileName(thought, index);
    const ext = path.extname(file);
    const base = file.slice(0, -ext.length);
    let suffix = 2;
    while (used.has(file)) {
      file = `${base}-${suffix}${ext}`;
      suffix += 1;
    }
    fs.writeFileSync(path.join(thoughtsDir, file), serializeThought(thought));
    used.add(file);
    written.push(file);
    existing.delete(file);
  }
  for (const file of existing) fs.unlinkSync(path.join(thoughtsDir, file));
  return written;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('请求内容太大'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: root }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? error.code : 0,
        output: `${stdout || ''}${stderr || ''}`.trim(),
      });
    });
  });
}

async function publish(message) {
  const build = await run('node', ['scripts/build.js']);
  if (!build.ok) return build;
  const add = await run('git', [
    'add',
    '.gitignore',
    'admin-start.sh',
    'admin-stop.sh',
    'assets',
    'content',
    'package-lock.json',
    'package.json',
    'public',
    'scripts',
    'start.sh',
    'stop.sh',
  ]);
  if (!add.ok) return add;
  const commit = await run('git', ['commit', '-m', message || 'publish blog posts']);
  if (!commit.ok && !commit.output.includes('nothing to commit')) return commit;
  const push = await run('git', ['push']);
  return {
    ok: push.ok,
    code: push.code,
    output: [build.output, add.output, commit.output, push.output].filter(Boolean).join('\n\n'),
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendHtml(res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') return sendHtml(res);
    if (req.method === 'GET' && url.pathname.startsWith('/admin-assets/')) {
      const relative = decodeURIComponent(url.pathname.replace(/^\/admin-assets\//, ''));
      const filePath = path.resolve(adminAssetsDir, relative);
      if (!filePath.startsWith(adminAssetsDir + path.sep)) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden' });
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return sendJson(res, 404, { ok: false, error: 'Not found' });
      }
      return sendFile(res, filePath);
    }
    if (req.method === 'GET' && url.pathname === '/api/posts') {
      return sendJson(res, 200, { posts: readPosts() });
    }
    if (req.method === 'GET' && url.pathname === '/api/excerpts') {
      return sendJson(res, 200, { excerpts: readExcerpts() });
    }
    if (req.method === 'GET' && url.pathname === '/api/thoughts') {
      return sendJson(res, 200, { thoughts: readThoughts() });
    }
    if (req.method === 'POST' && url.pathname === '/api/posts') {
      const body = await readJson(req);
      const files = savePosts(Array.isArray(body.posts) ? body.posts : []);
      return sendJson(res, 200, { ok: true, files });
    }
    if (req.method === 'POST' && url.pathname === '/api/excerpts') {
      const body = await readJson(req);
      const count = saveExcerpts(Array.isArray(body.excerpts) ? body.excerpts : []);
      return sendJson(res, 200, { ok: true, count });
    }
    if (req.method === 'POST' && url.pathname === '/api/thoughts') {
      const body = await readJson(req);
      const files = saveThoughts(Array.isArray(body.thoughts) ? body.thoughts : []);
      return sendJson(res, 200, { ok: true, files });
    }
    if (req.method === 'POST' && url.pathname === '/api/build') {
      const result = await run('node', ['scripts/build.js']);
      return sendJson(res, result.ok ? 200 : 500, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const body = await readJson(req);
      const result = await publish(String(body.message || '').trim());
      return sendJson(res, result.ok ? 200 : 500, result);
    }
    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>写作后台 - 忧郁的日记</title>
  <link rel="stylesheet" href="/admin-assets/vendor/easymde.min.css">
  <style>
    :root {
      color-scheme: light;
      --bg: #efeeeb;
      --panel: #fbfaf7;
      --ink: #11110f;
      --muted: #67625a;
      --line: #dedbd4;
      --soft: #f4f2ed;
      --accent: #11110f;
      --danger: #8d2d20;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background: linear-gradient(135deg, #e9e7e1, var(--bg));
      font-family: "Songti SC", "Noto Serif SC", Georgia, serif;
    }
    button, input, textarea {
      font: inherit;
    }
    .shell {
      width: min(1180px, calc(100vw - 36px));
      margin: 22px auto;
      padding: 28px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 22px 70px rgba(0,0,0,.11);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 22px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      font-size: 26px;
    }
    .subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .mode-switch {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    button {
      min-height: 38px;
      padding: 0 16px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--ink);
      background: transparent;
      cursor: pointer;
    }
    button.primary {
      color: var(--panel);
      border-color: var(--accent);
      background: var(--accent);
    }
    button.is-active {
      border-color: var(--ink);
      background: var(--soft);
    }
    button:disabled {
      opacity: .48;
      cursor: not-allowed;
    }
    .workspace {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 28px;
      padding-top: 26px;
    }
    .list {
      border-right: 1px solid var(--line);
      padding-right: 22px;
    }
    .post-tab {
      width: 100%;
      display: block;
      min-height: 0;
      margin: 0 0 10px;
      padding: 14px;
      border-radius: 6px;
      text-align: left;
      background: var(--soft);
    }
    .post-tab.is-active {
      border-color: var(--ink);
      background: transparent;
    }
    .post-tab strong {
      display: block;
      margin-bottom: 6px;
    }
    .post-tab span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .editor {
      display: grid;
      gap: 16px;
    }
    .markdown-shell {
      display: grid;
      gap: 10px;
    }
    .markdown-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
      gap: 14px;
      align-items: start;
    }
    .markdown-field {
      display: grid;
      grid-template-rows: auto minmax(0, clamp(560px, 62vh, 720px));
      gap: 8px;
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      font-size: 13px;
    }
    .markdown-field-title {
      line-height: 1.4;
    }
    .field-grid {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 14px;
    }
    .excerpt-fields {
      grid-template-columns: 140px 1fr;
    }
    label {
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
      background: rgba(255,255,255,.42);
      outline: none;
    }
    input {
      height: 42px;
      padding: 0 12px;
    }
    textarea {
      height: 100%;
      min-height: 0;
      resize: vertical;
      padding: 14px;
      line-height: 1.85;
      font-family: "SFMono-Regular", "Menlo", monospace;
      font-size: 14px;
      overflow: auto;
      vertical-align: top;
    }
    textarea.plain-textarea {
      min-height: 260px;
      height: auto;
      font-family: inherit;
      font-size: 16px;
      line-height: 1.9;
    }
    .EasyMDEContainer {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      overflow: hidden;
      color: var(--ink);
    }
    .EasyMDEContainer .CodeMirror {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      color: var(--ink);
      background: rgba(255,255,255,.42);
      border-color: var(--line);
      border-radius: 6px;
      font-family: "SFMono-Regular", "Menlo", monospace;
      font-size: 14px;
      line-height: 1.85;
    }
    .EasyMDEContainer .CodeMirror-scroll {
      min-height: 0;
    }
    .EasyMDEContainer .editor-toolbar {
      min-height: 46px;
      border-color: var(--line);
      border-radius: 6px 6px 0 0;
      background: rgba(255,255,255,.28);
    }
    .EasyMDEContainer .editor-toolbar button {
      color: var(--ink) !important;
      border-radius: 4px;
    }
    .EasyMDEContainer .editor-toolbar button:hover,
    .EasyMDEContainer .editor-toolbar button.active {
      background: var(--soft);
      border-color: var(--line);
    }
    .markdown-preview {
      height: 100%;
      min-height: 0;
      overflow: auto;
      padding: 22px;
      color: var(--ink);
      background: rgba(255,255,255,.34);
      border: 1px solid var(--line);
      border-radius: 6px;
      line-height: 1.95;
    }
    .markdown-preview h1,
    .markdown-preview h2,
    .markdown-preview h3 {
      margin: 1.1em 0 .55em;
      line-height: 1.25;
      color: var(--ink);
    }
    .markdown-preview h1:first-child,
    .markdown-preview h2:first-child,
    .markdown-preview h3:first-child,
    .markdown-preview p:first-child,
    .markdown-preview blockquote:first-child,
    .markdown-preview ul:first-child,
    .markdown-preview ol:first-child {
      margin-top: 0;
    }
    .markdown-preview h1 {
      font-size: 30px;
    }
    .markdown-preview h2 {
      font-size: 24px;
    }
    .markdown-preview h3 {
      font-size: 19px;
    }
    .markdown-preview p {
      margin: 0 0 30px;
    }
    .markdown-preview blockquote {
      margin: 24px 0;
      padding-left: 18px;
      color: var(--muted);
      border-left: 3px solid var(--line);
    }
    .markdown-preview ul,
    .markdown-preview ol {
      margin: 0 0 24px;
      padding-left: 1.5em;
    }
    .markdown-preview code {
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--soft);
      font-family: "SFMono-Regular", "Menlo", monospace;
      font-size: .92em;
    }
    .markdown-preview a {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .empty {
      display: grid;
      place-items: center;
      min-height: 420px;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 8px;
    }
    .status {
      margin-top: 20px;
      padding: 14px;
      min-height: 48px;
      white-space: pre-wrap;
      color: var(--muted);
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 6px;
      font-family: "SFMono-Regular", "Menlo", monospace;
      font-size: 12px;
    }
    @media (max-width: 820px) {
      .shell { padding: 20px; }
      header, .workspace { display: block; }
      .actions { justify-content: flex-start; margin-top: 18px; }
      .list { border-right: 0; padding-right: 0; margin-bottom: 22px; }
      .field-grid { grid-template-columns: 1fr; }
      .markdown-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div>
        <h1>写作后台</h1>
        <p class="subtitle">本地保存 Markdown，构建静态博客，需要时一键发布。</p>
        <div class="mode-switch" aria-label="内容类型">
          <button id="postsMode" class="is-active">文章</button>
          <button id="excerptsMode">摘录</button>
          <button id="thoughtsMode">碎念</button>
        </div>
      </div>
      <div class="actions">
        <button id="newPost">新建文章</button>
        <button id="newExcerpt" hidden>新建摘录</button>
        <button id="newThought" hidden>新建碎念</button>
        <button id="saveAll" class="primary">保存全部</button>
        <button id="build">构建</button>
        <button id="publish">发布</button>
      </div>
    </header>
    <section class="workspace">
      <aside class="list" id="postList"></aside>
      <section id="editor"></section>
    </section>
    <pre class="status" id="status">准备好了。</pre>
  </main>
  <script src="/admin-assets/vendor/markdown-it.min.js"></script>
  <script src="/admin-assets/vendor/easymde.min.js"></script>
  <script>
    let posts = [];
    let excerpts = [];
    let thoughts = [];
    let active = 0;
    let activeExcerpt = 0;
    let activeThought = 0;
    let mode = 'posts';
    let bodyEditor = null;
    const list = document.querySelector('#postList');
    const editor = document.querySelector('#editor');
    const statusBox = document.querySelector('#status');
    const postsModeButton = document.querySelector('#postsMode');
    const excerptsModeButton = document.querySelector('#excerptsMode');
    const thoughtsModeButton = document.querySelector('#thoughtsMode');
    const newPostButton = document.querySelector('#newPost');
    const newExcerptButton = document.querySelector('#newExcerpt');
    const newThoughtButton = document.querySelector('#newThought');
    const adminMarkdown = window.markdownit({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
    adminMarkdown.disable(['code', 'fence', 'backticks']);

    function today() {
      const date = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':00';
    }

    function slugify(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\\u4e00-\\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function normalizeMarkdownParagraphs(markdown) {
      const lines = String(markdown || '').split(/\\r?\\n/);
      const normalized = [];
      let inFence = false;
      let previousWasPlainText = false;

      for (const line of lines) {
        const trimmed = line.trimStart();
        if (!trimmed) {
          normalized.push('');
          previousWasPlainText = false;
          continue;
        }

        if (/^(\`\`\`|~~~)/.test(trimmed)) {
          inFence = !inFence;
          normalized.push(line);
          previousWasPlainText = false;
          continue;
        }

        const isBlockSyntax = /^(#{1,6}\\s|[-*+]\\s|\\d+\\.\\s|>\\s?|\`\`\`|~~~)/.test(trimmed);
        if (!inFence && !isBlockSyntax) {
          if (previousWasPlainText && normalized.length && normalized[normalized.length - 1].trim()) normalized.push('');
          normalized.push(trimmed);
          previousWasPlainText = true;
          continue;
        }

        normalized.push(line);
        previousWasPlainText = false;
      }

      return normalized.join('\\n');
    }

    function configureBodyEditor(editorInstance) {
      const cm = editorInstance.codemirror;
      cm.setOption('mode', 'text/plain');
      cm.setOption('indentUnit', 2);
      cm.setOption('tabSize', 2);
      cm.setOption('indentWithTabs', false);
      cm.setOption('extraKeys', {
        Tab(editor) {
          editor.replaceSelection('　　', 'end');
        },
      });
    }

    function setStatus(text) {
      statusBox.textContent = text;
    }

    function sortExcerpts() {
      const current = excerpts[activeExcerpt];
      excerpts.sort((a, b) => (Number(b.order) || 0) - (Number(a.order) || 0));
      if (current) activeExcerpt = Math.max(0, excerpts.indexOf(current));
    }

    function renderList() {
      if (mode === 'excerpts') {
        sortExcerpts();
        list.innerHTML = excerpts.map((item, index) => '<button class="post-tab ' + (index === activeExcerpt ? 'is-active' : '') + '" data-index="' + index + '"><strong>' + escapeHtml('#' + (item.order || index + 1) + ' ' + (item.source || '未填写出处')) + '</strong><span>' + escapeHtml((item.text || '').slice(0, 34)) + '</span></button>').join('');
        list.querySelectorAll('button').forEach((button) => {
          button.addEventListener('click', () => {
            activeExcerpt = Number(button.dataset.index);
            render();
          });
        });
        return;
      }
      if (mode === 'thoughts') {
        list.innerHTML = thoughts.map((item, index) => '<button class="post-tab ' + (index === activeThought ? 'is-active' : '') + '" data-index="' + index + '"><strong>' + escapeHtml((item.body || '未填写碎念').slice(0, 24)) + '</strong><span>' + escapeHtml(item.date || '') + '</span></button>').join('');
        list.querySelectorAll('button').forEach((button) => {
          button.addEventListener('click', () => {
            activeThought = Number(button.dataset.index);
            render();
          });
        });
        return;
      }
      list.innerHTML = posts.map((post, index) => '<button class="post-tab ' + (index === active ? 'is-active' : '') + '" data-index="' + index + '"><strong>' + escapeHtml(post.title || '未命名文章') + '</strong><span>' + escapeHtml(post.date || '') + '</span></button>').join('');
      list.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          active = Number(button.dataset.index);
          render();
        });
      });
    }

    function renderEditor() {
      if (bodyEditor) {
        bodyEditor.toTextArea();
        bodyEditor = null;
      }
      if (mode === 'excerpts') {
        const item = excerpts[activeExcerpt];
        if (!item) {
          editor.innerHTML = '<div class="empty">还没有摘录，点左上角“新建摘录”。</div>';
          return;
        }
        editor.innerHTML = '<div class="editor">' +
          '<div class="field-grid excerpt-fields">' +
            field('序号', 'order', item.order || activeExcerpt + 1) +
            field('出自哪里', 'source', item.source || '') +
          '</div>' +
          '<label>摘录原文<textarea class="plain-textarea" data-field="text">' + escapeHtml(item.text || '') + '</textarea></label>' +
        '</div>';
        editor.querySelectorAll('[data-field]').forEach((input) => {
          input.addEventListener('input', () => {
            excerpts[activeExcerpt][input.dataset.field] = input.value;
            if (input.dataset.field === 'order') sortExcerpts();
            renderList();
          });
        });
        return;
      }
      if (mode === 'thoughts') {
        const item = thoughts[activeThought];
        if (!item) {
          editor.innerHTML = '<div class="empty">还没有碎念，点左上角“新建碎念”。</div>';
          return;
        }
        editor.innerHTML = '<div class="editor">' +
          field('时间', 'date', item.date || '') +
          '<div class="markdown-shell">' +
            '<div class="markdown-grid">' +
              '<div class="markdown-field"><span class="markdown-field-title">碎念 Markdown</span><textarea id="bodyEditor" data-field="body">' + escapeHtml(item.body || '') + '</textarea></div>' +
              '<div class="markdown-field"><span class="markdown-field-title">实时预览</span><div class="markdown-preview" id="markdownPreview"></div></div>' +
            '</div>' +
          '</div>' +
        '</div>';
        editor.querySelectorAll('[data-field]').forEach((input) => {
          input.addEventListener('input', () => {
            thoughts[activeThought][input.dataset.field] = input.value;
            renderList();
          });
        });
        bodyEditor = new EasyMDE({
          element: editor.querySelector('#bodyEditor'),
          autofocus: false,
          spellChecker: false,
          status: false,
          minHeight: '0',
          renderingConfig: {
            singleLineBreaks: true,
          },
          previewRender: (plainText) => adminMarkdown.render(normalizeMarkdownParagraphs(plainText)),
          toolbar: ['bold', 'italic', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link'],
        });
        configureBodyEditor(bodyEditor);
        bodyEditor.codemirror.on('change', () => {
          thoughts[activeThought].body = bodyEditor.value();
          updatePreview();
          renderList();
        });
        updatePreview();
        return;
      }
      const post = posts[active];
      if (!post) {
        editor.innerHTML = '<div class="empty">还没有文章，点左上角“新建文章”。</div>';
        return;
      }
      editor.innerHTML = '<div class="editor">' +
        '<div class="field-grid">' +
          field('标题', 'title', post.title || '') +
          field('日期', 'date', post.date || '') +
        '</div>' +
        '<div class="field-grid">' +
          field('URL 标识', 'slug', post.slug || '') +
          field('摘要', 'excerpt', post.excerpt || '') +
        '</div>' +
        field('标签（用逗号分隔）', 'tags', post.tags || '') +
        '<div class="markdown-shell">' +
          '<div class="markdown-grid">' +
            '<div class="markdown-field"><span class="markdown-field-title">正文 Markdown</span><textarea id="bodyEditor" data-field="body">' + escapeHtml(post.body || '') + '</textarea></div>' +
            '<div class="markdown-field"><span class="markdown-field-title">实时预览</span><div class="markdown-preview" id="markdownPreview"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
      editor.querySelectorAll('[data-field]').forEach((input) => {
        input.addEventListener('input', () => {
          posts[active][input.dataset.field] = input.value;
          if (input.dataset.field === 'title' && !posts[active].slug) {
            posts[active].slug = slugify(input.value);
          }
          renderList();
        });
      });
      bodyEditor = new EasyMDE({
        element: editor.querySelector('#bodyEditor'),
        autofocus: false,
        spellChecker: false,
        status: false,
        minHeight: '0',
        renderingConfig: {
          singleLineBreaks: true,
        },
        previewRender: (plainText) => adminMarkdown.render(normalizeMarkdownParagraphs(plainText)),
        toolbar: [
          'bold',
          'italic',
          'heading',
          '|',
          'quote',
          'unordered-list',
          'ordered-list',
          '|',
          'link',
          'image',
        ],
      });
      configureBodyEditor(bodyEditor);
      bodyEditor.codemirror.on('change', () => {
        posts[active].body = bodyEditor.value();
        updatePreview();
      });
      updatePreview();
      const preview = editor.querySelector('#markdownPreview');
      bodyEditor.codemirror.scrollTo(0, 0);
      if (preview) preview.scrollTop = 0;
    }

    function field(label, key, value) {
      return '<label>' + label + '<input data-field="' + key + '" value="' + escapeHtml(value) + '"></label>';
    }

    function render() {
      postsModeButton.classList.toggle('is-active', mode === 'posts');
      excerptsModeButton.classList.toggle('is-active', mode === 'excerpts');
      thoughtsModeButton.classList.toggle('is-active', mode === 'thoughts');
      newPostButton.hidden = mode !== 'posts';
      newExcerptButton.hidden = mode !== 'excerpts';
      newThoughtButton.hidden = mode !== 'thoughts';
      renderList();
      renderEditor();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function updatePreview() {
      const preview = document.querySelector('#markdownPreview');
      if (!preview) return;
      const markdown = bodyEditor ? bodyEditor.value() : '';
      preview.innerHTML = adminMarkdown.render(normalizeMarkdownParagraphs(markdown));
    }

    async function api(path, options) {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || body.output || '请求失败');
      return body;
    }

    async function load() {
      const postsData = await api('/api/posts');
      const excerptsData = await api('/api/excerpts');
      const thoughtsData = await api('/api/thoughts');
      posts = postsData.posts;
      excerpts = excerptsData.excerpts;
      thoughts = thoughtsData.thoughts;
      active = 0;
      activeExcerpt = 0;
      activeThought = 0;
      render();
    }

    postsModeButton.addEventListener('click', () => {
      mode = 'posts';
      render();
    });

    excerptsModeButton.addEventListener('click', () => {
      mode = 'excerpts';
      sortExcerpts();
      render();
    });

    thoughtsModeButton.addEventListener('click', () => {
      mode = 'thoughts';
      render();
    });

    newPostButton.addEventListener('click', () => {
      posts.unshift({
        title: '',
        date: today(),
        excerpt: '',
        slug: '',
        tags: '',
        body: '',
      });
      active = 0;
      render();
    });

    newExcerptButton.addEventListener('click', () => {
      const nextOrder = excerpts.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1;
      excerpts.unshift({
        order: nextOrder,
        text: '',
        source: '',
      });
      activeExcerpt = 0;
      render();
    });

    newThoughtButton.addEventListener('click', () => {
      thoughts.unshift({
        date: today(),
        body: '',
      });
      activeThought = 0;
      render();
    });

    document.querySelector('#saveAll').addEventListener('click', async () => {
      setStatus('保存中...');
      if (mode === 'excerpts') {
        const result = await api('/api/excerpts', {
          method: 'POST',
          body: JSON.stringify({ excerpts }),
        });
        setStatus('已保存 ' + result.count + ' 条摘录。');
      } else if (mode === 'thoughts') {
        const result = await api('/api/thoughts', {
          method: 'POST',
          body: JSON.stringify({ thoughts }),
        });
        setStatus('已保存：\\n' + result.files.join('\\n'));
      } else {
        const result = await api('/api/posts', {
          method: 'POST',
          body: JSON.stringify({ posts }),
        });
        setStatus('已保存：\\n' + result.files.join('\\n'));
      }
      await load();
    });

    document.querySelector('#build').addEventListener('click', async () => {
      setStatus('构建中...');
      const result = await api('/api/build', { method: 'POST', body: '{}' });
      setStatus(result.output || '构建完成。');
    });

    document.querySelector('#publish').addEventListener('click', async () => {
      const message = prompt('提交信息', 'publish blog posts');
      if (!message) return;
      setStatus('发布中：保存、构建、commit、push...');
      await api('/api/posts', { method: 'POST', body: JSON.stringify({ posts }) });
      await api('/api/excerpts', { method: 'POST', body: JSON.stringify({ excerpts }) });
      await api('/api/thoughts', { method: 'POST', body: JSON.stringify({ thoughts }) });
      const result = await api('/api/publish', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setStatus(result.output || '发布完成。');
      await load();
    });

    load().catch((error) => setStatus(error.message));
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  route(req, res);
});

server.listen(port, host, () => {
  console.log(`Blog admin running at http://${host}:${port}/`);
});
