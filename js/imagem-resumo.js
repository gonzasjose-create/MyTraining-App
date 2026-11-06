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

// Mistura uma cor com branco (fundos suaves na cor da marca).
function suave(hex, p) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * p + 255 * (1 - p)));
  return `rgb(${c.join(',')})`;
}
// Grelha de KPIs com altura ajustável (até 3 por linha).
function grelhaKpis(ctx, y, lista, cor, h = 170) {
  const w = (L - 2 * M - 2 * 24) / 3;
  lista.forEach(([valor, rotulo], i) => {
    const x = M + (i % 3) * (w + 24), yy = y + Math.floor(i / 3) * (h + 20);
    cartao(ctx, x, yy, w, h);
    ctx.textAlign = 'center';
    texto(ctx, valor, x + w / 2, yy + h * 0.5, { tam: 58, peso: 800, cor, larg: w - 20, max: 1 });
    texto(ctx, rotulo, x + w / 2, yy + h * 0.82, { tam: 26, cor: '#5F6B7A', larg: w - 16, max: 1 });
    ctx.textAlign = 'left';
  });
  return y + Math.ceil(lista.length / 3) * (h + 20);
}
const tempoTotal = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
const vol = (kg) => (kg >= 1000 ? `${num(kg / 1000, 1)} t` : `${num(kg, 0)} kg`);

// ---------------------------------------------------------------- Resumo semanal
export async function imagemSemana(c, r) {
  const nome = c.nome.replace(/\(.*?\)/g, '').trim();
  const { cv, ctx, marca } = await base('Resumo da semana', `${dm(r.de)} – ${dm(r.ate)}`, nome);
  const LIMITE = A - 150; // espaço do rodapé
  const cabe = (y, h) => y + h <= LIMITE;
  const lista = [[`${r.sessoes}${r.combinado ? `/${r.combinado}` : ''}`, 'treinos']];
  if (r.minutos) lista.push([tempoTotal(r.minutos), 'tempo total']);
  if (r.volume) lista.push([vol(r.volume), 'volume']);
  if (r.series) lista.push([`${r.series}`, 'séries'], [`${r.reps}`, 'repetições']);
  if (r.rpeMedio != null) lista.push([num(r.rpeMedio), 'RPE médio']);
  else if (r.cargaMedia) lista.push([vol(r.cargaMedia), 'por sessão']);
  let y = grelhaKpis(ctx, 400, lista.slice(0, 6), marca.cor_principal, 150);
  if (r.pcReps && !r.pcIncluido) y = texto(ctx, `+ ${r.pcReps} repetições com peso corporal`, M, y + 20, { tam: 30, cor: '#5F6B7A' }) - 10;

  // Equivalente (o primeiro): cartão na cor da marca com ícone grande.
  const eq = r.equivalentes?.[0];
  if (eq && cabe(y + 10, 170)) {
    y += 10;
    cartao(ctx, M, y, L - 2 * M, 170, suave(marca.cor_secundaria, 0.16));
    ctx.font = `100px ${FONTE}`;
    ctx.fillText(eq.icone, M + 30, y + 122);
    texto(ctx, eq.texto, M + 180, y + 70, { tam: 34, peso: 700, larg: L - 2 * M - 210, max: 3, alt: 1.25 });
    y += 180;
  }
  if (r.distancia_m && cabe(y, 70)) {
    y = texto(ctx, `🏃 ${num(r.distancia_m / 1000, 1)} km${r.ritmoKm ? ` · ritmo médio ${tempoMin(r.ritmoKm)}/km` : ''}`, M, y + 44, { tam: 36, peso: 600 });
  }
  // Volume por grupo (barras).
  const grupos = (r.porGrupo || []).slice(0, 4);
  if (grupos.length && cabe(y + 20, 60 + grupos.length * 50)) {
    y = seccao(ctx, y + 44, 'Volume por grupo muscular');
    const max = grupos[0][1], x0 = M + 250, larg = L - 2 * M - 250 - 150;
    for (const [g, kg] of grupos) {
      texto(ctx, g, M, y + 26, { tam: 30, larg: 240, max: 1 });
      cartao(ctx, x0, y, larg, 30, '#E3E6EB');
      ctx.fillStyle = marca.cor_secundaria;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x0, y, Math.max(30, larg * (kg / max)), 30, 15) : ctx.rect(x0, y, larg * (kg / max), 30);
      ctx.fill();
      ctx.textAlign = 'right';
      texto(ctx, vol(kg), L - M, y + 26, { tam: 28, peso: 700, larg: 150 });
      ctx.textAlign = 'left';
      y += 50;
    }
  }
  if (r.prs.length && cabe(y + 30, 110)) {
    y = seccao(ctx, y + 40, '🏆 Recordes da semana');
    for (const p of r.prs.slice(0, 3)) if (cabe(y, 50)) y = texto(ctx, `${p.nome}: ${num(p.valor)} kg (+${num(p.valor - p.anterior)} kg)`, M, y + 6, { tam: 32, max: 1 });
  } else if (r.melhor && cabe(y + 30, 110)) {
    y = seccao(ctx, y + 40, '⭐ Exercício da semana');
    y = texto(ctx, `${r.melhor.nome} — ${r.melhor.texto}`, M, y + 6, { tam: 32, max: 2 });
  }
  // Comparação: de preferência uma frase positiva; na imagem só a parte antes do "—".
  const comp = r.comparacao?.find((x) => /^(Mais|O mesmo|Volume semelhante)/.test(x)) || r.comparacao?.[0];
  if (comp && cabe(y + 20, 50)) y = texto(ctx, comp.split(' — ')[0], M, y + 30, { tam: 30, cor: '#1E8E5A', max: 2 });
  // O foco (mensagem do treinador) vem antes da meta; o que não couber continua no PDF.
  if (r.foco && cabe(y + 20, 140)) {
    y += 20;
    cartao(ctx, M, y, L - 2 * M, 140, '#EAF1FC');
    texto(ctx, 'Foco da próxima semana', M + 36, y + 50, { tam: 28, peso: 700, cor: '#2A5DB0' });
    texto(ctx, r.foco, M + 36, y + 98, { tam: 32, larg: L - 2 * M - 72, max: 1 });
    y += 140;
  }
  if (r.metas.length && cabe(y + 20, 150)) { y = seccao(ctx, y + 40, '🎯 Meta'); y = metas(ctx, y + 6, r.metas, marca.cor_secundaria, 1); }
  texto(ctx, `${r.streak ? `🔥 ${r.streak} semana${r.streak > 1 ? 's' : ''} seguida${r.streak > 1 ? 's' : ''} · ` : ''}Continua assim! 💪`, M, A - 95, { tam: 40, peso: 800, cor: marca.cor_principal, max: 1 });
  texto(ctx, marca.nome, M, A - 40, { tam: 28, cor: '#898781' });
  return blob(cv);
}
const tempoMin = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

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
