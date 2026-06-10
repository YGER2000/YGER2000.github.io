const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content');
const postsDir = path.join(contentDir, 'posts');
const thoughtsDir = path.join(contentDir, 'thoughts');
const excerptsFile = path.join(contentDir, 'excerpts.json');
const assetsDir = path.join(root, 'assets');
const outDir = path.join(root, 'public');

const site = {
  title: '忧郁的日记',
  description: '一些不想忘记的念头，在时间里慢慢沉淀。',
  author: 'YGER',
  url: 'https://YGER2000.github.io',
};
const tagFilterLimit = 10;

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});
md.disable(['code', 'fence', 'backticks']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (from === assetsDir && entry.name === 'admin') continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeMarkdownParagraphs(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
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

    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      normalized.push(line);
      previousWasPlainText = false;
      continue;
    }

    const isBlockSyntax = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|~~~)/.test(trimmed);
    if (!inFence && !isBlockSyntax) {
      if (previousWasPlainText && normalized.length && normalized[normalized.length - 1].trim()) normalized.push('');
      normalized.push(trimmed);
      previousWasPlainText = true;
      continue;
    }

    normalized.push(line);
    previousWasPlainText = false;
  }

  return normalized.join('\n');
}

function markdownToHtml(markdown) {
  return md.render(normalizeMarkdownParagraphs(markdown));
}

function slugFromFile(file) {
  return file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('/', '/');
}

function parseTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagList(posts) {
  const counts = new Map();
  for (const tag of posts.flatMap((post) => post.tags)) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => {
    const countDiff = counts.get(b) - counts.get(a);
    return countDiff || a.localeCompare(b, 'zh-CN');
  });
}

function tagUrl(tag) {
  return `/archive/?tag=${encodeURIComponent(tag)}`;
}

function tagChips(tags) {
  if (!tags.length) return '';
  return `<div class="tag-list" aria-label="文章标签">${tags.map((tag) => `<a class="tag-chip" href="${tagUrl(tag)}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</a>`).join('')}</div>`;
}

function tagFilter(posts) {
  const tags = tagList(posts);
  if (!tags.length) return '';
  const visibleTags = tags.slice(0, tagFilterLimit);
  const hiddenTags = tags.slice(tagFilterLimit);
  return `<div class="tag-filter" data-tag-filter>
    <button class="tag-chip is-active" type="button" data-tag="">全部</button>
    ${visibleTags.map((tag) => `<button class="tag-chip" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
    ${hiddenTags.map((tag) => `<button class="tag-chip" type="button" data-tag="${escapeHtml(tag)}" data-tag-extra hidden>${escapeHtml(tag)}</button>`).join('')}
    ${hiddenTags.length ? '<button class="tag-chip tag-more" type="button" data-tag-more>更多</button>' : ''}
  </div>`;
}

function readPosts() {
  return fs.readdirSync(postsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
      const [meta, body] = parseFrontMatter(raw);
      const date = new Date(meta.date);
      const slug = meta.slug || slugFromFile(file);
      return {
        title: meta.title || slug,
        date,
        dateText: formatDate(date),
        excerpt: meta.excerpt || body.split(/\n\s*\n/)[0],
        slug,
        url: `/posts/${slug}/`,
        tags: parseTags(meta.tags),
        html: markdownToHtml(body),
      };
    })
    .sort((a, b) => b.date - a.date);
}

function readThoughts() {
  if (!fs.existsSync(thoughtsDir)) return [];
  return fs.readdirSync(thoughtsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(thoughtsDir, file), 'utf8');
      const [meta, body] = parseFrontMatter(raw);
      const date = new Date(meta.date);
      return {
        date,
        dateText: formatDate(date),
        html: markdownToHtml(body),
      };
    })
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => b.date - a.date);
}

function layout({ title, page = '', active = '', body }) {
  const nav = [
    ['首页', '/', 'home'],
    ['札记', '/archive/', 'archive'],
    ['摘录', '/excerpts/', 'excerpts'],
    ['碎念', '/thoughts/', 'thoughts'],
    ['关于', '/about/', 'about'],
  ].map(([label, href, key]) => `<a class="${active === key ? 'is-active' : ''}" href="${href}">${label}</a>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(site.description)}">
  <title>${escapeHtml(title ? `${title} - ${site.title}` : site.title)}</title>
  <link rel="stylesheet" href="/assets/css/site.css">
  <script defer src="/assets/js/site.js"></script>
</head>
<body class="${page}">
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="/">${site.title}</a>
      <nav class="desktop-nav" aria-label="主导航">${nav}</nav>
      <div class="header-actions">
        <button class="icon-button theme-toggle" type="button" aria-label="切换深浅色" title="切换深浅色"></button>
        <button class="icon-button menu-toggle" type="button" aria-label="打开菜单" title="打开菜单"></button>
      </div>
    </header>
    <div class="mobile-panel" hidden>
      <nav aria-label="移动端导航">${nav}</nav>
      <button class="icon-button theme-toggle mobile-theme" type="button" aria-label="切换深浅色" title="切换深浅色"></button>
    </div>
    ${body}
    <footer class="site-footer">
      <span>© 2026 ${site.title}</span>
      <span>呢喃着现实的渺茫</span>
      <a class="social-link" href="https://weibo.com/u/5656726868" aria-label="微博主页" title="微博主页">
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.404-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.809-1.338-1.337-4.869.045-7.888 3.08C1.309 10.87 0 13.273 0 15.348c0 3.981 5.099 6.395 10.086 6.395 6.536 0 10.888-3.801 10.888-6.82 0-1.822-1.547-2.854-2.915-3.284v.01zm1.908-5.092c-.766-.856-1.908-1.187-2.96-.962-.436.09-.706.511-.616.932.09.42.511.691.932.602.511-.105 1.067.044 1.442.465.376.421.466.977.316 1.473-.136.406.089.856.51.992.405.119.857-.105.992-.512.33-1.021.12-2.178-.646-3.035l.03.045zm2.418-2.195c-1.576-1.757-3.905-2.419-6.054-1.968-.496.104-.812.587-.706 1.081.104.496.586.813 1.082.707 1.532-.331 3.185.15 4.296 1.383 1.112 1.246 1.429 2.943.947 4.416-.165.48.106 1.007.586 1.157.479.165.991-.104 1.157-.586.675-2.088.241-4.478-1.338-6.235l.03.045z"/>
        </svg>
      </a>
    </footer>
  </div>
</body>
</html>`;
}

function postList(posts) {
  return posts.map((post) => `<article class="post-row" data-tags="${escapeHtml(post.tags.join(','))}">
    <time datetime="${post.date.toISOString()}">${post.dateText}</time>
    <div>
      <h3><a href="${post.url}">${escapeHtml(post.title)}</a></h3>
      ${tagChips(post.tags)}
      <p>${escapeHtml(post.excerpt)}</p>
    </div>
    <a class="read-link" href="${post.url}">阅读全文 →</a>
  </article>`).join('');
}

function buildIndex(posts) {
  const latest = posts.slice(0, 4);
  return layout({
    title: '',
    page: 'home-page',
    active: 'home',
    body: `<main>
      <section class="hero">
        <div class="hero-copy">
          <h1>忧郁的日记</h1>
          <p>一些不想忘记的念头，<br>在时间里慢慢沉淀。</p>
          <span class="quiet-rule"></span>
          <a class="text-link" href="#latest">阅读最新 ↓</a>
        </div>
        <figure class="hero-image">
          <img src="/assets/images/sea.svg" alt="雾海与远山">
        </figure>
      </section>
      <section id="latest" class="latest-section">
        <div class="section-heading">
          <h2>最新</h2>
          <a href="/archive/">查看全部 →</a>
        </div>
        ${tagFilter(latest)}
        <div class="post-list">${postList(latest)}</div>
      </section>
    </main>`,
  });
}

function buildPost(post, posts) {
  const index = posts.findIndex((item) => item.slug === post.slug);
  const previous = posts[index + 1];
  const next = posts[index - 1];
  return layout({
    title: post.title,
    page: 'post-page',
    body: `<main class="article-wrap">
      <a class="back-link" href="/">← 返回</a>
      <article class="article">
        <h1>${escapeHtml(post.title)}</h1>
        <p class="article-meta">${post.dateText}</p>
        ${tagChips(post.tags)}
        <div class="article-content">${post.html}</div>
      </article>
      <nav class="post-nav" aria-label="文章导航">
        <span>${previous ? `<small>← 上一篇</small><a href="${previous.url}">${escapeHtml(previous.title)}</a>` : ''}</span>
        <span>${next ? `<small>下一篇 →</small><a href="${next.url}">${escapeHtml(next.title)}</a>` : ''}</span>
      </nav>
    </main>`,
  });
}

function buildArchive(posts) {
  const years = new Map();
  for (const post of posts) {
    const year = String(post.date.getFullYear());
    const month = String(post.date.getMonth() + 1).padStart(2, '0');
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(post);
  }

  const groups = [...years.entries()].map(([year, months], index) => `<details class="archive-year" ${index === 0 ? 'open' : ''}>
    <summary><span>${year} 年</span><span>${[...months.values()].flat().length} 篇</span></summary>
    ${[...months.entries()].map(([month, monthPosts]) => `<div class="archive-month">
      <span>${month} 月</span>
      <div>${monthPosts.map((post) => `<a href="${post.url}">${escapeHtml(post.title)}</a>`).join('')}</div>
      <span>${monthPosts.length} 篇</span>
    </div>`).join('')}
  </details>`).join('');

  return layout({
    title: '札记',
    page: 'archive-page',
    active: 'archive',
    body: `<main class="narrow-page">
      <h1>札记</h1>
      ${tagFilter(posts)}
      <section class="archive-list">${groups}</section>
      <section class="post-list archive-filter-list" hidden>${postList(posts)}</section>
    </main>`,
  });
}

function buildAbout() {
  const raw = fs.readFileSync(path.join(contentDir, 'about.md'), 'utf8');
  const [meta, body] = parseFrontMatter(raw);
  return layout({
    title: meta.title || '关于',
    page: 'about-page',
    active: 'about',
    body: `<main class="about-layout">
      <h1>关于</h1>
      <img class="about-illustration" src="/assets/images/window.svg" alt="窗边植物">
      <div class="about-copy">${markdownToHtml(body)}</div>
    </main>`,
  });
}

function readExcerpts() {
  if (!fs.existsSync(excerptsFile)) return [];
  const raw = fs.readFileSync(excerptsFile, 'utf8').trim();
  if (!raw) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      order: Number(item.order) || 0,
      text: String(item.text || ''),
      source: String(item.source || '').trim(),
    }))
    .filter((item) => item.text.trim())
    .sort((a, b) => b.order - a.order);
}

function isPreformattedExcerpt(text) {
  return /\n/.test(text) && (/ {2,}/.test(text) || /[\u2800-\u28ff]/.test(text));
}

function buildExcerpts(excerpts) {
  const items = excerpts.length ? excerpts.map((item) => `<article class="excerpt-card ${isPreformattedExcerpt(item.text) ? 'is-preformatted' : ''}">
    <span class="excerpt-order">${String(item.order).padStart(2, '0')}</span>
    <blockquote>${escapeHtml(item.text)}</blockquote>
    ${item.source ? `<cite>${escapeHtml(item.source)}</cite>` : ''}
    <button class="excerpt-expand" type="button">展开</button>
  </article>`).join('') : '<p class="empty-copy">还没有摘录。</p>';

  return layout({
    title: '摘录',
    page: 'excerpts-page',
    active: 'excerpts',
    body: `<main class="excerpts-layout">
      <h1>摘录</h1>
      <section class="excerpt-grid">${items}</section>
    </main>`,
  });
}

function buildThoughts(thoughts) {
  const items = thoughts.length ? thoughts.map((item) => `<article class="thought-row">
    <time datetime="${item.date.toISOString()}">${item.dateText}</time>
    <div class="thought-content">${item.html}</div>
  </article>`).join('') : '<p class="empty-copy">还没有碎念。</p>';

  return layout({
    title: '碎念',
    page: 'thoughts-page',
    active: 'thoughts',
    body: `<main class="narrow-page">
      <h1>碎念</h1>
      <section class="thought-list">${items}</section>
    </main>`,
  });
}

function writePage(filePath, html) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, html);
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  copyDir(assetsDir, path.join(outDir, 'assets'));

  const posts = readPosts();
  const excerpts = readExcerpts();
  const thoughts = readThoughts();
  writePage(path.join(outDir, 'index.html'), buildIndex(posts));
  writePage(path.join(outDir, 'archive', 'index.html'), buildArchive(posts));
  writePage(path.join(outDir, 'excerpts', 'index.html'), buildExcerpts(excerpts));
  writePage(path.join(outDir, 'thoughts', 'index.html'), buildThoughts(thoughts));
  writePage(path.join(outDir, 'about', 'index.html'), buildAbout());
  for (const post of posts) {
    writePage(path.join(outDir, 'posts', post.slug, 'index.html'), buildPost(post, posts));
  }
  console.log(`Built ${posts.length} posts into public/`);
}

main();
