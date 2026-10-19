// PIN: guardado só como hash SHA-256 com sal aleatório (nunca em claro).
import { def } from './repo.js';
import { gravarDefinicao } from './db.js';

export async function hashPin(pin, sal) {
  const txt = `${sal}:${pin}`;
  if (crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  // Sem crypto.subtle (contexto não seguro): hash simples — serve para impedir acessos casuais.
  let h = 0;
  for (const ch of txt) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `s${h}`;
}

export const pinValido = (p) => /^\d{4,6}$/.test(p || '');

// chave: 'pin_cliente' (sair do modo cliente) ou 'bloqueio_app' (abrir a app).
export async function gravarPin(chave, pin, extra = {}) {
  const sal = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  gravarDefinicao(chave, { ...def(chave), ...extra, sal, hash: await hashPin(pin, sal) });
}
export async function pinCorreto(chave, pin) {
  const p = def(chave);
  return !!p?.hash && (await hashPin(pin, p.sal)) === p.hash;
}
