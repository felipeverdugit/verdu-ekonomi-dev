<script lang="ts">
  import { NAV_LINKS } from '../constants';

  interface Props { active: string; }
  let { active }: Props = $props();

  function toggleTheme() {
    const html = document.documentElement;
    const cur  = html.getAttribute('data-theme') ?? 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('vek_theme', next);
  }
</script>

<nav class="topnav">
  {#each NAV_LINKS as link}
    <a href={link.href} class:active={link.href === active}>{link.icon} {link.label}</a>
  {/each}
  <button class="theme-toggle" onclick={toggleTheme} title="Byt tema">☀️/🌙</button>
</nav>

<style>
  .theme-toggle {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: .9rem;
    color: var(--muted);
    padding: 4px 8px;
  }
  .theme-toggle:hover { color: var(--fg); }
</style>
