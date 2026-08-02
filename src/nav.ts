import { NAV_LINKS } from './constants';

const LS_THEME = 'vek_theme';

export function applyTheme(): void {
  const t = localStorage.getItem(LS_THEME) ?? 'dark';
  document.documentElement.setAttribute('data-theme', t);
}

export function renderTopnav(activeHref: string): void {
  applyTheme();
  const nav = document.getElementById('topnav')!;
  const isDark = () => (localStorage.getItem(LS_THEME) ?? 'dark') === 'dark';

  const links = NAV_LINKS.map(l =>
    `<a href="${l.href}"${l.href === activeHref ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
  ).join('');

  nav.innerHTML = links +
    `<button id="theme-toggle" class="btn-theme" title="Växla ljust/mörkt tema">${isDark() ? '☀️' : '🌙'}</button>`;

  document.getElementById('theme-toggle')!.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(LS_THEME, next);
    (document.getElementById('theme-toggle') as HTMLButtonElement).textContent = next === 'dark' ? '☀️' : '🌙';
  });
}
