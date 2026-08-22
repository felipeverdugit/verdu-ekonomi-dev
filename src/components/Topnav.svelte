<script lang="ts">
  import { NAV_LINKS } from '../constants';
  import {
    pushFireSettings, pullFireSettings,
    pushEkonomiData,  pullEkonomiData,
    pushHistorik,     pullHistorik,
    pushBudget,       pullBudget,
    pushKvartal,      pullKvartal,
    pushAvkastning,   pullAvkastning,
    ensureAuth,
  } from '../firebase';
  import { fireStore, ekStore, historikStore, budgetStore, kvartalStore, avkastningStore } from '../store';
  import type { FireSettings } from '../types';

  interface Props {
    active: string;
    onPull?: (s: FireSettings) => void;
  }
  let { active, onPull }: Props = $props();

  let isDark = $state((localStorage.getItem('vek_theme') ?? 'dark') === 'dark');
  let msg    = $state('');
  let msgOk  = $state(true);
  let pushing = $state(false);
  let pulling = $state(false);

  function toggleTheme() {
    isDark = !isDark;
    const t = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('vek_theme', t);
  }

  function showMsg(text: string, ok = true, ms = 3000) {
    msg = text; msgOk = ok;
    setTimeout(() => { msg = ''; }, ms);
  }

  async function handlePush() {
    pushing = true;
    try {
      await ensureAuth();
      await Promise.all([
        pushFireSettings(fireStore.get()),
        pushEkonomiData(ekStore.get()),
        pushHistorik(historikStore.load()),
        pushBudget(budgetStore.get()),
        pushKvartal(kvartalStore.get()),
        pushAvkastning(avkastningStore.get()),
      ]);
      showMsg(`✓ Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
    } catch (e: unknown) {
      showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), false);
    } finally {
      pushing = false;
    }
  }

  async function handlePull() {
    pulling = true;
    try {
      await ensureAuth();
      const [s, ek, hist, bd, kv, avk] = await Promise.all([
        pullFireSettings(), pullEkonomiData(), pullHistorik(),
        pullBudget(), pullKvartal(), pullAvkastning(),
      ]);
      if (s) {
        (Object.entries(s) as [keyof FireSettings, FireSettings[keyof FireSettings]][])
          .forEach(([k, v]) => fireStore.setField(k, v as never));
        onPull?.(s);
      }
      if (ek)   ekStore.set(ek);
      if (hist?.length) historikStore.save(hist);
      if (bd)   (Object.keys(bd) as (keyof typeof bd)[]).forEach(k => budgetStore.setField(k, bd[k]));
      if (kv)   kvartalStore.set(kv);
      if (avk)  avkastningStore.save(avk);
      const changed = s ?? ek ?? hist ?? bd ?? kv ?? avk;
      showMsg(`✓ Hämtat ${new Date().toLocaleTimeString('sv-SE')}`);
      if (changed) setTimeout(() => location.reload(), 800);
    } catch (e: unknown) {
      showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), false);
    } finally {
      pulling = false;
    }
  }
</script>

<nav class="topnav">
  {#each NAV_LINKS as link}
    <a href={link.href} class:active={link.href === active}>{link.icon} {link.label}</a>
  {/each}
  <button class="btn-theme" title="Växla ljust/mörkt" onclick={toggleTheme}>{isDark ? '☀️' : '🌙'}</button>
</nav>

<div class="sync-bar-wrap">
  <span class="sync-lbl">☁️ Molnsynk</span>
  <button class="btn btn-secondary sync-btn" disabled={pushing} onclick={handlePush}>
    {pushing ? '…' : '⬆ Spara till moln'}
  </button>
  <button class="btn btn-secondary sync-btn" disabled={pulling} onclick={handlePull}>
    {pulling ? '…' : '⬇ Hämta från moln'}
  </button>
  {#if msg}
    <span class="sync-msg" style:color={msgOk ? 'var(--green)' : 'var(--red)'}>{msg}</span>
  {/if}
</div>

<style>
  .sync-bar-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 0 10px; flex-wrap: wrap;
  }
  .sync-lbl { font-size: .78rem; color: var(--muted); }
  .sync-btn  { font-size: .78rem; padding: 4px 12px; }
  .sync-msg  { font-size: .82rem; }
  .btn-theme {
    margin-left: auto; background: none; border: none;
    cursor: pointer; font-size: .9rem; color: var(--muted); padding: 4px 8px;
  }
  .btn-theme:hover { color: var(--text); }
</style>
