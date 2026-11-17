(() => {
  const root = document.documentElement;
  const defaultTheme = root.dataset.theme;
  const key = 'generator-display-theme';
  const apply = (theme) => {
    root.dataset.theme = theme === 'light' || theme === 'dark' ? theme : defaultTheme;
    const select = document.getElementById('displayTheme');
    if (select) select.value = root.dataset.theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = root.dataset.theme === 'dark' ? '#10151c' : '#f4f5f7';
  };

  try {
    apply(localStorage.getItem(key));
  } catch {
    apply(defaultTheme);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('displayTheme');
    select.value = root.dataset.theme;
    select.disabled = false;
    select.addEventListener('change', () => {
      apply(select.value);
      try {
        localStorage.setItem(key, select.value);
      } catch {
        // Keep the current page usable when browser storage is unavailable.
      }
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
