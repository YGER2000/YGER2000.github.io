const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'content', 'posts');
const port = Number(process.argv[2] || process.env.PORT || 4010);
const host = process.argv[3] || process.env.HOST || '127.0.0.1';

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
  const body = String(post.body || '').trim();
  if (!title) throw new Error('文章标题不能为空');
  if (!date) throw new Error(`「${title}」缺少日期`);
  if (!body) throw new Error(`「${title}」正文不能为空`);
  return `---\ntitle: ${title}\ndate: ${date}\nexcerpt: ${excerpt}\nslug: ${slug}\n---\n\n${body}\n`;
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

async function route(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') return sendHtml(res);
    if (req.method === 'GET' && url.pathname === '/api/posts') {
      return sendJson(res, 200, { posts: readPosts() });
    }
    if (req.method === 'POST' && url.pathname === '/api/posts') {
      const body = await readJson(req);
      const files = savePosts(Array.isArray(body.posts) ? body.posts : []);
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
    .editor-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .editor-toolbar button {
      min-height: 32px;
      padding: 0 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .markdown-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
      gap: 14px;
      align-items: stretch;
    }
    .field-grid {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 14px;
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
      min-height: 420px;
      resize: vertical;
      padding: 14px;
      line-height: 1.85;
      font-family: "SFMono-Regular", "Menlo", monospace;
      font-size: 14px;
    }
    .markdown-preview {
      min-height: 420px;
      max-height: 680px;
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
      margin: 0 0 16px;
    }
    .markdown-preview blockquote {
      margin: 20px 0;
      padding-left: 18px;
      color: var(--muted);
      border-left: 3px solid var(--line);
    }
    .markdown-preview ul,
    .markdown-preview ol {
      margin: 0 0 18px;
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
      </div>
      <div class="actions">
        <button id="newPost">新建文章</button>
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
  <script>
    let posts = [];
    let active = 0;
    const list = document.querySelector('#postList');
    const editor = document.querySelector('#editor');
    const statusBox = document.querySelector('#status');

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

    function setStatus(text) {
      statusBox.textContent = text;
    }

    function renderList() {
      list.innerHTML = posts.map((post, index) => '<button class="post-tab ' + (index === active ? 'is-active' : '') + '" data-index="' + index + '"><strong>' + escapeHtml(post.title || '未命名文章') + '</strong><span>' + escapeHtml(post.date || '') + '</span></button>').join('');
      list.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          active = Number(button.dataset.index);
          render();
        });
      });
    }

    function renderEditor() {
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
        '<div class="markdown-shell">' +
          '<div class="editor-toolbar" aria-label="Markdown 格式工具">' +
            '<button type="button" data-format="h1">H1</button>' +
            '<button type="button" data-format="h2">H2</button>' +
            '<button type="button" data-format="bold">加粗</button>' +
            '<button type="button" data-format="quote">引用</button>' +
            '<button type="button" data-format="ordered">有序列表</button>' +
            '<button type="button" data-format="unordered">无序列表</button>' +
            '<button type="button" data-format="link">链接</button>' +
          '</div>' +
          '<div class="markdown-grid">' +
            '<label>正文 Markdown<textarea data-field="body">' + escapeHtml(post.body || '') + '</textarea></label>' +
            '<label>实时预览<div class="markdown-preview" id="markdownPreview"></div></label>' +
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
          if (input.dataset.field === 'body') updatePreview();
        });
      });
      editor.querySelectorAll('[data-format]').forEach((button) => {
        button.addEventListener('click', () => applyFormat(button.dataset.format));
      });
      updatePreview();
    }

    function field(label, key, value) {
      return '<label>' + label + '<input data-field="' + key + '" value="' + escapeHtml(value) + '"></label>';
    }

    function render() {
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

    function inlineMarkdown(text) {
      return escapeHtml(text)
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }

    function markdownToHtml(markdown) {
      const lines = String(markdown || '').split(/\\r?\\n/);
      const html = [];
      let paragraph = [];
      let listType = '';

      function flushParagraph() {
        if (!paragraph.length) return;
        html.push('<p>' + inlineMarkdown(paragraph.join(' ')) + '</p>');
        paragraph = [];
      }

      function closeList() {
        if (!listType) return;
        html.push('</' + listType + '>');
        listType = '';
      }

      function openList(type) {
        if (listType === type) return;
        closeList();
        html.push('<' + type + '>');
        listType = type;
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          flushParagraph();
          closeList();
          continue;
        }
        const heading = trimmed.match(/^(#{1,3})\\s+(.+)$/);
        if (heading) {
          flushParagraph();
          closeList();
          const level = heading[1].length;
          html.push('<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>');
          continue;
        }
        const quote = trimmed.match(/^>\\s+(.+)$/);
        if (quote) {
          flushParagraph();
          closeList();
          html.push('<blockquote>' + inlineMarkdown(quote[1]) + '</blockquote>');
          continue;
        }
        const ordered = trimmed.match(/^\\d+\\.\\s+(.+)$/);
        if (ordered) {
          flushParagraph();
          openList('ol');
          html.push('<li>' + inlineMarkdown(ordered[1]) + '</li>');
          continue;
        }
        const unordered = trimmed.match(/^[-*]\\s+(.+)$/);
        if (unordered) {
          flushParagraph();
          openList('ul');
          html.push('<li>' + inlineMarkdown(unordered[1]) + '</li>');
          continue;
        }
        paragraph.push(trimmed);
      }

      flushParagraph();
      closeList();
      return html.join('');
    }

    function updatePreview() {
      const preview = document.querySelector('#markdownPreview');
      if (!preview || !posts[active]) return;
      preview.innerHTML = markdownToHtml(posts[active].body || '');
    }

    function selectedLineRange(textarea) {
      const value = textarea.value;
      const start = value.lastIndexOf('\\n', textarea.selectionStart - 1) + 1;
      const next = value.indexOf('\\n', textarea.selectionEnd);
      const end = next === -1 ? value.length : next;
      return { start, end, text: value.slice(start, end) };
    }

    function replaceSelection(textarea, replacement, selectStart, selectEnd) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
      textarea.focus();
      textarea.setSelectionRange(start + selectStart, start + selectEnd);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function applyLinePrefix(textarea, prefix) {
      const range = selectedLineRange(textarea);
      const lines = range.text.split('\\n');
      const updated = lines.map((line) => line.startsWith(prefix) ? line : prefix + line.replace(/^#{1,3}\\s+|^>\\s+|^[-*]\\s+|^\\d+\\.\\s+/, '')).join('\\n');
      textarea.value = textarea.value.slice(0, range.start) + updated + textarea.value.slice(range.end);
      textarea.focus();
      textarea.setSelectionRange(range.start, range.start + updated.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function applyFormat(type) {
      const textarea = editor.querySelector('textarea[data-field="body"]');
      if (!textarea) return;
      const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (type === 'h1') return applyLinePrefix(textarea, '# ');
      if (type === 'h2') return applyLinePrefix(textarea, '## ');
      if (type === 'quote') return applyLinePrefix(textarea, '> ');
      if (type === 'ordered') return applyLinePrefix(textarea, '1. ');
      if (type === 'unordered') return applyLinePrefix(textarea, '- ');
      if (type === 'bold') {
        const text = selected || '加粗文字';
        return replaceSelection(textarea, '**' + text + '**', 2, 2 + text.length);
      }
      if (type === 'link') {
        const text = selected || '链接文字';
        return replaceSelection(textarea, '[' + text + '](https://)', 1, 1 + text.length);
      }
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
      const data = await api('/api/posts');
      posts = data.posts;
      active = 0;
      render();
    }

    document.querySelector('#newPost').addEventListener('click', () => {
      posts.unshift({
        title: '',
        date: today(),
        excerpt: '',
        slug: '',
        body: '',
      });
      active = 0;
      render();
    });

    document.querySelector('#saveAll').addEventListener('click', async () => {
      setStatus('保存中...');
      const result = await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ posts }),
      });
      setStatus('已保存：\\n' + result.files.join('\\n'));
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
