const HASH        = import.meta.env.VITE_APP_PWD_HASH as string | undefined;
const SESSION_KEY = 'vek_authed';

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function initAuth(): Promise<void> {
  if (!HASH) return;
  if (sessionStorage.getItem(SESSION_KEY) === 'true') return;

  const page = document.querySelector<HTMLElement>('.page');
  if (page) page.style.visibility = 'hidden';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#111';
  overlay.innerHTML = `
    <div style="background:#1e1e2e;border:1px solid #333;border-radius:16px;padding:40px 32px;max-width:340px;width:90%;text-align:center">
      <div style="font-size:2rem;margin-bottom:14px">🔐</div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">Verdu Ekonomi</div>
      <div style="color:#888;font-size:.85rem;margin-bottom:22px">Ange lösenord för att fortsätta</div>
      <input type="password" id="ve-pwd" placeholder="Lösenord" autocomplete="current-password"
        style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:8px;border:1px solid #444;background:transparent;color:#fff;font-size:1rem;margin-bottom:10px">
      <button id="ve-btn"
        style="width:100%;padding:11px;border-radius:8px;border:none;background:#4a9eff;color:#fff;font-size:1rem;font-weight:600;cursor:pointer">
        Logga in
      </button>
      <div id="ve-err" style="color:#ff5555;font-size:.83rem;margin-top:10px;min-height:18px"></div>
    </div>`;
  document.body.appendChild(overlay);

  return new Promise(resolve => {
    const input = document.getElementById('ve-pwd') as HTMLInputElement;
    const btn   = document.getElementById('ve-btn') as HTMLButtonElement;
    const err   = document.getElementById('ve-err')!;

    const tryLogin = async () => {
      btn.textContent = '…';
      const h = await sha256(input.value);
      if (h === HASH) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        overlay.remove();
        if (page) page.style.visibility = '';
        resolve();
      } else {
        err.textContent = 'Fel lösenord, försök igen';
        input.value = '';
        btn.textContent = 'Logga in';
        input.focus();
      }
    };

    btn.addEventListener('click', tryLogin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
    setTimeout(() => input.focus(), 50);
  });
}
