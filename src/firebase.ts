import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import type { FireSettings, Snapshot, EkonomiData, BudgetData, KvartalData, AvkastningData } from './types';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FB_APP_ID,
  databaseURL:       import.meta.env.VITE_FB_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── FIRE-inställningar ────────────────────────────────────────────────────────
export async function pushFireSettings(s: FireSettings): Promise<void> {
  await set(ref(db, 'verdu/fire-settings'), s);
}

export async function pullFireSettings(): Promise<FireSettings | null> {
  const snap = await get(ref(db, 'verdu/fire-settings'));
  return snap.exists() ? (snap.val() as FireSettings) : null;
}

// ── EkonomiData ───────────────────────────────────────────────────────────────
export async function pushEkonomiData(ek: EkonomiData): Promise<void> {
  await set(ref(db, 'verdu/ekonomi'), ek);
}

export async function pullEkonomiData(): Promise<EkonomiData | null> {
  const snap = await get(ref(db, 'verdu/ekonomi'));
  return snap.exists() ? (snap.val() as EkonomiData) : null;
}

// ── Historik ──────────────────────────────────────────────────────────────────
export async function pushHistorik(snaps: Snapshot[]): Promise<void> {
  await set(ref(db, 'verdu/historik'), snaps);
}

export async function pullHistorik(): Promise<Snapshot[] | null> {
  const snap = await get(ref(db, 'verdu/historik'));
  if (!snap.exists()) return null;
  const val = snap.val();
  return Array.isArray(val) ? val : Object.values(val);
}

// ── Budget ────────────────────────────────────────────────────────────────────
export async function pushBudget(bd: BudgetData): Promise<void> {
  await set(ref(db, 'verdu/budget'), bd);
}

export async function pullBudget(): Promise<BudgetData | null> {
  const snap = await get(ref(db, 'verdu/budget'));
  return snap.exists() ? (snap.val() as BudgetData) : null;
}

// ── Kvartalsinmatning ─────────────────────────────────────────────────────────
export async function pushKvartal(kv: KvartalData): Promise<void> {
  await set(ref(db, 'verdu/kvartal'), kv);
}

export async function pullKvartal(): Promise<KvartalData | null> {
  const snap = await get(ref(db, 'verdu/kvartal'));
  return snap.exists() ? (snap.val() as KvartalData) : null;
}

// ── Avkastningslogg ───────────────────────────────────────────────────────────
export async function pushAvkastning(data: AvkastningData): Promise<void> {
  await set(ref(db, 'verdu/avkastning'), data);
}

export async function pullAvkastning(): Promise<AvkastningData | null> {
  const snap = await get(ref(db, 'verdu/avkastning'));
  return snap.exists() ? (snap.val() as AvkastningData) : null;
}
