// 现代化导航栏功能脚本

(function() {
  'use strict';

  // 主题切换功能
  function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const body = document.body;
    
    // 从 localStorage 读取主题设置并同步到body（保持兼容性）
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      body.classList.add('dark');
    } else if (savedTheme === 'light') {
      body.classList.remove('dark');
    }

    if (themeToggle) {
      themeToggle.addEventListener('click', function() {
        html.classList.toggle('dark');
        body.classList.toggle('dark');
        
        // 保存主题设置
        if (html.classList.contains('dark')) {
          localStorage.setItem('theme', 'dark');
        } else {
          localStorage.setItem('theme', 'light');
        }
      });
    }
  }

  // 搜索功能
  function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    if (searchInput && searchBtn) {
      // 搜索按钮点击事件
      searchBtn.addEventListener('click', function() {
        performSearch();
      });

      // 回车键搜索
      searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          performSearch();
        }
      });

      function performSearch() {
        const query = searchInput.value.trim();
        if (query) {
          // 这里可以实现实际的搜索功能
          // 暂时使用 Google 站内搜索
          const siteUrl = window.location.hostname;
          window.open(`https://www.google.com/search?q=site:${siteUrl} ${query}`, '_blank');
        }
      }
    }
  }

  // 移动端菜单切换
  function initMobileMenu() {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-nav-menu');

    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', function() {
        menuToggle.classList.toggle('active');
        mobileMenu.classList.toggle('active');
      });

      // 点击菜单项后关闭菜单
      const menuLinks = mobileMenu.querySelectorAll('a');
      menuLinks.forEach(link => {
        link.addEventListener('click', function() {
          menuToggle.classList.remove('active');
          mobileMenu.classList.remove('active');
        });
      });
    }
  }

  // 滚动时添加阴影效果
  function initScrollEffect() {
    const header = document.querySelector('.modern-header');
    
    if (header) {
      window.addEventListener('scroll', function() {
        if (window.scrollY > 10) {
          header.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        } else {
          header.style.boxShadow = 'none';
        }
      });
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initThemeToggle();
      initSearch();
      initMobileMenu();
      initScrollEffect();
    });
  } else {
    initThemeToggle();
    initSearch();
    initMobileMenu();
    initScrollEffect();
  }
})();
