(() => {
  const key = 'ocp-site-theme-v1';
  const valid = value => value === 'light' || value === 'dark';
  const sharedDomain = /(^|\.)ocp-protocol\.org$/.test(location.hostname);
  const read = () => {
    const cookie = document.cookie.split('; ').find(value => value.startsWith(key + '='))?.split('=')[1];
    if (valid(cookie)) return cookie;
    try {
      const saved = localStorage.getItem(key) || localStorage.getItem('ocp-market-theme-v1');
      if (valid(saved)) return saved;
    } catch { /* 无存储权限时仍可使用主题。 */ }
    return 'dark';
  };
  const apply = (theme, persist) => {
    document.documentElement.dataset.ocpTheme = theme;
    if (persist) {
      try { localStorage.setItem(key, theme); } catch { /* 保留本次会话切换。 */ }
      document.cookie = key + '=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax' + (sharedDomain ? '; Domain=ocp-protocol.org; Secure' : '');
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
    window.dispatchEvent(new Event('ocp-theme-change'));
  };
  apply(read(), false);
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-theme-toggle]')) {
      apply(document.documentElement.dataset.ocpTheme === 'dark' ? 'light' : 'dark', true);
    }
  });
  window.addEventListener('storage', event => { if (event.key === key && valid(event.newValue)) apply(event.newValue, false); });
  window.addEventListener('pageshow', () => apply(read(), false));
})();
