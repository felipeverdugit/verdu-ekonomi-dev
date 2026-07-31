/**
 * syncWidget — enkel moln-sync utan inloggning.
 * Säkerhet via Firebase-regler på /verdu-sökvägen.
 */
import {
  pushFireSettings, pullFireSettings,
  pushEkonomiData, pullEkonomiData,
  pushHistorik, pullHistorik,
} from './firebase';
import { fireStore, ekStore, historikStore } from './store';
import type { FireSettings } from './types';

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

async function handlePush(): Promise<void> {
  try {
    await Promise.all([
      pushFireSettings(fireStore.get()),
      pushEkonomiData(ekStore.get()),
      pushHistorik(historikStore.load()),
    ]);
    showMsg(`✓ Sparat ${new Date().toLocaleTimeString('sv-SE')}`);
  } catch (e: unknown) {
    showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), true);
  }
}

async function handlePull(): Promise<void> {
  try {
    const [s, ek, hist] = await Promise.all([
      pullFireSettings(),
      pullEkonomiData(),
      pullHistorik(),
    ]);
    if (s) {
      (Object.entries(s) as [keyof FireSettings, FireSettings[keyof FireSettings]][])
        .forEach(([k, v]) => fireStore.setField(k, v as never));
      _onPull?.(s);
    }
    if (ek) ekStore.set(ek);
    if (hist?.length) historikStore.save(hist);
    showMsg(`✓ Hämtat ${new Date().toLocaleTimeString('sv-SE')}`);
    if (s ?? ek ?? hist) setTimeout(() => location.reload(), 800);
  } catch (e: unknown) {
    showMsg('Fel: ' + (e instanceof Error ? e.message : String(e)), true);
  }
}
