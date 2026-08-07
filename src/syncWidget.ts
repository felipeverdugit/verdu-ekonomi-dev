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
} from './firebase';
import { fireStore, ekStore, historikStore, budgetStore } from './store';
import type { FireSettings, KvartalData, AvkastningData } from './types';

type OnPull = (s: FireSettings) => void;

let _onPull: OnPull | null = null;

export function initSyncWidget(onPullCallback?: OnPull): void {
  _onPull = onPullCallback ?? null;

  const bar = document.getElementById('sync-bar');
  if (!bar) return;

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

// ── Hjälp: läs kvartal från localStorage ─────────────────────────────────────
function readKvartalFromLS(): KvartalData {
  const g = (key: string) => parseFloat(localStorage.getItem(key) ?? '0') || 0;
  return {
    faktisk: g('vek_kv_faktisk_mon'),
    pension: g('vek_kv_pension_mon'),
    buffert: g('vek_kv_buffert'),
    rorelse: g('vek_kv_rorelse'),
  };
}

function writeKvartalToLS(kv: KvartalData): void {
  localStorage.setItem('vek_kv_faktisk_mon', String(kv.faktisk));
  localStorage.setItem('vek_kv_pension_mon', String(kv.pension));
  localStorage.setItem('vek_kv_buffert',     String(kv.buffert));
  localStorage.setItem('vek_kv_rorelse',     String(kv.rorelse));
}

// ── Hjälp: läs avkastning från localStorage ───────────────────────────────────
function readAvkFromLS(): AvkastningData {
  const rows  = JSON.parse(localStorage.getItem('vek_avk_rows')  ?? '[]');
  const start = JSON.parse(localStorage.getItem('vek_avk_start') ?? 'null')
    ?? { year: new Date().getFullYear() - 1, lysaKr: 0, tjpSveKr: 0, tjpNorKr: 0 };
  return { rows, start };
}

function writeAvkToLS(data: AvkastningData): void {
  localStorage.setItem('vek_avk_rows',  JSON.stringify(data.rows));
  localStorage.setItem('vek_avk_start', JSON.stringify(data.start));
}

// ── Push (lokal → moln) ────────────────────────────────────────────────────────
async function handlePush(): Promise<void> {
  const btn = document.getElementById('btn-push') as HTMLButtonElement;
  btn.disabled = true;
  try {
    await Promise.all([
      pushFireSettings(fireStore.get()),
      pushEkonomiData(ekStore.get()),
      pushHistorik(historikStore.load()),
      pushBudget(budgetStore.get()),
      pushKvartal(readKvartalFromLS()),
      pushAvkastning(readAvkFromLS()),
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
    if (kv)   writeKvartalToLS(kv);
    if (avk)  writeAvkToLS(avk);

    const changed = s ?? ek ?? hist ?? bd ?? kv ?? avk;
    showMsg(`✓ Hämtat ${new Date().toLocaleTimeString('sv-SE')}`);
    if (changed) setTimeout(() => location.reload(), 800);
  } catch (e: unknown) {
    showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), true);
  } finally {
    btn.disabled = false;
  }
}
