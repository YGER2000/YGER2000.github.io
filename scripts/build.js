const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content');
const postsDir = path.join(contentDir, 'posts');
const assetsDir = path.join(root, 'assets');
const outDir = path.join(root, 'public');

const site = {
  title: '忧郁的日记',
  description: '一些不想忘记的念头，在时间里慢慢沉淀。',
  author: 'YGER',
  url: 'https://YGER2000.github.io',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
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

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = '';

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = '';
  }

  function openList(type) {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      closeList();
      html.push(`<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}"></figure>`);
      continue;
    }
    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      openList('ol');
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      openList('ul');
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html.join('\n');
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
        html: markdownToHtml(body),
      };
    })
    .sort((a, b) => b.date - a.date);
}

function layout({ title, page = '', active = '', body }) {
  const nav = [
    ['首页', '/', 'home'],
    ['归档', '/archive/', 'archive'],
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
      <span>记得生活，记得自己。</span>
      <a class="github-link" href="https://github.com/YGER2000" aria-label="GitHub">GitHub</a>
    </footer>
  </div>
</body>
</html>`;
}

function postList(posts) {
  return posts.map((post) => `<article class="post-row">
    <time datetime="${post.date.toISOString()}">${post.dateText}</time>
    <div>
      <h3><a href="${post.url}">${escapeHtml(post.title)}</a></h3>
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
          <a class="text-link" href="#latest">阅读最新日记 ↓</a>
        </div>
        <figure class="hero-image">
          <img src="/assets/images/sea.svg" alt="雾海与远山">
        </figure>
      </section>
      <section id="latest" class="latest-section">
        <div class="section-heading">
          <h2>最新日记</h2>
          <a href="/archive/">查看全部 →</a>
        </div>
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
        <p class="article-meta">${post.dateText} <span>/</span> 随笔</p>
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
    title: '归档',
    page: 'archive-page',
    active: 'archive',
    body: `<main class="narrow-page">
      <h1>归档</h1>
      <section class="archive-list">${groups}</section>
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
  writePage(path.join(outDir, 'index.html'), buildIndex(posts));
  writePage(path.join(outDir, 'archive', 'index.html'), buildArchive(posts));
  writePage(path.join(outDir, 'about', 'index.html'), buildAbout());
  for (const post of posts) {
    writePage(path.join(outDir, 'posts', post.slug, 'index.html'), buildPost(post, posts));
  }
  console.log(`Built ${posts.length} posts into public/`);
}

main();
