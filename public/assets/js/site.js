const root = document.documentElement;
const storedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

root.dataset.theme = storedTheme || (prefersDark ? 'dark' : 'light');

document.querySelectorAll('.theme-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', root.dataset.theme);
  });
});

const menuToggle = document.querySelector('.menu-toggle');
const panel = document.querySelector('.mobile-panel');

if (menuToggle && panel) {
  menuToggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    menuToggle.setAttribute('aria-label', panel.hidden ? '打开菜单' : '关闭菜单');
  });
}

document.querySelectorAll('[data-tag-filter]').forEach((filter) => {
  const posts = [...document.querySelectorAll('.post-row[data-tags]')];
  const archiveList = document.querySelector('.archive-list');
  const archiveFilterList = document.querySelector('.archive-filter-list');
  const moreButton = filter.querySelector('[data-tag-more]');

  function showAllTags() {
    filter.querySelectorAll('[data-tag-extra]').forEach((button) => {
      button.hidden = false;
    });
    if (moreButton) moreButton.hidden = true;
  }

  function applyTag(tag) {
    filter.querySelectorAll('[data-tag]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.tag === tag);
    });

    posts.forEach((post) => {
      const tags = post.dataset.tags.split(',').filter(Boolean);
      post.classList.toggle('is-hidden', Boolean(tag) && !tags.includes(tag));
    });

    if (archiveList && archiveFilterList) {
      archiveList.hidden = Boolean(tag);
      archiveFilterList.hidden = !tag;
    }
  }

  filter.addEventListener('click', (event) => {
    if (event.target.closest('[data-tag-more]')) {
      showAllTags();
      return;
    }

    const button = event.target.closest('[data-tag]');
    if (!button) return;
    const tag = button.dataset.tag;
    applyTag(tag);

    if (location.pathname.startsWith('/archive/')) {
      const url = tag ? `/archive/?tag=${encodeURIComponent(tag)}` : '/archive/';
      history.replaceState(null, '', url);
    }
  });

  const initialTag = new URLSearchParams(location.search).get('tag');
  if (initialTag && filter.querySelector(`[data-tag="${CSS.escape(initialTag)}"]`)) {
    if (filter.querySelector(`[data-tag-extra][data-tag="${CSS.escape(initialTag)}"]`)) {
      showAllTags();
    }
    applyTag(initialTag);
  }
});

document.querySelectorAll('.post-row .tag-chip').forEach((link) => {
  link.addEventListener('click', (event) => {
    const filterButton = document.querySelector(`[data-tag-filter] [data-tag="${CSS.escape(link.dataset.tag)}"]`);
    if (filterButton) event.preventDefault();
    if (filterButton) filterButton.click();
  });
});

document.querySelectorAll('.excerpt-card').forEach((card) => {
  const quote = card.querySelector('blockquote');
  const button = card.querySelector('.excerpt-expand');
  if (!quote || !button) return;

  if (quote.scrollHeight <= quote.clientHeight + 2 && quote.scrollWidth <= quote.clientWidth + 2) {
    button.hidden = true;
    return;
  }

  button.addEventListener('click', () => {
    card.classList.toggle('is-expanded');
    button.textContent = card.classList.contains('is-expanded') ? '收起' : '展开';
  });
});
