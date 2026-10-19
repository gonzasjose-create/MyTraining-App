// Sessão: Modo Treino (em curso, registo em tempo real) e edição depois de terminada.
// Ambos leem e escrevem o MESMO registo (repo-sessoes.js); não há dados paralelos.
import * as rs from '../repo-sessoes.js';
import { verificarContraindicacao, def } from '../repo.js';
import { pacoteParaData } from '../repo-pacotes.js';
import { epley } from '../calc.js';
import { DEFINICOES_PADRAO, ESTADOS_SESSAO, TIPOS_SESSAO } from '../catalogos.js';
import { html, raw, data, num, tempo, lerNum, lerTempo, aviso, Validador, mostrarErros, lerForm } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo } from './ui.js';
import { dialogoEscolherExercicio } from './escolher-exercicio.js';
import { ir } from '../app.js';
import { acoesAgendada } from './agenda.js';
import { checkinSemana } from '../repo-motivacao.js';
import { obterCliente } from '../repo.js';
import { dialogoCheckin } from './metas.js';
import { entrarModoCliente } from './modo-cliente.js';

const cfgTreino = () => ({ ...DEFINICOES_PADRAO.modo_treino, ...def('modo_treino') });
const etiquetasDisp = () => def('etiquetas');

// Estado da interface (não persistente): exercício em foco e passo de carga escolhido.
let ui = { sessaoId: null, sexAtual: null, passo: null };
let sMem = null; // sessão em memória para o relógio

export function vistaSessao(el, { sessaoId }) {
  const s = rs.obterSessao(+sessaoId);
  if (!s) return ir('/');
  if (s.estado === 'agendada') return vistaAgendada(el, s);
  return s.estado === 'em_curso' ? vistaVivo(el, s) : vistaEdicao(el, s);
}

// Sessão ainda agendada: as ações são as da agenda (iniciar, remarcar, falta, cancelar).
function vistaAgendada(el, s) {
  el.innerHTML = html`${cabecalho(`Sessão agendada · ${data(s.data)}`, { voltar: `/cliente/${s.cliente_id}?tab=sessoes` })}
    <div class="cartao"><p><a href="#/cliente/${s.cliente_id}">${s.cliente_nome}</a> · ${s.hora_inicio?.slice(11, 16)} ·
      ${s.tipo === 'reavaliacao' ? 'Reavaliação' : s.plano_sessao_nome || TIPOS_SESSAO[s.tipo]}</p>
      <button class="btn btn-grande btn-iniciar" id="acoes">Ações (iniciar, remarcar, falta…)</button></div>`;
  const abrir = () => acoesAgendada(s, () => vistaSessao(el, { sessaoId: s.id }));
  el.querySelector('#acoes').onclick = abrir;
}

// ====================================================================== Descanso (persistido localmente)
const CHAVE_DESC = 'treino:descanso';
function lerDescanso() {
  try { return JSON.parse(localStorage.getItem(CHAVE_DESC)); } catch { return null; }
}
function gravarDescanso(d) {
  try { d ? localStorage.setItem(CHAVE_DESC, JSON.stringify(d)) : localStorage.removeItem(CHAVE_DESC); } catch { /* sem storage: só em memória */ }
  descansoMem = d;
}
let descansoMem = null;
const descanso = () => lerDescanso() ?? descansoMem;

// Som curto (WebAudio). O contexto é desbloqueado no 1.º toque (exigência do iPhone).
let ctxAudio = null;
function desbloquearAudio() {
  try {
    ctxAudio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
  } catch { ctxAudio = null; }
}
function sinalFimDescanso() {
  const cfg = cfgTreino();
  if (cfg.vibrar && navigator.vibrate) { try { navigator.vibrate([150, 80, 150]); } catch { /* ignorar */ } }
  if (cfg.som && ctxAudio) {
    try {
      [0, 0.25].forEach((t) => {
        const o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.15, ctxAudio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + t + 0.18);
        o.connect(g).connect(ctxAudio.destination);
        o.start(ctxAudio.currentTime + t);
        o.stop(ctxAudio.currentTime + t + 0.2);
      });
    } catch { /* ignorar */ }
  }
}

// ====================================================================== Wake Lock (ecrã ligado)
let wakeLock = null;
async function pedirWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
  } catch { wakeLock = null; } // não suportado / recusado: falha silenciosa
}
function largarWakeLock() {
  try { wakeLock?.release(); } catch { /* ignorar */ }
  wakeLock = null;
}

// ====================================================================== MODO TREINO
function vistaVivo(el, s) {
  document.body.classList.add('modo-treino');
  if (ui.sessaoId !== s.id) ui = { sessaoId: s.id, sexAtual: null, passo: null };
  const render = () => {
    const s2 = rs.obterSessao(s.id);
    if (!s2 || s2.estado !== 'em_curso') return void (location.hash = s2 ? `#/sessao/${s.id}` : '#/');
    desenharVivo(el, s2, render);
  };
  desenharVivo(el, s, render);

  const intervalo = setInterval(tick, 500);
  pedirWakeLock();
  const aoVoltar = () => { if (document.visibilityState === 'visible') { pedirWakeLock(); tick(); } };
  document.addEventListener('visibilitychange', aoVoltar);
  // Limpeza quando se sai do ecrã (a sessão continua em curso na base de dados).
  return () => {
    clearInterval(intervalo);
    document.removeEventListener('visibilitychange', aoVoltar);
    largarWakeLock();
    document.body.classList.remove('modo-treino');
  };
}

function tick() {
  if (!sMem) return;
  const r = document.getElementById('relogio');
  if (r) r.textContent = tempo(rs.decorridoSeg(sMem));
  const barra = document.getElementById('descanso');
  if (!barra) return;
  const d = descanso();
  if (!d || d.sessaoId !== sMem.id) { barra.hidden = true; return; }
  const restante = d.fim ? Math.ceil((d.fim - Date.now()) / 1000) : d.restantePausa;
  barra.hidden = false;
  barra.classList.toggle('fim', restante <= 0);
  barra.classList.toggle('pausado', !d.fim);
  barra.querySelector('#desc-t').textContent = restante > 0 ? tempo(restante) : 'Pronto ✓';
  barra.querySelector('[data-acao="desc-pausa"]').textContent = d.fim ? '⏸' : '▶';
  if (restante <= 0 && !d.avisado) { sinalFimDescanso(); gravarDescanso({ ...d, avisado: true }); }
  if (restante < -8) gravarDescanso(null);
}

function iniciarDescanso(seg) {
  if (!seg) return;
  gravarDescanso({ sessaoId: sMem.id, fim: Date.now() + seg * 1000, total: seg, avisado: false });
  tick();
}

// ---------------------------------------------------------------- Desenho
function desenharVivo(el, s, render) {
  sMem = s;
  const cfg = cfgTreino();
  ui.passo ??= cfg.passo_kg;
  const atual = s.exercicios.find((e) => e.id === ui.sexAtual) || s.exercicios.find((e) => e.estado === 'pendente') || s.exercicios[0];
  ui.sexAtual = atual?.id ?? null;
  const feitas = s.exercicios.reduce((n, e) => n + e.series.filter((x) => x.estado === 'feita').length, 0);
  const total = s.exercicios.reduce((n, e) => n + e.series.length, 0);

  el.innerHTML = html`
    <div class="vivo-topo">
      <a class="voltar" href="#/cliente/${s.cliente_id}?tab=sessoes" aria-label="Sair (o treino continua em curso)" title="Sair — o treino continua em curso">‹</a>
      <div class="vivo-info"><strong>${s.cliente_nome}</strong>
        <small>${s.plano_sessao_nome || TIPOS_SESSAO[s.tipo]}${s.semana ? ` · S${s.semana}` : ''} · ${feitas}/${total} séries</small></div>
      <div class="relogio ${s.pausado_desde ? 'pausado' : ''}" id="relogio" aria-live="off">${tempo(rs.decorridoSeg(s))}</div>
      <button class="btn btn-sec btn-icone-g" data-acao="pausa" aria-label="${s.pausado_desde ? 'Retomar' : 'Pausar'}">${s.pausado_desde ? '▶' : '⏸'}</button>
      <button class="btn btn-terminar" data-acao="terminar">Terminar</button>
    </div>
    <div class="descanso" id="descanso" hidden>
      <span>Descanso</span><strong id="desc-t">0:00</strong>
      <button class="btn btn-sec btn-peq" data-acao="desc-menos">−15</button>
      <button class="btn btn-sec btn-peq" data-acao="desc-mais">+15</button>
      <button class="btn btn-sec btn-peq" data-acao="desc-pausa">⏸</button>
      <button class="btn btn-sec btn-peq" data-acao="desc-saltar">Saltar</button>
    </div>
    ${s.pausado_desde ? html`<div class="caixa caixa-aviso">Sessão em pausa — o tempo não está a contar.</div>` : ''}

    ${s.tipo === 'reavaliacao'
      ? blocoReavaliacao(s)
      : html`<div class="vivo-lista">
          ${s.exercicios.map((e) => (e.id === ui.sexAtual ? cartaoAtual(s, e, cfg) : cartaoFechado(s, e)))}
          ${s.exercicios.length ? '' : html`<p class="ajuda centro">Sessão livre: acrescenta os exercícios à medida que avanças.</p>`}
        </div>
        <button class="btn btn-sec btn-largo" data-acao="add-ex">+ Acrescentar exercício</button>`}

    ${checkinSemana(s.cliente_id) ? '' : html`<button class="btn btn-sec btn-largo" data-acao="checkin">📝 Check-in da semana (30 s)</button>`}
    <div class="cartao">
      <h3>Notas da sessão <small>(privadas)</small></h3>
      <textarea id="notas-sessao" rows="2" placeholder="Como correu, sono, energia…">${s.notas ?? ''}</textarea>
      ${chips(s.etiquetas, 'sessao')}
    </div>
    <div class="botoes vivo-rodape">
      <button class="btn btn-sec" data-acao="mostrar-cliente" title="Mostra a evolução ao cliente; voltar ao treino pede o PIN">👁 Mostrar ao cliente</button>
      <button class="btn btn-sec" data-acao="cancelar-treino">Cancelar treino</button>
    </div>
    <button class="btn btn-grande btn-terminar" data-acao="terminar">■ Terminar treino</button>`;

  ligarEventosVivo(el, s, render);
  tick();
  el.querySelector('.ex-atual')?.scrollIntoView({ block: 'nearest' });
}

function chips(lista, alvo, ids = {}) {
  return html`<div class="chips">${etiquetasDisp().map(
    (t) => html`<button type="button" class="chip ${lista.includes(t) ? 'ativo' : ''}" data-acao="etiqueta" data-alvo="${alvo}"
      data-etiqueta="${t}" data-sex="${ids.sex ?? ''}" data-serie="${ids.serie ?? ''}">${t}</button>`
  )}</div>`;
}

const textoSerie = (x) =>
  [x.carga_kg != null ? `${num(x.carga_kg)} kg` : null, x.reps != null ? `× ${x.reps}` : null, x.rpe != null ? `RPE ${num(x.rpe)}` : null].filter(Boolean).join(' ') || '—';
const textoPlano = (x) =>
  x.plan_texto || [x.plan_carga_kg != null ? `${num(x.plan_carga_kg)} kg` : null, x.plan_reps != null ? `× ${x.plan_reps}` : null, x.plan_rpe != null ? `RPE ${num(x.plan_rpe)}` : null].filter(Boolean).join(' ');

function cartaoFechado(s, e) {
  const f = e.series.filter((x) => x.estado === 'feita').length;
  const icone = e.estado === 'feito' ? '✓' : e.estado === 'saltado' ? '—' : '○';
  return html`<button class="ex-fechado estado-${e.estado}" data-acao="selecionar" data-sex="${e.id}">
    <span class="ex-icone">${icone}</span><span class="ex-nome">${e.nome}</span><span class="ex-cont">${f}/${e.series.length}</span>
  </button>`;
}

function cartaoAtual(s, e, cfg) {
  const resist = e.tipo_registo === 'resistencia';
  const hist = resist ? { ultima: null, melhor: null } : rs.historicoExercicio(s.cliente_id, e.exercicio_id, s.id);
  const ci = verificarContraindicacao(s.cliente_id, e.exercicio_id);
  const editar = e.series.find((x) => x.estado === 'pendente');
  const melhorValor = hist.melhor?.valor ?? null;
  const ultima = hist.ultima;

  return html`<section class="cartao ex-atual" data-sex="${e.id}">
    <div class="cartao-cab">
      <h2>${e.nome}</h2>
      <div class="botoes">
        <button class="btn btn-sec btn-icone" data-acao="mover" data-dir="-1" data-sex="${e.id}" aria-label="Subir">↑</button>
        <button class="btn btn-sec btn-icone" data-acao="mover" data-dir="1" data-sex="${e.id}" aria-label="Descer">↓</button>
      </div>
    </div>
    ${e.substituido_nome ? html`<p class="ajuda">Substitui: ${e.substituido_nome}</p>` : ''}
    ${e.notas_plano ? html`<p class="ajuda">Plano: ${e.notas_plano}</p>` : ''}
    ${ci.contraindicado ? html`<div class="caixa ${ci.nivel === 'evitar' ? 'caixa-alerta' : 'caixa-aviso'}"><strong>⚠ ${ci.nivel === 'evitar' ? 'Contraindicado' : 'Adaptar'}</strong>
      ${ci.alternativas.length ? html` — alternativas: ${ci.alternativas.map((a) => a.nome).join(', ')}` : ''}</div>` : ''}
    ${!resist ? html`<div class="referencias">
      <div><span>Última${ultima ? ` (${data(ultima.data).slice(0, 5)})` : ''}</span><strong>${ultima ? ultima.series.map((x) => `${num(x.carga_kg)}×${x.reps}`).join(' · ') : '—'}</strong>
        ${ultima?.series.some((x) => x.rpe) ? html`<small>RPE ${ultima.series.filter((x) => x.rpe).map((x) => num(x.rpe)).join('/')}</small>` : ''}</div>
      <div><span>Melhor 1RM est.</span><strong>${hist.melhor ? `${num(hist.melhor.valor)} kg` : '—'}</strong>
        ${hist.melhor ? html`<small>${num(hist.melhor.carga)}×${hist.melhor.reps} · ${data(hist.melhor.data).slice(0, 5)}${hist.melhor.fonte === 'avaliação' ? ' (aval.)' : ''}</small>` : ''}</div>
    </div>` : ''}

    <div class="series">
      ${e.series.map((x) => (editar && x.id === editar.id ? editorSerie(s, e, x, cfg, melhorValor, resist) : linhaSerie(x, melhorValor, resist)))}
    </div>

    <div class="botoes ex-acoes">
      <button class="btn btn-sec btn-peq" data-acao="add-serie" data-sex="${e.id}">+ Série</button>
      <button class="btn btn-sec btn-peq" data-acao="substituir" data-sex="${e.id}">⇄ Substituir</button>
      ${e.estado === 'pendente' ? html`<button class="btn btn-sec btn-peq" data-acao="saltar-ex" data-sex="${e.id}">Saltar exercício</button>` : ''}
      ${e.plano_exercicio_id ? '' : html`<button class="btn btn-sec btn-peq" data-acao="remover-ex" data-sex="${e.id}">Remover</button>`}
    </div>
    <details class="mais-serie" ${e.notas || e.etiquetas.length ? raw('open') : ''}>
      <summary>Nota e etiquetas do exercício${e.notas || e.etiquetas.length ? ' •' : ''}</summary>
      <input class="nota-ex" data-nota-ex="${e.id}" value="${e.notas ?? ''}" placeholder="Nota do exercício…">
      ${chips(e.etiquetas, 'exercicio', { sex: e.id })}
    </details>
  </section>`;
}

function linhaSerie(x, melhor, resist) {
  if (x.estado === 'pendente')
    return html`<div class="serie-linha pendente"><span class="n">${x.n}</span><span>${textoPlano(x) || 'por fazer'}</span></div>`;
  if (x.estado === 'saltada')
    return html`<div class="serie-linha saltada"><span class="n">${x.n}</span><span>saltada</span>
      <button class="btn btn-sec btn-icone" data-acao="reabrir" data-serie="${x.id}" aria-label="Reabrir">↺</button></div>`;
  const r = !resist && x.qualidade >= 1 ? epley(x.carga_kg, x.reps) : null;
  const pr = r && melhor != null && r.valor > melhor;
  const txt = resist ? [x.duracao_seg ? tempo(x.duracao_seg) : null, x.distancia_m ? `${num(x.distancia_m / 1000, 2)} km` : null, x.fc_media ? `${x.fc_media} bpm` : null, x.rpe ? `RPE ${num(x.rpe)}` : null].filter(Boolean).join(' · ') : textoSerie(x);
  return html`<div class="serie-linha feita"><span class="n">✓ ${x.n}</span>
    <span>${txt}${r ? html` <small>· 1RM ${num(r.valor)}</small>` : ''}${pr ? html` <span class="tag tag-pr">PR</span>` : ''}
      ${x.qualidade === 0 ? html` <span class="tag tag-aviso">técnica 0</span>` : ''}${x.dor ? html` <span class="tag tag-alerta">dor${x.dor_local ? `: ${x.dor_local}` : ''}</span>` : ''}
      ${x.notas ? html`<br><small>${x.notas}</small>` : ''}</span>
    <button class="btn btn-sec btn-icone" data-acao="reabrir" data-serie="${x.id}" aria-label="Editar série">✎</button></div>`;
}

function ajuste(rotulo, campoNome, valor, unidade, im = 'decimal') {
  return html`<div class="ajuste">
    <span class="aj-rot">${rotulo}</span>
    <button type="button" class="btn-aj" data-acao="menos" data-campo="${campoNome}" aria-label="Menos ${rotulo}">−</button>
    <input class="aj-val" data-campo="${campoNome}" value="${valor == null ? '' : String(valor).replace('.', ',')}" inputmode="${im}" aria-label="${rotulo}">
    <button type="button" class="btn-aj" data-acao="mais" data-campo="${campoNome}" aria-label="Mais ${rotulo}">+</button>
    <span class="aj-uni">${unidade}</span>
  </div>`;
}

function editorSerie(s, e, x, cfg, melhor, resist) {
  const totalSeries = e.series.length;
  // Dor a um toque (sempre visível); nota e etiquetas recolhidas para não empurrar os botões.
  const dor = html`<button type="button" class="chip ${x.dor ? 'ativo chip-dor' : ''}" data-acao="dor">⚠ Dor</button>`;
  const comum = html`
    <input data-campo="dor_local" value="${x.dor_local ?? ''}" placeholder="Onde dói?" ${x.dor ? '' : raw('hidden')}>
    <details class="mais-serie" ${x.notas || x.etiquetas.length ? raw('open') : ''}>
      <summary>Nota e etiquetas da série${x.notas || x.etiquetas.length ? ' •' : ''}</summary>
      <input data-campo="notas" value="${x.notas ?? ''}" placeholder="Nota da série…">
      ${chips(x.etiquetas, 'serie', { sex: e.id, serie: x.id })}
    </details>`;

  if (resist)
    return html`<div class="serie-editor" data-serie="${x.id}">
      <div class="se-cab"><strong>${e.nome}</strong>${x.plan_texto ? html` <small>plano: ${x.plan_texto}</small>` : ''}</div>
      <div class="grelha-2">
        ${campo(`dur_${x.id}`, 'Duração (m:ss ou h:mm:ss)', { valor: x.duracao_seg ? tempo(x.duracao_seg) : '', attrs: `data-campo="duracao" inputmode="numeric"` })}
        ${campo(`dist_${x.id}`, 'Distância (km)', { tipo: 'number', valor: x.distancia_m ? x.distancia_m / 1000 : '', attrs: 'data-campo="distancia"' })}
        ${campo(`fc_${x.id}`, 'FC média (bpm)', { tipo: 'number', valor: x.fc_media, attrs: 'data-campo="fc_media"' })}
      </div>
      ${ajuste('RPE', 'rpe', x.rpe, '/10')}
      <div class="linha-q">${dor}</div>
      <div class="acoes-serie"><button class="btn btn-sec" data-acao="saltar-serie">Saltar</button>
        <button class="btn btn-concluir" data-acao="concluir">✓ Concluído</button></div>
      ${comum}
    </div>`;

  const ant = e.series.filter((y) => y.n < x.n && y.estado === 'feita').pop();
  const r = x.qualidade >= 1 ? epley(x.carga_kg, x.reps) : null;
  return html`<div class="serie-editor" data-serie="${x.id}">
    <div class="se-cab"><strong>Série ${x.n} de ${totalSeries}</strong>${textoPlano(x) ? html` <small>plano: ${textoPlano(x)}${x.plan_rir != null ? ` · RIR ${x.plan_rir}` : ''}</small>` : ''}</div>
    ${ajuste('Carga', 'carga_kg', x.carga_kg, 'kg')}
    <div class="passos" role="group" aria-label="Passo da carga">
      ${[1, 2.5, 5].map((p) => html`<button type="button" class="chip ${ui.passo === p ? 'ativo' : ''}" data-acao="passo" data-v="${p}">±${num(p)}</button>`)}
    </div>
    ${ajuste('Reps', 'reps', x.reps, 'reps', 'numeric')}
    ${ajuste('RPE', 'rpe', x.rpe, '/10')}
    <div class="linha-q">
      <label>RIR <input data-campo="rir" value="${x.rir ?? ''}" inputmode="numeric" class="input-curto"></label>
      <div class="segmentado" role="group" aria-label="Qualidade técnica">
        ${[0, 1, 2].map((q) => html`<button type="button" class="${x.qualidade === q ? 'ativo' : ''}" data-acao="qualidade" data-v="${q}" title="${['falha (não conta)', 'aceitável', 'boa'][q]}">Q${q}</button>`)}
      </div>
      ${dor}
    </div>
    <div class="e1rm" id="e1rm" data-melhor="${melhor ?? ''}">${raw(textoE1rm(r, melhor))}</div>
    <div class="acoes-serie">
      ${ant ? html`<button class="btn btn-sec" data-acao="copiar">⧉ Copiar anterior</button>` : html`<span></span>`}
      <button class="btn btn-sec" data-acao="saltar-serie">Saltar</button>
      <button class="btn btn-concluir" data-acao="concluir">✓ Série concluída</button>
    </div>
    ${comum}
  </div>`;
}

// Devolve HTML (só números formatados e texto fixo — sem dados do utilizador).
function textoE1rm(r, melhor) {
  if (!r) return '';
  const pr = melhor != null && r.valor > melhor;
  return `1RM est.: <strong>${num(r.valor)} kg</strong>${r.baixaFiabilidade ? ' <small>(&gt;10 reps, baixa fiabilidade)</small>' : ''}${pr ? ' <span class="tag tag-pr">PR</span>' : ''}`;
}

function blocoReavaliacao(s) {
  return html`<div class="cartao">
    <h2>Reavaliação</h2>
    ${s.avaliacao_id
      ? html`<div class="caixa caixa-ok">✓ Ficha de testes registada. <a href="#/avaliacao/${s.avaliacao_id}">Ver resultados</a></div>
        <p class="ajuda">Podes terminar o treino. A reavaliação não desconta do pacote.</p>`
      : html`<p>Abre a ficha de testes (com a mesma bateria, variantes e valores anteriores como referência).</p>
        <a class="btn btn-grande" href="#/cliente/${s.cliente_id}/avaliacao/nova?tipo=reavaliacao&sessao=${s.id}">Abrir ficha de testes</a>`}
  </div>`;
}

// ---------------------------------------------------------------- Eventos
function lerSerieDoEditor(ed) {
  // Só inputs: os botões −/+ também têm data-campo.
  const v = (c) => ed.querySelector(`input[data-campo="${c}"]`)?.value;
  const q = ed.querySelector('.segmentado .ativo');
  return {
    carga_kg: lerNum(v('carga_kg')), reps: lerNum(v('reps')), rpe: lerNum(v('rpe')), rir: lerNum(v('rir')),
    qualidade: q ? +q.dataset.v : 2,
    dor: ed.querySelector('[data-acao="dor"]')?.classList.contains('ativo') ? 1 : 0,
    dor_local: v('dor_local')?.trim() || null, notas: v('notas')?.trim() || null,
    duracao_txt: v('duracao'), distancia_km: lerNum(v('distancia')), fc_media: lerNum(v('fc_media')),
  };
}

// Valida valores impossíveis; devolve { ok, erro, campos } prontos a gravar.
export function validarSerie(d, resist) {
  const erro = (m) => ({ ok: false, erro: m });
  const nan = (x) => x != null && isNaN(x);
  if (resist) {
    const dur = d.duracao_txt ? lerTempo(d.duracao_txt) : null;
    if (d.duracao_txt && dur == null) return erro('Duração inválida (usa m:ss ou h:mm:ss).');
    if (dur != null && (dur < 10 || dur > 6 * 3600)) return erro('Duração impossível (entre 0:10 e 6:00:00).');
    if (nan(d.distancia_km) || (d.distancia_km != null && (d.distancia_km <= 0 || d.distancia_km > 100))) return erro('Distância impossível (0–100 km).');
    if (nan(d.fc_media) || (d.fc_media != null && (d.fc_media < 40 || d.fc_media > 230))) return erro('FC média impossível (40–230 bpm).');
    if (nan(d.rpe) || (d.rpe != null && (d.rpe < 1 || d.rpe > 10))) return erro('RPE entre 1 e 10.');
    return { ok: true, campos: { duracao_seg: dur, distancia_m: d.distancia_km != null ? Math.round(d.distancia_km * 1000) : null, fc_media: d.fc_media != null ? Math.round(d.fc_media) : null, rpe: d.rpe, dor: d.dor, dor_local: d.dor ? d.dor_local : null, notas: d.notas } };
  }
  if (nan(d.carga_kg) || (d.carga_kg != null && (d.carga_kg < 0 || d.carga_kg > 400))) return erro('Carga impossível (0 a 400 kg).');
  if (nan(d.reps) || (d.reps != null && (d.reps < 0 || d.reps > 100 || !Number.isInteger(d.reps)))) return erro('Repetições impossíveis (número inteiro de 0 a 100).');
  if (d.reps == null) return erro('Indica as repetições feitas.');
  if (nan(d.rpe) || (d.rpe != null && (d.rpe < 1 || d.rpe > 10 || (d.rpe * 2) % 1))) return erro('RPE entre 1 e 10, em passos de 0,5.');
  if (nan(d.rir) || (d.rir != null && (d.rir < 0 || d.rir > 10 || !Number.isInteger(d.rir)))) return erro('RIR inteiro entre 0 e 10.');
  return { ok: true, campos: { carga_kg: d.carga_kg, reps: d.reps, rpe: d.rpe, rir: d.rir, qualidade: d.qualidade, dor: d.dor, dor_local: d.dor ? d.dor_local : null, notas: d.notas } };
}

let guardarAtraso = null;
function ligarEventosVivo(el, s, render) {
  const cfg = cfgTreino();
  const editor = () => el.querySelector('.serie-editor');
  const serieId = () => +editor()?.dataset.serie;
  const ex = (id) => s.exercicios.find((e) => e.id === +id);

  // Gravação automática dos campos da série enquanto se edita (antes de concluir).
  const agendarGravacao = () => {
    clearTimeout(guardarAtraso);
    const ed = editor();
    if (!ed) return;
    guardarAtraso = setTimeout(() => {
      const d = lerSerieDoEditor(ed);
      const resist = !!ed.querySelector('[data-campo="duracao"]');
      const r = validarSerie(d, resist);
      if (r.ok) rs.atualizarSerie(+ed.dataset.serie, r.campos);
    }, 350);
  };
  const atualizarE1rm = () => {
    const ed = editor();
    const alvo = ed?.querySelector('#e1rm');
    if (!alvo) return;
    const d = lerSerieDoEditor(ed);
    const melhor = alvo.dataset.melhor === '' ? null : +alvo.dataset.melhor;
    alvo.innerHTML = textoE1rm(d.qualidade >= 1 ? epley(d.carga_kg, d.reps) : null, melhor);
  };

  el.oninput = (ev) => {
    if (ev.target.closest('.serie-editor')) { atualizarE1rm(); agendarGravacao(); }
  };
  el.onchange = (ev) => {
    const t = ev.target;
    if (t.id === 'notas-sessao') rs.atualizarSessao(s.id, { notas: t.value.trim() || null });
    if (t.dataset.notaEx) rs.notaExercicio(+t.dataset.notaEx, t.value.trim());
  };

  el.onclick = async (ev) => {
    desbloquearAudio();
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    const ed = editor();

    switch (acao) {
      case 'pausa':
        s.pausado_desde ? rs.retomarSessao(s.id) : rs.pausarSessao(s.id);
        return render();
      case 'terminar':
        return dialogoTerminar(s, render);
      case 'checkin':
        return dialogoCheckin(obterCliente(s.cliente_id), render);
      case 'mostrar-cliente': {
        // Abre o modo cliente no exercício atual; o treino continua em curso (o tempo conta).
        const exAtual = s.exercicios.find((e) => e.id === ui.sexAtual);
        return entrarModoCliente(s.cliente_id, `#/sessao/${s.id}`, `?vista=forca${exAtual ? `&ex=${exAtual.exercicio_id}` : ''}`);
      }
      case 'cancelar-treino':
        if (!(await confirmar(`Cancelar este treino? O que foi registado é apagado e não desconta do pacote.${s.agendada_para ? ' A marcação volta à agenda.' : ''}`, { textoOk: 'Cancelar treino' }))) return;
        gravarDescanso(null);
        aviso(rs.cancelarTreinoEmCurso(s.id) === 'reagendada' ? 'Treino cancelado — a marcação voltou à agenda.' : 'Treino cancelado.');
        return ir(`/cliente/${s.cliente_id}?tab=sessoes`);
      case 'selecionar':
        ui.sexAtual = +b.dataset.sex;
        return render();
      case 'mover':
        rs.moverExercicioSessao(+b.dataset.sex, +b.dataset.dir);
        return render();
      case 'menos':
      case 'mais': {
        const input = ed.querySelector(`input[data-campo="${b.dataset.campo}"]`);
        const c = b.dataset.campo;
        const passo = c === 'carga_kg' ? ui.passo : c === 'rpe' ? 0.5 : 1;
        let v = lerNum(input.value);
        if (v == null || isNaN(v)) v = c === 'rpe' ? 7 : 0;
        else v += acao === 'mais' ? passo : -passo;
        const lim = { carga_kg: [0, 400], reps: [0, 100], rpe: [1, 10] }[c];
        v = Math.min(lim[1], Math.max(lim[0], Math.round(v * 100) / 100));
        input.value = String(v).replace('.', ',');
        atualizarE1rm();
        agendarGravacao();
        return;
      }
      case 'passo':
        ui.passo = +b.dataset.v;
        el.querySelectorAll('[data-acao="passo"]').forEach((x) => x.classList.toggle('ativo', x === b));
        return;
      case 'qualidade':
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b));
        atualizarE1rm();
        agendarGravacao();
        return;
      case 'dor': {
        b.classList.toggle('ativo');
        b.classList.toggle('chip-dor');
        const local = ed.querySelector('input[data-campo="dor_local"]');
        local.hidden = !b.classList.contains('ativo');
        if (!local.hidden) local.focus();
        agendarGravacao();
        return;
      }
      case 'copiar': {
        const e = s.exercicios.find((x) => x.series.some((y) => y.id === serieId()));
        const atualS = e.series.find((y) => y.id === serieId());
        const ant = e.series.filter((y) => y.n < atualS.n && y.estado === 'feita').pop();
        if (!ant) return;
        for (const c of ['carga_kg', 'reps', 'rpe', 'rir']) {
          const i = ed.querySelector(`input[data-campo="${c}"]`);
          if (i) i.value = ant[c] != null ? String(ant[c]).replace('.', ',') : '';
        }
        ed.querySelectorAll('.segmentado button').forEach((x) => x.classList.toggle('ativo', +x.dataset.v === ant.qualidade));
        atualizarE1rm();
        agendarGravacao();
        return;
      }
      case 'concluir': {
        clearTimeout(guardarAtraso);
        const resist = !!ed.querySelector('[data-campo="duracao"]');
        const r = validarSerie(lerSerieDoEditor(ed), resist);
        if (!r.ok) return aviso(r.erro, 'erro');
        const id = serieId();
        const e = s.exercicios.find((x) => x.series.some((y) => y.id === id));
        const serie = e.series.find((y) => y.id === id);
        rs.concluirSerie(id, r.campos);
        // Descanso: o do plano ou o valor por defeito (exceto depois da última série do treino).
        const restamSeries = s.exercicios.some((x) => x.series.some((y) => y.estado === 'pendente' && y.id !== id));
        if (restamSeries && !resist) iniciarDescanso(serie.plan_descanso_seg || cfg.descanso_padrao_seg);
        // Se o exercício ficou completo, passa ao seguinte por fazer.
        if (!e.series.some((y) => y.estado === 'pendente' && y.id !== id)) {
          const seguinte = s.exercicios.find((x) => x.id !== e.id && x.estado === 'pendente');
          if (seguinte) ui.sexAtual = seguinte.id;
        }
        return render();
      }
      case 'saltar-serie':
        clearTimeout(guardarAtraso);
        rs.saltarSerie(serieId());
        return render();
      case 'reabrir':
        rs.reabrirSerie(+b.dataset.serie);
        ui.sexAtual = s.exercicios.find((x) => x.series.some((y) => y.id === +b.dataset.serie))?.id ?? ui.sexAtual;
        return render();
      case 'add-serie':
        rs.adicionarSerie(+b.dataset.sex);
        return render();
      case 'saltar-ex':
        rs.saltarExercicio(+b.dataset.sex);
        ui.sexAtual = s.exercicios.find((x) => x.id !== +b.dataset.sex && x.estado === 'pendente')?.id ?? null;
        return render();
      case 'remover-ex':
        if (!(await confirmar(`Remover ${ex(b.dataset.sex).nome} desta sessão?`, { textoOk: 'Remover' }))) return;
        rs.apagarExercicioSessao(+b.dataset.sex);
        ui.sexAtual = null;
        return render();
      case 'substituir':
        return dialogoEscolherExercicio({
          titulo: `Substituir ${ex(b.dataset.sex).nome}`, clienteId: s.cliente_id, textoOk: 'Substituir', excluir: [ex(b.dataset.sex).exercicio_id],
          onEscolher: (novo) => { rs.substituirExercicio(+b.dataset.sex, novo.id); aviso(`Substituído por ${novo.nome}.`); render(); },
        });
      case 'add-ex':
        return dialogoEscolherExercicio({
          titulo: 'Acrescentar exercício', clienteId: s.cliente_id, textoOk: 'Acrescentar',
          onEscolher: (novo) => { ui.sexAtual = rs.adicionarExercicioSessao(s.id, novo.id); render(); },
        });
      case 'etiqueta': {
        const ativo = rs.alternarEtiqueta(s.id, b.dataset.etiqueta, { sexId: b.dataset.sex ? +b.dataset.sex : null, serieId: b.dataset.serie ? +b.dataset.serie : null });
        b.classList.toggle('ativo', ativo);
        return;
      }
      // Descanso
      case 'desc-menos':
      case 'desc-mais': {
        const d = descanso();
        if (!d) return;
        const delta = (acao === 'desc-mais' ? 15 : -15) * 1000;
        gravarDescanso(d.fim ? { ...d, fim: d.fim + delta, avisado: false } : { ...d, restantePausa: Math.max(0, d.restantePausa + delta / 1000) });
        return tick();
      }
      case 'desc-pausa': {
        const d = descanso();
        if (!d) return;
        gravarDescanso(d.fim ? { ...d, fim: null, restantePausa: Math.max(0, Math.ceil((d.fim - Date.now()) / 1000)) } : { ...d, fim: Date.now() + d.restantePausa * 1000 });
        return tick();
      }
      case 'desc-saltar':
        gravarDescanso(null);
        return tick();
    }
  };
}

// ---------------------------------------------------------------- Terminar
function dialogoTerminar(s, render) {
  const res = rs.resumoSessao(s);
  const { pacote, todosEsgotados } = pacoteParaData(s.cliente_id, s.data, s.id);
  const reav = s.tipo === 'reavaliacao';
  const pendentes = res.total - res.feitas - s.exercicios.reduce((n, e) => n + e.series.filter((x) => x.estado === 'saltada').length, 0);
  const avisoPacote = reav
    ? 'Reavaliação: não desconta do pacote.'
    : pacote
      ? `Pacote "${pacote.nome}": ${pacote.restantes} sessão(ões) disponíveis → ficam ${pacote.restantes - 1}.`
      : todosEsgotados ? '⚠ O pacote está esgotado — a sessão fica registada SEM descontar. Renova o pacote.' : '⚠ Sem pacote válido para hoje — a sessão fica registada SEM descontar.';

  dialogo(
    'Terminar treino',
    html`<div class="resumo-fim">
      <div class="kpis">
        <div class="kpi"><span>${tempo(res.duracao)}</span>duração</div>
        <div class="kpi"><span>${res.feitas}/${res.total}</span>séries feitas</div>
        <div class="kpi"><span>${num(res.volume, 0)}</span>volume (kg)</div>
      </div>
      <p>RPE médio das séries: <strong>${res.rpeMedio != null ? num(res.rpeMedio) : '—'}</strong></p>
      ${res.prs.length ? html`<div class="caixa caixa-ok"><strong>🏆 Recordes (1RM est.)</strong><ul>${res.prs.map((p) => html`<li>${p.exercicio}: ${num(p.valor)} kg (${num(p.carga)}×${p.reps}) — antes ${num(p.anterior)} kg</li>`)}</ul></div>` : ''}
      ${pendentes > 0 ? html`<div class="caixa caixa-aviso">${pendentes} série(s) por fazer ficam marcadas como saltadas.</div>` : ''}
      ${res.notas.length ? html`<h4>Notas</h4><ul class="ajuda">${res.notas.map((n) => html`<li><strong>${n.onde}:</strong> ${n.texto}</li>`)}</ul>` : ''}
      <hr>
      ${campo('desconta_pacote', 'Descontar do pacote', { tipo: 'checkbox', valor: !reav && !!pacote && s.desconta_pacote, attrs: !reav && pacote ? '' : 'disabled' })}
      <p class="ajuda">${avisoPacote}</p>
      <div class="grelha-2">
        ${campo('rpe_sessao', 'RPE da sessão (1–10)', { tipo: 'number', valor: s.rpe_sessao ?? '', ajuda: 'Para a carga interna (RPE × duração).' })}
        ${campo('dor', 'Dor geral (0–10)', { tipo: 'number', valor: s.dor ?? '' })}
        ${campo('sono', 'Sono (1–5)', { tipo: 'select', valor: s.sono ?? '', opcoes: [['', '—'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] })}
        ${campo('stress', 'Stress (1–5)', { tipo: 'select', valor: s.stress ?? '', opcoes: [['', '—'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] })}
      </div>
    </div>`,
    {
      textoOk: 'Confirmar e gravar',
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dados = {
          desconta_pacote: !reav && !!pacote && f.desconta_pacote,
          rpe_sessao: v.numero('rpe_sessao', f.rpe_sessao, { min: 1, max: 10, nome: 'RPE da sessão' }),
          dor: v.numero('dor', f.dor, { min: 0, max: 10, inteiro: true, nome: 'Dor' }),
          sono: f.sono ? +f.sono : null,
          stress: f.stress ? +f.stress : null,
        };
        if (!v.ok) return mostrarErros(form, v.erros), false;
        rs.terminarSessao(s.id, dados);
        gravarDescanso(null);
        aviso(`Treino gravado${res.prs.length ? ` · ${res.prs.length} PR` : ''}.`);
        ir(`/sessao/${s.id}`);
      },
    }
  );
}

// ====================================================================== EDIÇÃO (sessão terminada, falta ou cancelada)
function vistaEdicao(el, s) {
  const recarregar = () => vistaSessao(el, { sessaoId: s.id });
  const res = s.exercicios.length ? rs.resumoSessao(s) : null;
  const hora = s.hora_inicio ? s.hora_inicio.slice(11, 16) : '';

  el.innerHTML = html`
    ${cabecalho(`${TIPOS_SESSAO[s.tipo]} · ${data(s.data)}`, { voltar: `/cliente/${s.cliente_id}?tab=sessoes` })}
    <div class="ficha-topo"><a href="#/cliente/${s.cliente_id}">${s.cliente_nome}</a>
      ${etiqueta(ESTADOS_SESSAO[s.estado], s.estado === 'realizada' ? 'tag-ok' : s.estado === 'faltou' ? 'tag-alerta' : '')}
      ${s.plano_sessao_nome ? html`<span>${s.plano_sessao_nome}${s.semana ? ` · S${s.semana}` : ''}</span>` : ''}</div>
    ${res ? html`<div class="kpis">
      <div class="kpi"><span>${s.duracao_seg ? tempo(s.duracao_seg) : '—'}</span>duração</div>
      <div class="kpi"><span>${res.feitas}/${res.total}</span>séries</div>
      <div class="kpi"><span>${num(res.volume, 0)}</span>volume (kg)</div>
    </div>
    ${res.prs.length ? html`<div class="caixa caixa-ok">🏆 ${res.prs.map((p) => `${p.exercicio}: ${num(p.valor)} kg`).join(' · ')}</div>` : ''}` : ''}

    <form id="f-sessao" class="form" novalidate><fieldset><legend>Dados da sessão</legend>
      <div class="grelha-3">
        ${campo('data', 'Data *', { tipo: 'date', valor: s.data })}
        ${campo('hora', 'Hora de início', { tipo: 'time', valor: hora })}
        ${campo('duracao_min', 'Duração (min)', { tipo: 'number', valor: s.duracao_seg ? Math.round(s.duracao_seg / 60) : '' })}
      </div>
      <div class="grelha-2">
        ${campo('estado', 'Estado', { tipo: 'select', valor: s.estado, opcoes: [['realizada', 'Realizada (presente)'], ['faltou', 'Faltou'], ['cancelada', 'Cancelada']] })}
        <div>${campo('desconta_pacote', 'Descontar do pacote', { tipo: 'checkbox', valor: s.desconta_pacote })}
          <small class="ajuda">${s.pacote_nome ? `Pacote: ${s.pacote_nome}` : 'Não está a descontar de nenhum pacote.'}</small></div>
      </div>
      <div id="w-falta">${campo('motivo_falta', 'Motivo da falta', { valor: s.motivo_falta })}</div>
      <div class="grelha-2">
        ${campo('rpe_sessao', 'RPE da sessão (1–10)', { tipo: 'number', valor: s.rpe_sessao ?? '' })}
        ${campo('dor', 'Dor geral (0–10)', { tipo: 'number', valor: s.dor ?? '' })}
        ${campo('sono', 'Sono (1–5)', { tipo: 'select', valor: s.sono ?? '', opcoes: [['', '—'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] })}
        ${campo('stress', 'Stress (1–5)', { tipo: 'select', valor: s.stress ?? '', opcoes: [['', '—'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] })}
      </div>
      ${campo('notas', 'Notas privadas', { tipo: 'textarea', valor: s.notas })}
      ${chips(s.etiquetas, 'sessao')}
      <button class="btn" type="submit">Guardar dados</button>
    </fieldset></form>

    ${s.tipo === 'reavaliacao' && s.avaliacao_id ? html`<div class="cartao"><a href="#/avaliacao/${s.avaliacao_id}">Ver a avaliação desta sessão ›</a></div>` : ''}

    ${s.estado === 'realizada' ? html`
      ${s.exercicios.map((e) => html`<div class="cartao">
        <div class="cartao-cab"><h3>${e.nome}</h3>
          <div class="botoes">
            <button class="btn btn-sec btn-peq" data-acao="substituir" data-sex="${e.id}">⇄</button>
            <button class="btn btn-sec btn-peq" data-acao="remover-ex" data-sex="${e.id}" aria-label="Remover">✕</button>
          </div></div>
        ${e.substituido_nome ? html`<p class="ajuda">Substitui: ${e.substituido_nome}</p>` : ''}
        <div class="series">${e.series.map((x) => linhaSerieEdicao(x, e))}</div>
        <button class="btn btn-sec btn-peq" data-acao="add-serie" data-sex="${e.id}">+ Série</button>
        <input class="nota-ex" data-nota-ex="${e.id}" value="${e.notas ?? ''}" placeholder="Nota do exercício…">
        ${chips(e.etiquetas, 'exercicio', { sex: e.id })}
      </div>`)}
      <button class="btn btn-sec btn-largo" data-acao="add-ex">+ Acrescentar exercício</button>` : ''}

    <div class="cartao zona-perigo"><button class="btn btn-perigo btn-peq" data-acao="apagar">Apagar sessão</button></div>`;

  const form = el.querySelector('#f-sessao');
  const syncFalta = () => (el.querySelector('#w-falta').hidden = form.estado.value !== 'faltou');
  form.estado.onchange = () => {
    // Por defeito uma falta NÃO desconta; o treinador decide caso a caso.
    if (form.estado.value === 'faltou') form.desconta_pacote.checked = false;
    syncFalta();
  };
  syncFalta();

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const f = lerForm(form);
    const v = new Validador();
    const dataS = v.data('data', f.data, { obrigatorio: true });
    if (f.hora && !/^\d{2}:\d{2}$/.test(f.hora)) v.erro('hora', 'Hora inválida.');
    const dur = v.numero('duracao_min', f.duracao_min, { min: 1, max: 360, nome: 'Duração', unidade: 'min' });
    if (dataS && f.hora && rs.sessaoDuplicada(s.cliente_id, dataS, f.hora, s.id)) v.erro('hora', 'Já existe outra sessão deste cliente nesse dia a essa hora.');
    const dados = {
      data: dataS, estado: f.estado, desconta_pacote: f.desconta_pacote ? 1 : 0,
      hora_inicio: f.hora ? `${dataS}T${f.hora}:00` : null, duracao_seg: dur != null ? Math.round(dur * 60) : null,
      motivo_falta: f.estado === 'faltou' ? f.motivo_falta?.trim() || null : null,
      rpe_sessao: v.numero('rpe_sessao', f.rpe_sessao, { min: 1, max: 10, nome: 'RPE' }),
      dor: v.numero('dor', f.dor, { min: 0, max: 10, inteiro: true, nome: 'Dor' }),
      sono: f.sono ? +f.sono : null, stress: f.stress ? +f.stress : null,
      notas: v.texto('notas', f.notas, { max: 3000 }),
    };
    if (!v.ok) return mostrarErros(form, v.erros);
    rs.atualizarSessao(s.id, dados);
    const s2 = rs.obterSessao(s.id);
    if (dados.desconta_pacote && !s2.pacote_id && ['realizada', 'faltou'].includes(dados.estado))
      aviso('Sem pacote disponível nessa data (inexistente ou esgotado): a sessão NÃO desconta.', 'erro');
    else aviso('Sessão guardada.');
    recarregar();
  };

  el.onchange = (ev) => {
    if (ev.target.dataset.notaEx) rs.notaExercicio(+ev.target.dataset.notaEx, ev.target.value.trim());
  };
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const ex = s.exercicios.find((e) => e.id === +b.dataset.sex);
    switch (b.dataset.acao) {
      case 'etiqueta':
        b.classList.toggle('ativo', rs.alternarEtiqueta(s.id, b.dataset.etiqueta, { sexId: b.dataset.sex ? +b.dataset.sex : null, serieId: b.dataset.serie ? +b.dataset.serie : null }));
        return;
      case 'editar-serie': {
        const e = s.exercicios.find((x) => x.series.some((y) => y.id === +b.dataset.serie));
        return dialogoSerie(e.series.find((y) => y.id === +b.dataset.serie), e, recarregar);
      }
      case 'add-serie': {
        const id = rs.adicionarSerie(ex.id);
        rs.concluirSerie(id, {});
        return recarregar();
      }
      case 'remover-ex':
        if (!(await confirmar(`Remover ${ex.nome} desta sessão (com as séries registadas)?`, { textoOk: 'Remover' }))) return;
        rs.apagarExercicioSessao(ex.id);
        return recarregar();
      case 'substituir':
        return dialogoEscolherExercicio({
          titulo: `Substituir ${ex.nome}`, clienteId: s.cliente_id, textoOk: 'Substituir', excluir: [ex.exercicio_id],
          onEscolher: (novo) => { rs.substituirExercicio(ex.id, novo.id); recarregar(); },
        });
      case 'add-ex':
        return dialogoEscolherExercicio({
          titulo: 'Acrescentar exercício', clienteId: s.cliente_id, textoOk: 'Acrescentar',
          onEscolher: (novo) => { rs.adicionarExercicioSessao(s.id, novo.id); recarregar(); },
        });
      case 'apagar':
        if (!(await confirmar('Apagar esta sessão e todas as séries registadas? Se descontou do pacote, a sessão é devolvida.', { textoOk: 'Apagar' }))) return;
        rs.apagarSessao(s.id);
        aviso('Sessão apagada.');
        return ir(`/cliente/${s.cliente_id}?tab=sessoes`);
    }
  };
}

function linhaSerieEdicao(x, e) {
  const resist = e.tipo_registo === 'resistencia';
  const r = !resist && x.qualidade >= 1 && x.estado === 'feita' ? epley(x.carga_kg, x.reps) : null;
  const txt = resist
    ? [x.duracao_seg ? tempo(x.duracao_seg) : null, x.distancia_m ? `${num(x.distancia_m / 1000, 2)} km` : null, x.fc_media ? `${x.fc_media} bpm` : null, x.rpe ? `RPE ${num(x.rpe)}` : null].filter(Boolean).join(' · ') || '—'
    : textoSerie(x);
  return html`<button class="serie-linha ${x.estado}" data-acao="editar-serie" data-serie="${x.id}">
    <span class="n">${x.estado === 'feita' ? '✓' : x.estado === 'saltada' ? '—' : '○'} ${x.n}</span>
    <span>${x.estado === 'saltada' ? 'saltada' : txt}${r ? html` <small>· 1RM ${num(r.valor)}</small>` : ''}
      ${textoPlano(x) ? html`<br><small>plano: ${textoPlano(x)}</small>` : ''}
      ${x.dor ? html` <span class="tag tag-alerta">dor${x.dor_local ? `: ${x.dor_local}` : ''}</span>` : ''}
      ${x.etiquetas.length ? html` ${x.etiquetas.map((t) => etiqueta(t))}` : ''}
      ${x.notas ? html`<br><small>${x.notas}</small>` : ''}</span><span class="n">✎</span></button>`;
}

function dialogoSerie(x, e, recarregar) {
  const resist = e.tipo_registo === 'resistencia';
  const d = dialogo(
    `${e.nome} · série ${x.n}`,
    html`${campo('estado', 'Estado', { tipo: 'select', valor: x.estado, opcoes: [['feita', 'Feita'], ['saltada', 'Saltada'], ['pendente', 'Por fazer']] })}
      ${resist
        ? html`<div class="grelha-2">
            ${campo('duracao', 'Duração (m:ss)', { valor: x.duracao_seg ? tempo(x.duracao_seg) : '', attrs: 'inputmode="numeric"' })}
            ${campo('distancia', 'Distância (km)', { tipo: 'number', valor: x.distancia_m ? x.distancia_m / 1000 : '' })}
            ${campo('fc_media', 'FC média', { tipo: 'number', valor: x.fc_media })}
            ${campo('rpe', 'RPE', { tipo: 'number', valor: x.rpe })}</div>`
        : html`<div class="grelha-2">
            ${campo('carga_kg', 'Carga (kg)', { tipo: 'number', valor: x.carga_kg })}
            ${campo('reps', 'Reps', { tipo: 'number', valor: x.reps, attrs: 'inputmode="numeric"' })}
            ${campo('rpe', 'RPE', { tipo: 'number', valor: x.rpe })}
            ${campo('rir', 'RIR', { tipo: 'number', valor: x.rir, attrs: 'inputmode="numeric"' })}</div>
          ${campo('qualidade', 'Qualidade técnica', { tipo: 'select', valor: x.qualidade, opcoes: [[2, '2 · boa'], [1, '1 · aceitável'], [0, '0 · falha (não conta para PR)']] })}`}
      ${campo('dor_chk', 'Dor nesta série', { tipo: 'checkbox', valor: x.dor })}
      ${campo('dor_local', 'Onde', { valor: x.dor_local })}
      ${campo('notas', 'Nota da série', { valor: x.notas })}
      <button type="button" class="btn btn-perigo btn-peq" id="apagar-serie">Apagar série</button>`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const r = validarSerie({
          carga_kg: lerNum(f.carga_kg), reps: lerNum(f.reps), rpe: lerNum(f.rpe), rir: lerNum(f.rir), qualidade: f.qualidade != null ? +f.qualidade : 2,
          dor: f.dor_chk ? 1 : 0, dor_local: f.dor_local?.trim() || null, notas: f.notas?.trim() || null,
          duracao_txt: f.duracao, distancia_km: lerNum(f.distancia), fc_media: lerNum(f.fc_media),
        }, resist);
        if (f.estado === 'feita' && !r.ok) return aviso(r.erro, 'erro'), false;
        if (f.estado === 'feita') rs.concluirSerie(x.id, r.campos);
        else if (f.estado === 'saltada') rs.saltarSerie(x.id);
        else rs.reabrirSerie(x.id);
        recarregar();
      },
    }
  );
  d.querySelector('#apagar-serie').onclick = async () => {
    d.fechar();
    if (!(await confirmar('Apagar esta série?', { textoOk: 'Apagar' }))) return;
    rs.apagarSerie(x.id);
    recarregar();
  };
}
