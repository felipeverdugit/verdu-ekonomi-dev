/**
 * syncWidget — moln-sync via Firebase Realtime Database.
 * Synkar: FireSettings, EkonomiData, Historik, Budget, Kvartal, Avkastning.
 */
import {
  pushFireSettings, pullFireSettings,
  pushEkonomiData,  pullEkonomiData,
  pushHistorik,     pullHistorik,
  pushBudget,       pullBudget,
  pushKvartal,      pullKvartal,
  pushAvkastning,   pullAvkastning,
  ensureAuth,
} from './firebase';
import { fireStore, ekStore, historikStore, budgetStore, kvartalStore, avkastningStore } from './store';
import type { FireSettings } from './types';

type OnPull = (s: FireSettings) => void;

let _onPull: OnPull | null = null;

export function initSyncWidget(onPullCallback?: OnPull): void {
  // Om callback anges, uppdatera (utan att rensa befintlig)
  if (onPullCallback !== undefined) _onPull = onPullCallback;

  const bar = document.getElementById('sync-bar');
  if (!bar) return;

  // Idempotent: om knapparna redan finns, lägg bara till callback och avsluta
  if (bar.querySelector('.sync-bar')) return;

  bar.innerHTML = `
    <div class="sync-bar">
      <span class="sync-user">☁️ Molnsynk</span>
      <button class="btn btn-secondary sync-btn" id="btn-push">⬆ Spara till moln</button>
      <button class="btn btn-secondary sync-btn" id="btn-pull">⬇ Hämta från moln</button>
      <span class="sync-msg" id="sync-msg"></span>
    </div>`;

  document.getElementById('btn-push')!.addEventListener('click', handlePush);
  document.getElementById('btn-pull')!.addEventListener('click', handlePull);
}

function showMsg(text: string, error = false, ms = 3000): void {
  const el = document.getElementById('sync-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? 'var(--red)' : 'var(--green)';
  setTimeout(() => { if (el) el.textContent = ''; }, ms);
}

// Kvartal och avkastning hanteras via typade stores i store.ts

// ── Push (lokal → moln) ────────────────────────────────────────────────────────
async function handlePush(): Promise<void> {
  const btn = document.getElementById('btn-push') as HTMLButtonElement;
  btn.disabled = true;
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
    showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), true);
  } finally {
    btn.disabled = false;
  }
}

// ── Pull (moln → lokal) ────────────────────────────────────────────────────────
async function handlePull(): Promise<void> {
  const btn = document.getElementById('btn-pull') as HTMLButtonElement;
  btn.disabled = true;
  try {
    await ensureAuth();
    const [s, ek, hist, bd, kv, avk] = await Promise.all([
      pullFireSettings(),
      pullEkonomiData(),
      pullHistorik(),
      pullBudget(),
      pullKvartal(),
      pullAvkastning(),
    ]);

    if (s) {
      (Object.entries(s) as [keyof FireSettings, FireSettings[keyof FireSettings]][])
        .forEach(([k, v]) => fireStore.setField(k, v as never));
      _onPull?.(s);
    }
    if (ek)   ekStore.set(ek);
    if (hist?.length) historikStore.save(hist);
    if (bd)   (Object.keys(bd) as (keyof typeof bd)[])
                .forEach(k => budgetStore.setField(k, bd[k]));
    if (kv)   kvartalStore.set(kv);
    if (avk)  avkastningStore.save(avk);

    const changed = s ?? ek ?? hist ?? bd ?? kv ?? avk;
    showMsg(`✓ Hämtat ${new Date().toLocaleTimeString('sv-SE')}`);
    if (changed) setTimeout(() => location.reload(), 800);
  } catch (e: unknown) {
    showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), true);
  } finally {
    btn.disabled = false;
  }
}
