// Painel geral: iniciar/retomar treino, o que precisa de atenção, pacotes e sessões de hoje.
// (Agenda e resumo semanal completos chegam nas Fases 5 e 6.)
import * as repo from '../repo.js';
import { escalar, todos, um, gravarDefinicao } from '../db.js';
import { diasDesdeBackup, cfgLembreteBackup, clientesAForaDePrazo } from './dados.js';
import { alertasCliente, somarDias, diasEntre, inicioSemana } from '../analise.js';
import { prsPeriodo } from '../visao-cliente.js';
import { sessaoEmCurso, decorridoSeg } from '../repo-sessoes.js';
import { html, data, num, tempo, hojeISO } from '../util.js';
import { cabecalho, etiqueta, vazio } from './ui.js';
import { dialogoIniciarTreino } from './sessoes.js';
import { reavaliacoesPrevistas } from '../repo-agenda.js';
import { checkinSemana, PERGUNTA_CHECKIN } from '../repo-motivacao.js';
import { acoesAgendada } from './agenda.js';
import { dialogoCheckin, linkWhatsApp } from './metas.js';

export function vistaPainel(el) {
  const clientes = repo.listarClientes();
  const hoje = hojeISO();
  const atencao = [];
  let pacotesRenovar = 0, reavAtraso = 0;

  for (const c of clientes) {
    const motivos = [];
    if (!repo.temConsentimento(c.id, 'dados_saude')) motivos.push(['Sem consentimento de dados de saúde', 'tag-alerta', 'consentimentos']);
    if (!c.tem_baseline) motivos.push(['Sem baseline', 'tag-aviso', 'avaliacoes']);
    // Alertas da análise: reavaliação em atraso, pacote, assiduidade, carga, RPE alto, estagnação.
    for (const a of alertasCliente(c)) {
      motivos.push([a.texto, a.nivel === 'alerta' ? 'tag-alerta' : 'tag-aviso', a.tab]);
      if (a.tab === 'pacotes') pacotesRenovar++;
      if (a.texto.startsWith('Reavaliação em atraso')) reavAtraso++;
    }
    if (c.ultima_avaliacao) {
      const prox = somarDias(c.ultima_avaliacao, c.intervalo_reavaliacao_semanas * 7);
      if (prox >= hoje && diasEntre(hoje, prox) <= 7) motivos.push([`Reavaliação a ${data(prox)}`, 'tag-aviso', 'avaliacoes']);
    }
    if (c.lesoes_ativas) motivos.push([`${c.lesoes_ativas} lesão(ões) ativa(s)`, 'tag-aviso', 'lesoes']);
    if (!escalar("SELECT COUNT(*) FROM planos WHERE cliente_id = ? AND estado = 'ativo'", [c.id])) motivos.push(['Sem plano ativo', 'tag-aviso', 'planos']);
    if (motivos.length) atencao.push({ c, motivos });
  }

  const emCurso = sessaoEmCurso();
  const hojeSessoes = todos(
    `SELECT s.*, c.nome AS cliente_nome FROM sessoes s JOIN clientes c ON c.id = s.cliente_id
     WHERE s.data = ? ORDER BY s.hora_inicio`,
    [hoje]
  );
  const reav = reavaliacoesPrevistas().filter((r) => r.atraso || diasEntre(hoje, r.prevista) <= 7);
  // Check-in em falta: só para quem já treina (tem pelo menos uma sessão realizada).
  const semCheckin = clientes.filter((c) => !checkinSemana(c.id) && escalar("SELECT COUNT(*) FROM sessoes WHERE cliente_id = ? AND estado = 'realizada'", [c.id]));
  const semana = escalar(
    "SELECT COUNT(*) FROM sessoes WHERE estado = 'realizada' AND data >= date(?, '-' || ((strftime('%w', ?) + 6) % 7) || ' days')",
    [hoje, hoje]
  );

  // Resumo da semana (todos os clientes).
  const segunda = inicioSemana(hoje);
  const restoSemana = um(
    "SELECT SUM(estado = 'agendada') AS agendadas, SUM(estado = 'faltou') AS faltas FROM sessoes WHERE data BETWEEN ? AND ?",
    [segunda, somarDias(segunda, 6)]
  ) || {};
  restoSemana.agendadas ??= 0;
  restoSemana.faltas ??= 0;
  const prsSemana = clientes.flatMap((c) => prsPeriodo(c, segunda, hoje).map((p) => ({ ...p, cliente: c.nome.replace(/\(.*?\)/g, '').trim().split(' ')[0] })));
  const semSessoes = clientes.filter((c) => !escalar("SELECT COUNT(*) FROM sessoes WHERE cliente_id = ? AND estado = 'realizada'", [c.id])).length;

  // Lembretes de manutenção: backup, conservação de dados e primeiro uso.
  const diasBk = diasDesdeBackup();
  const lembrarBackup = (clientes.length || escalar('SELECT COUNT(*) FROM sessoes')) && (diasBk == null || diasBk > cfgLembreteBackup());
  const foraPrazo = clientesAForaDePrazo().length;
  const instalada = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  const boasVindas = !clientes.length && !repo.def('onboarding_feito');

  el.innerHTML = html`
    ${cabecalho('Painel')}
    ${boasVindas ? html`<div class="cartao boas-vindas">
      <h3>Bem-vindo! 👋 Primeiros passos</h3>
      <ol>
        <li><a href="#/definicoes">Definições</a> → nome do negócio, logótipo e cores.</li>
        ${instalada ? '' : html`<li>No iPhone: Safari → Partilhar → <strong>Adicionar ao ecrã principal</strong> (e usa sempre esse ícone).</li>`}
        <li>Opcional: <a href="#/definicoes">PIN da app</a> e PIN do modo cliente.</li>
        <li><a href="#/clientes">Clientes</a> → cria o primeiro cliente (com consentimentos) ou carrega os exemplos para experimentar.</li>
        <li>Faz <strong>backups encriptados</strong> com regularidade e guarda-os no portátil.</li>
      </ol>
      <button class="btn btn-sec btn-peq" id="ok-boas-vindas">Já sei, esconder</button>
    </div>` : ''}
    ${lembrarBackup ? html`<a class="caixa caixa-aviso aviso-link" href="#/definicoes">💾 ${diasBk == null ? 'Ainda não fizeste nenhum backup.' : `Último backup há ${diasBk} dias.`} Faz um backup encriptado ›</a>` : ''}
    ${foraPrazo ? html`<a class="caixa caixa-info aviso-link" href="#/definicoes">🗂 ${foraPrazo} ex-cliente(s) além do prazo de conservação de dados — rever ›</a>` : ''}
    ${emCurso
      ? html`<a class="cartao cartao-treino" href="#/sessao/${emCurso.id}">
          <strong>● Treino em curso: ${emCurso.cliente_nome}</strong><span>${tempo(decorridoSeg(emCurso))} · Retomar treino ›</span></a>`
      : html`<button class="btn btn-grande btn-iniciar" id="iniciar">▶ Iniciar treino</button>`}
    <div class="kpis kpis-4">
      <div class="kpi"><span>${clientes.length}</span>clientes ativos</div>
      <div class="kpi"><span>${semana}</span>sessões esta semana</div>
      <a class="kpi" href="#/pagamentos"><span>${pacotesRenovar}</span>pacotes a renovar</a>
      <div class="kpi"><span>${reavAtraso}</span>reavaliações em atraso</div>
    </div>
    <div class="cartao">
      <div class="cartao-cab"><h3>Resumo da semana</h3><a class="btn btn-sec btn-peq" href="#/resumos">Resumos para clientes ›</a></div>
      <ul class="resumo-semana">
        <li><strong>${semana}</strong> sessões realizadas · <strong>${restoSemana.agendadas}</strong> ainda agendadas · <strong>${restoSemana.faltas}</strong> falta(s)</li>
        <li><strong>${prsSemana.length}</strong> recorde(s)${prsSemana.length ? `: ${prsSemana.slice(0, 3).map((p) => `${p.cliente} — ${p.nome} ${num(p.valor)} kg`).join(' · ')}` : ''}</li>
        <li><strong>${clientes.length - semCheckin.length - semSessoes}</strong>/${clientes.length - semSessoes} check-ins recebidos</li>
      </ul>
    </div>
    <div class="cartao">
      <div class="cartao-cab"><h3>Hoje</h3><a class="btn btn-sec btn-peq" href="#/agenda">Agenda ›</a></div>
      ${hojeSessoes.length
        ? html`<ul class="lista lista-simples">${hojeSessoes.map((s) => html`<li><a href="#/sessao/${s.id}">${s.hora_inicio ? s.hora_inicio.slice(11, 16) + ' · ' : ''}${s.cliente_nome}</a>
            ${s.estado === 'agendada' && !emCurso
              ? html`<button class="btn btn-peq btn-iniciar-item" data-iniciar="${s.id}">▶ Iniciar</button>`
              : etiqueta(s.estado === 'em_curso' ? 'em curso' : s.estado, s.estado === 'realizada' ? 'tag-ok' : s.estado === 'em_curso' ? 'tag-aviso' : '')}</li>`)}</ul>`
        : html`<p class="ajuda">Sem sessões marcadas para hoje.</p>`}
    </div>
    ${reav.length ? html`<div class="cartao"><h3>Reavaliações (próximos 7 dias)</h3><ul class="lista lista-simples">
      ${reav.map((r) => html`<li><a href="#/cliente/${r.cliente_id}?tab=avaliacoes">${r.cliente_nome}</a>
        ${etiqueta(r.atraso ? `em atraso desde ${data(r.prevista)}` : data(r.prevista), r.atraso ? 'tag-alerta' : 'tag-aviso')}
        ${r.marcada ? etiqueta('marcada', 'tag-ok') : html`<a class="btn btn-sec btn-peq" href="#/agenda?semana=${r.dia}">Marcar</a>`}</li>`)}</ul></div>` : ''}
    ${semCheckin.length ? html`<div class="cartao"><h3>Check-ins em falta esta semana</h3><ul class="lista lista-simples">
      ${semCheckin.map((c) => html`<li><a href="#/cliente/${c.id}?tab=metas">${c.nome}</a>
        <span class="botoes">${c.telemovel ? html`<a class="btn btn-sec btn-peq" target="_blank" rel="noopener" href="${linkWhatsApp(c.telemovel, PERGUNTA_CHECKIN)}">💬 Pedir</a>` : ''}
          <button class="btn btn-peq" data-checkin="${c.id}">Registar</button></span></li>`)}</ul></div>` : ''}
    <div class="cartao">
      <h3>Precisa de atenção</h3>
      ${atencao.length
        ? html`<ul class="lista lista-simples">${atencao.map(
            ({ c, motivos }) => html`<li><div><a href="#/cliente/${c.id}"><strong>${c.nome}</strong></a>
              <div class="item-tags">${motivos.map(([t, cls, tab]) => html`<a href="#/cliente/${c.id}?tab=${tab}">${etiqueta(t, cls)}</a>`)}</div></div></li>`
          )}</ul>`
        : clientes.length ? html`<p class="ajuda">Tudo em dia. 👍</p>` : vazio('Ainda sem clientes.', '<a class="btn" href="#/clientes">Ir para Clientes</a>')}
    </div>
    <p class="centro"><a href="#/pagamentos">Pagamentos e resumo mensal ›</a></p>`;

  el.querySelector('#iniciar')?.addEventListener('click', () => dialogoIniciarTreino());
  el.querySelector('#ok-boas-vindas')?.addEventListener('click', () => { gravarDefinicao('onboarding_feito', true); vistaPainel(el); });
  el.querySelectorAll('[data-iniciar]').forEach((b) => (b.onclick = () => {
    const s = hojeSessoes.find((x) => x.id === +b.dataset.iniciar);
    acoesAgendada(s, () => vistaPainel(el));
  }));
  el.querySelectorAll('[data-checkin]').forEach((b) => (b.onclick = () => dialogoCheckin(clientes.find((c) => c.id === +b.dataset.checkin), () => vistaPainel(el))));
}
