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
