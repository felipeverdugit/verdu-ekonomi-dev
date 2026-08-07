import { NAV_LINKS } from './constants';

const LS_THEME = 'vek_theme';

// ── Info-modal ────────────────────────────────────────────────────────────────
export interface InfoSection {
  heading: string;
  html: string;  // kan innehålla <ul>, <strong> etc.
}

export function injectInfoBtn(title: string, sections: InfoSection[]): void {
  // Lägg till knappen intill h1
  const h1 = document.querySelector('h1');
  if (!h1) return;

  // Wrap h1 + knapp i en flex-rad om det inte redan är gjort
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;align-items:center;margin-bottom:6px';
  h1.parentNode!.insertBefore(wrapper, h1);
  h1.style.margin = '0';
  wrapper.appendChild(h1);

  const btn = document.createElement('button');
  btn.className = 'btn-info';
  btn.title = 'Om den här sidan';
  btn.textContent = 'i';
  wrapper.appendChild(btn);

  btn.addEventListener('click', () => openInfoModal(title, sections));
}

function openInfoModal(title: string, sections: InfoSection[]): void {
  // Ta bort eventuellt existerande modal
  document.getElementById('__info-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = '__info-backdrop';
  backdrop.className = 'info-backdrop';

  const sectionsHtml = sections.map(s => `
    <div class="info-modal-section">
      <h3>${s.heading}</h3>
      ${s.html}
    </div>
  `).join('');

  backdrop.innerHTML = `
    <div class="info-modal" role="dialog" aria-modal="true">
      <div class="info-modal-header">
        <div class="info-modal-title">${title}</div>
        <button class="info-modal-close" id="__info-close">✕</button>
      </div>
      ${sectionsHtml}
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  document.getElementById('__info-close')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
  });
}

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
