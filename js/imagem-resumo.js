// Imagem vertical (1080 × 1920) para partilhar no telemóvel — desenhada em Canvas no próprio
// dispositivo (sem bibliotecas nem servidores). Usa só dados "visíveis ao cliente" (visao-cliente.js).
import { def } from './repo.js';
import { num } from './util.js';
import { ESCALAS_CHECKIN } from './catalogos.js';

const L = 1080, A = 1920, M = 72;
const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const dm = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

// Texto escuro ou claro conforme a cor de fundo (contraste).
function corTextoSobre(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#FFFFFF';
}
const carregarImagem = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// Escreve texto com quebra de linha; devolve o y seguinte.
function texto(ctx, t, x, y, { tam = 36, peso = 400, cor = '#1B1F24', larg = L - 2 * M, alt = 1.3, max = 4 } = {}) {
  ctx.font = `${peso} ${tam}px ${FONTE}`;
  ctx.fillStyle = cor;
  const palavras = String(t).split(/\s+/);
  let linha = '', n = 0;
  for (const p of palavras) {
    const teste = linha ? `${linha} ${p}` : p;
    if (ctx.measureText(teste).width > larg && linha) {
      ctx.fillText(linha, x, y); y += tam * alt; linha = p;
      if (++n >= max - 1) { linha = `${linha}…`; break; }
    } else linha = teste;
  }
  ctx.fillText(linha, x, y);
  return y + tam * alt;
}

function cartao(ctx, x, y, w, h, cor = '#F1F2F4') {
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 28) : ctx.rect(x, y, w, h);
  ctx.fill();
}

async function base(titulo, subtitulo, nomeCliente) {
  const marca = def('negocio');
  const cv = Object.assign(document.createElement('canvas'), { width: L, height: A });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#FCFCFB';
  ctx.fillRect(0, 0, L, A);
  // Cabeçalho com a marca
  ctx.fillStyle = marca.cor_principal;
  ctx.fillRect(0, 0, L, 360);
  const tinta = corTextoSobre(marca.cor_principal);
  const logo = marca.logo ? await carregarImagem(marca.logo) : null;
  if (logo) {
    const h = 90, w = Math.min(380, (logo.width / logo.height) * h);
    ctx.drawImage(logo, M, 56, w, h);
  } else texto(ctx, marca.nome, M, 120, { tam: 44, peso: 800, cor: tinta });
  texto(ctx, titulo, M, 230, { tam: 64, peso: 800, cor: tinta });
  texto(ctx, `${nomeCliente} · ${subtitulo}`, M, 300, { tam: 36, cor: tinta });
  ctx.fillStyle = marca.cor_secundaria;
  ctx.fillRect(0, 360, L, 12);
  return { cv, ctx, marca };
}

function kpis(ctx, y, lista, cor) {
  const w = (L - 2 * M - 2 * 24) / 3;
  lista.slice(0, 3).forEach(([valor, rotulo], i) => {
    const x = M + i * (w + 24);
    cartao(ctx, x, y, w, 200);
    ctx.textAlign = 'center';
    texto(ctx, valor, x + w / 2, y + 100, { tam: 68, peso: 800, cor, larg: w - 20 });
    texto(ctx, rotulo, x + w / 2, y + 160, { tam: 30, cor: '#5F6B7A', larg: w - 20 });
    ctx.textAlign = 'left';
  });
  return y + 240;
}

function seccao(ctx, y, titulo) {
  return texto(ctx, titulo, M, y, { tam: 40, peso: 800 }) + 4;
}

function metas(ctx, y, lista, cor, max = 3) {
  for (const m of lista.slice(0, max)) {
    y = texto(ctx, m.titulo, M, y, { tam: 34, peso: 600, max: 1 });
    cartao(ctx, M, y - 18, L - 2 * M, 26, '#E3E6EB');
    ctx.fillStyle = cor;
    ctx.fillRect(M, y - 18, Math.max(26, (L - 2 * M) * m.p.progresso), 26);
    y = texto(ctx, `${Math.round(m.p.progresso * 100)}%${m.p.atingida ? ' · atingida! 🎉' : ''}`, M, y + 46, { tam: 30, cor: '#5F6B7A' }) + 10;
  }
  return y;
}

const blob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

// ---------------------------------------------------------------- Resumo semanal
export async function imagemSemana(c, r) {
  const nome = c.nome.replace(/\(.*?\)/g, '').trim();
  const { cv, ctx, marca } = await base('Resumo da semana', `${dm(r.de)} – ${dm(r.ate)}`, nome);
  let y = kpis(ctx, 420, [
    [`${r.sessoes}${r.combinado ? `/${r.combinado}` : ''}`, 'treinos'],
    [`🔥 ${r.streak}`, 'semanas seguidas'],
    [`${r.prs.length}`, r.prs.length === 1 ? 'recorde' : 'recordes'],
  ], marca.cor_principal);

  if (r.prs.length) {
    y = seccao(ctx, y + 40, '🏆 Recordes da semana');
    for (const p of r.prs.slice(0, 4)) y = texto(ctx, `${p.nome}: ${num(p.valor)} kg (1RM est.) · +${num(p.ganho, 0)}%`, M, y + 6, { tam: 34, max: 2 });
  }
  if (r.metas.length) { y = seccao(ctx, y + 40, '🎯 Metas'); y = metas(ctx, y + 10, r.metas, marca.cor_secundaria); }
  if (r.checkin) {
    y = seccao(ctx, y + 30, '📝 Check-in');
    y = texto(ctx, ESCALAS_CHECKIN.map((e) => `${e.nome.split(' ')[0]} ${r.checkin[e.id]}/5`).join('   ·   '), M, y + 6, { tam: 32, cor: '#5F6B7A' });
  }
  if (r.foco) {
    y += 30;
    cartao(ctx, M, y, L - 2 * M, 200, '#EAF1FC');
    texto(ctx, 'Foco da próxima semana', M + 36, y + 64, { tam: 32, peso: 700, cor: '#2A5DB0' });
    texto(ctx, r.foco, M + 36, y + 120, { tam: 36, larg: L - 2 * M - 72, max: 2 });
    y += 230;
  }
  texto(ctx, 'Continua assim! 💪', M, Math.max(y + 60, A - 140), { tam: 44, peso: 800, cor: marca.cor_principal });
  texto(ctx, marca.nome, M, A - 60, { tam: 28, cor: '#898781' });
  return blob(cv);
}

// ---------------------------------------------------------------- Relatório de período
export async function imagemRelatorio(c, r) {
  const nome = c.nome.replace(/\(.*?\)/g, '').trim();
  const { cv, ctx, marca } = await base('O teu progresso', `${dm(r.de)} – ${dm(r.ate)}`, nome);
  let y = kpis(ctx, 420, [
    [`${r.sessoes}`, 'treinos'],
    [r.assiduidade != null ? `${r.assiduidade}%` : '—', 'do combinado'],
    [`${r.prs.length}`, r.prs.length === 1 ? 'recorde' : 'recordes'],
  ], marca.cor_principal);
  if (r.melhorias.length) {
    y = seccao(ctx, y + 40, '📈 O que melhorou');
    for (const m of r.melhorias.slice(0, 4)) {
      y = texto(ctx, m.texto, M, y + 6, { tam: 34, peso: 600, max: 2 });
      y = texto(ctx, m.extra, M, y - 4, { tam: 28, cor: '#1E8E5A' });
    }
  }
  if (r.prs.length) {
    y = seccao(ctx, y + 30, '🏆 Recordes');
    for (const p of r.prs.slice(0, 3)) y = texto(ctx, `${p.nome}: ${num(p.valor)} kg (1RM est.)`, M, y + 6, { tam: 32 });
  }
  if (r.metas.length) { y = seccao(ctx, y + 30, '🎯 Metas'); y = metas(ctx, y + 10, r.metas, marca.cor_secundaria, 2); }
  texto(ctx, `🔥 ${r.streak} semana(s) seguida(s)`, M, Math.max(y + 50, A - 150), { tam: 40, peso: 800, cor: marca.cor_principal });
  texto(ctx, marca.nome, M, A - 60, { tam: 28, cor: '#898781' });
  return blob(cv);
}

// Partilha a imagem (no iPhone abre a folha de partilha → WhatsApp anexa a imagem); senão descarrega.
export async function partilharOuDescarregar(b, nome) {
  const f = new File([b], nome, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return 'partilhada'; } catch (e) { if (e.name === 'AbortError') return 'cancelada'; }
  }
  const url = URL.createObjectURL(b);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'descarregada';
}
