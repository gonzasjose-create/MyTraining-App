// Agenda semanal: sessões por dia e hora, carga de trabalho por dia, marcar/remarcar/falta/cancelar,
// reavaliações previstas, iniciar treino e exportação .ics.
import * as ag from '../repo-agenda.js';
import { iniciarSessaoAgendada, sessaoDuplicada, sugerirSessaoPlano } from '../repo-sessoes.js';
import { listarClientes, temConsentimento } from '../repo.js';
import { TIPOS_SESSAO, ESTADOS_SESSAO } from '../catalogos.js';
import { gerarICS, nomeCalendario } from '../ics.js';
import { html, data, num, hojeISO, Validador, mostrarErros, lerForm, aviso, baixarFicheiro } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo } from './ui.js';
import { ir } from '../app.js';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const hora = (iso) => (iso ? iso.slice(11, 16) : '—');
const fmtHoras = (h) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export function vistaAgenda(el, { semana }) {
  const segunda = ag.inicioSemana(/^\d{4}-\d{2}-\d{2}$/.test(semana || '') ? semana : hojeISO());
  const hoje = hojeISO();
  const sess = ag.sessoesSemana(segunda);
  const reav = ag.reavaliacoesPrevistas().filter((r) => !r.marcada && r.dia >= segunda && r.dia <= ag.somarDias(segunda, 6));
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = ag.somarDias(segunda, i);
    const lista = sess.filter((s) => s.data === d);
    return { d, i, lista, carga: ag.cargaDia(lista), reav: reav.filter((r) => r.dia === d) };
  });
  const totalSess = dias.reduce((a, x) => a + x.carga.n, 0);
  const totalHoras = dias.reduce((a, x) => a + x.carga.horas, 0);
  const recarregar = () => vistaAgenda(el, { semana: segunda });

  el.innerHTML = html`
    ${cabecalho('Agenda', { acoes: '<button class="btn" id="marcar">+ Marcar</button>' })}
    <div class="nav-mes">
      <a class="btn btn-sec btn-icone" href="#/agenda?semana=${ag.somarDias(segunda, -7)}" aria-label="Semana anterior">‹</a>
      <div class="centro"><strong>${data(segunda).slice(0, 5)} – ${data(ag.somarDias(segunda, 6))}</strong>
        <div class="ajuda">${totalSess} sessões · ${fmtHoras(totalHoras)}${reav.length ? ` · ${reav.length} reavaliação(ões) prevista(s)` : ''}</div></div>
      <a class="btn btn-sec btn-icone" href="#/agenda?semana=${ag.somarDias(segunda, 7)}" aria-label="Semana seguinte">›</a>
    </div>
    <div class="botoes barra-acoes-topo">
      ${segunda !== ag.inicioSemana(hoje) ? html`<a class="btn btn-sec btn-peq" href="#/agenda">Hoje</a>` : ''}
      <button class="btn btn-sec btn-peq" id="ics">📅 Exportar lembretes (.ics)</button>
    </div>
    <div class="agenda">
      ${dias.map(({ d, i, lista, carga, reav: rv }) => html`<section class="dia ${d === hoje ? 'hoje' : ''} ${carga.sobrecarregado ? 'sobre' : ''} ${carga.livre && !rv.length ? 'livre' : ''}">
        <header>
          <strong>${DIAS[i]} ${data(d).slice(0, 5)}</strong>
          <span class="ajuda">${carga.n ? `${carga.n} · ${fmtHoras(carga.horas)}` : 'livre'}</span>
          ${carga.sobrecarregado ? etiqueta('⚠ sobrecarregado', 'tag-alerta') : ''}
        </header>
        ${rv.map((r) => html`<button class="ag-item ag-reav" data-reav="${r.cliente_id}" data-dia="${d}">
          <span class="hora">📋</span><span>Reavaliação prevista · <strong>${r.cliente_nome}</strong>${r.atraso ? html` ${etiqueta('em atraso', 'tag-alerta')}` : ''}</span></button>`)}
        ${lista.map((s) => html`<button class="ag-item estado-${s.estado}" data-sessao="${s.id}">
          <span class="hora">${hora(s.hora_inicio)}</span>
          <span><strong>${s.cliente_nome}</strong> · ${s.tipo === 'reavaliacao' ? 'Reavaliação' : s.plano_sessao_nome || TIPOS_SESSAO[s.tipo]}
            ${s.estado !== 'agendada' ? html` ${etiqueta(ESTADOS_SESSAO[s.estado], s.estado === 'realizada' ? 'tag-ok' : s.estado === 'faltou' ? 'tag-alerta' : s.estado === 'em_curso' ? 'tag-aviso' : '')}` : ''}
            ${s.remarcada_de ? html` <small title="Remarcada">↻ de ${data(s.remarcada_de.slice(0, 10)).slice(0, 5)} ${hora(s.remarcada_de)}</small>` : ''}</span>
        </button>`)}
        <button class="ag-mais" data-novo="${d}" aria-label="Marcar a ${DIAS[i]}">+</button>
      </section>`)}
    </div>`;

  el.querySelector('#marcar').onclick = () => dialogoMarcar({ data: hoje >= segunda && hoje <= ag.somarDias(segunda, 6) ? hoje : segunda }, recarregar);
  el.querySelector('#ics').onclick = () => dialogoICS();
  el.querySelectorAll('[data-novo]').forEach((b) => (b.onclick = () => dialogoMarcar({ data: b.dataset.novo }, recarregar)));
  el.querySelectorAll('[data-reav]').forEach((b) => (b.onclick = () => dialogoMarcar({ data: b.dataset.dia < hoje ? hoje : b.dataset.dia, cliente_id: +b.dataset.reav, tipo: 'reavaliacao' }, recarregar)));
  el.querySelectorAll('[data-sessao]').forEach((b) => (b.onclick = () => dialogoItem(sess.find((s) => s.id === +b.dataset.sessao), recarregar)));
}

// ---------------------------------------------------------------- Ações sobre uma sessão
export const acoesAgendada = (s, depois) => dialogoItem(s, depois);
function dialogoItem(s, recarregar) {
  if (s.estado !== 'agendada') return ir(`/sessao/${s.id}`);
  const d = dialogo(
    `${s.cliente_nome} · ${data(s.data)} ${hora(s.hora_inicio)}`,
    html`<p>${s.tipo === 'reavaliacao' ? 'Reavaliação' : s.plano_sessao_nome || TIPOS_SESSAO[s.tipo]}${s.semana ? ` · semana ${s.semana} do plano` : ''}
        · ${num((s.duracao_seg || 3600) / 60, 0)} min</p>
      ${s.remarcada_de ? html`<p class="ajuda">Remarcada (original: ${data(s.remarcada_de.slice(0, 10))} ${hora(s.remarcada_de)}).</p>` : ''}
      ${s.notas ? html`<p class="ajuda">${s.notas}</p>` : ''}
      <div class="menu-opcoes">
        <button type="button" class="btn btn-iniciar" data-op="iniciar">▶ Iniciar treino</button>
        <button type="button" class="btn btn-sec" data-op="remarcar">↻ Remarcar</button>
        <button type="button" class="btn btn-sec" data-op="faltou">✕ Marcar falta</button>
        <button type="button" class="btn btn-sec" data-op="cancelar">Cancelar sessão</button>
      </div>`,
    { textoOk: 'Fechar' }
  );
  d.querySelectorAll('[data-op]').forEach((b) => (b.onclick = async () => {
    d.fechar();
    const op = b.dataset.op;
    if (op === 'iniciar') {
      if (s.tipo === 'reavaliacao' && !temConsentimento(s.cliente_id, 'dados_saude')) return aviso('Sem consentimento de dados de saúde.', 'erro');
      if (s.data !== hojeISO() && !(await confirmar(`Esta sessão estava marcada para ${data(s.data)}. Iniciar hoje?`, { textoOk: 'Iniciar hoje', perigo: false }))) return;
      try { ir(`/sessao/${iniciarSessaoAgendada(s.id)}`); } catch (e) { aviso(e.message, 'erro'); }
    }
    if (op === 'remarcar') dialogoMarcar({ remarcar: s }, recarregar);
    if (op === 'faltou')
      dialogo('Marcar falta', html`${campo('motivo', 'Motivo (opcional)', { valor: '' })}
        ${campo('desconta', 'Descontar do pacote', { tipo: 'checkbox', valor: false, ajuda: 'Por defeito uma falta não desconta.' })}`, {
        textoOk: 'Marcar falta',
        onSubmit(form) {
          const f = lerForm(form);
          ag.marcarFalta(s.id, { desconta: f.desconta, motivo: f.motivo.trim() || null });
          aviso('Falta registada.');
          recarregar();
        },
      });
    if (op === 'cancelar') {
      if (!(await confirmar('Cancelar esta sessão? Fica no histórico como cancelada e não desconta.', { textoOk: 'Cancelar sessão' }))) return;
      ag.cancelar(s.id);
      recarregar();
    }
  }));
}

// ---------------------------------------------------------------- Marcar / remarcar
export function dialogoMarcar({ data: dataInicial, cliente_id = null, tipo = 'treino', remarcar = null } = {}, depois) {
  const clientes = listarClientes();
  const cfg = ag.cfgAgenda();
  const r = remarcar;
  const opcoesPlano = (cid, d) => {
    const sug = cid ? sugerirSessaoPlano(cid, d, { contarAgendadas: true }) : null;
    return sug?.plano?.sessoes.length
      ? [['', `Automática (${sug.sugerida?.nome ?? '—'})`], ...sug.plano.sessoes.map((s) => [s.id, s.nome])]
      : [['', 'Sem plano ativo (sessão livre)']];
  };
  const dlg = dialogo(
    r ? `Remarcar · ${r.cliente_nome}` : 'Marcar sessão',
    html`${r ? '' : campo('cliente_id', 'Cliente *', { tipo: 'select', valor: cliente_id ?? '', opcoes: [['', '— escolher —'], ...clientes.map((c) => [c.id, c.nome])] })}
      ${r ? '' : campo('tipo', 'Tipo', { tipo: 'select', valor: tipo, opcoes: Object.entries(TIPOS_SESSAO) })}
      <div class="grelha-3">
        ${campo('data', 'Data *', { tipo: 'date', valor: r?.data ?? dataInicial ?? hojeISO() })}
        ${campo('hora', 'Hora *', { tipo: 'time', valor: r ? hora(r.hora_inicio) : '07:00' })}
        ${campo('duracao', 'Duração (min)', { tipo: 'number', valor: r ? Math.round((r.duracao_seg || 3600) / 60) : cfg.duracao_padrao_min })}
      </div>
      ${r ? '' : html`<div id="w-plano">${campo('plano_sessao_id', 'Sessão do plano', { tipo: 'select', opcoes: opcoesPlano(cliente_id, dataInicial ?? hojeISO()) })}</div>
        ${campo('repetir', 'Repetir nas semanas seguintes', { tipo: 'select', valor: 0, opcoes: [[0, 'Não repetir'], ...[1, 2, 3, 4, 5, 7, 11].map((n) => [n, `Mais ${n} semana(s) (mesmo dia e hora)`])] })}
        ${campo('notas', 'Notas', { valor: '' })}`}
      <div id="w-conflito"></div>`,
    {
      textoOk: r ? 'Remarcar' : 'Marcar',
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const cid = r ? r.cliente_id : +f.cliente_id;
        if (!cid) v.erro('cliente_id', 'Escolhe o cliente.');
        const d = v.data('data', f.data, { obrigatorio: true, futuro: true });
        if (d && d < hojeISO()) v.erro('data', 'Não se marcam sessões no passado — para isso usa "Registar sessão" na ficha.');
        if (!/^\d{2}:\d{2}$/.test(f.hora || '')) v.erro('hora', 'Hora inválida.');
        const dur = v.numero('duracao', f.duracao, { min: 15, max: 240, inteiro: true, obrigatorio: true, nome: 'Duração', unidade: 'min' });
        const tp = r ? r.tipo : f.tipo;
        if (!r && tp === 'reavaliacao' && cid && !temConsentimento(cid, 'dados_saude')) v.erro('tipo', 'Sem consentimento de dados de saúde.');
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const repetir = r ? 0 : +f.repetir;
        // Duplicado (mesmo cliente, mesma hora) e sobreposição com outros clientes, em todas as datas.
        const datas = Array.from({ length: repetir + 1 }, (_, k) => ag.somarDias(d, k * 7));
        const dup = datas.find((x) => sessaoDuplicada(cid, x, f.hora, r?.id));
        if (dup) return mostrarErros(form, { hora: `Já existe uma sessão deste cliente a ${data(dup)} a essa hora.` }), false;
        const conf = datas.flatMap((x) => ag.conflitos(x, f.hora, dur, r?.id));
        const caixa = form.querySelector('#w-conflito');
        if (conf.length && !form.querySelector('[name="forcar"]')?.checked) {
          caixa.innerHTML = html`<div class="caixa caixa-aviso"><strong>Sobreposição:</strong>
            <ul>${conf.map((s) => html`<li>${data(s.data)} ${hora(s.hora_inicio)} · ${s.cliente_nome}</li>`)}</ul>
            ${campo('forcar', 'Marcar mesmo assim', { tipo: 'checkbox' })}</div>`;
          return false;
        }
        if (r) { ag.remarcar(r.id, d, f.hora, dur); aviso('Sessão remarcada.'); }
        else {
          const ids = ag.agendar({ cliente_id: cid, data: d, hora: f.hora, duracao_min: dur, tipo: tp, plano_sessao_id: f.plano_sessao_id ? +f.plano_sessao_id : null, notas: f.notas?.trim() || null, repetir });
          aviso(ids.length > 1 ? `${ids.length} sessões marcadas.` : 'Sessão marcada.');
        }
        depois?.();
      },
    }
  );
  const form = dlg.querySelector('form');
  if (!r) {
    const sync = () => {
      form.querySelector('#w-plano').hidden = form.tipo.value !== 'treino';
      const sel = form.plano_sessao_id;
      sel.innerHTML = opcoesPlano(+form.cliente_id.value || null, form.data.value || hojeISO()).map(([v, t]) => `<option value="${v}">${t.replace(/</g, '&lt;')}</option>`).join('');
    };
    form.cliente_id.onchange = form.tipo.onchange = form.data.onchange = sync;
    sync();
  }
}

// ---------------------------------------------------------------- Exportar .ics
function dialogoICS() {
  dialogo(
    'Exportar lembretes (.ics)',
    html`<p>Cria um ficheiro para o Calendário com as sessões agendadas e as reavaliações previstas.</p>
      ${campo('semanas', 'Período', { tipo: 'select', valor: 4, opcoes: [[1, 'Próxima semana'], [4, 'Próximas 4 semanas'], [8, 'Próximas 8 semanas']] })}
      ${campo('iniciais', 'Usar só as iniciais dos clientes', { tipo: 'checkbox', valor: true })}
      <p class="ajuda">RGPD: o Calendário pode sincronizar com a cloud (iCloud/Google). Com iniciais, não sai nenhum nome completo nem dados de saúde.</p>`,
    {
      textoOk: 'Exportar',
      onSubmit(form) {
        const f = lerForm(form);
        const hoje = hojeISO(), ate = ag.somarDias(hoje, +f.semanas * 7);
        const eventos = [];
        for (let s = ag.inicioSemana(hoje); s <= ate; s = ag.somarDias(s, 7))
          for (const x of ag.sessoesSemana(s).filter((x) => x.estado === 'agendada' && x.data >= hoje && x.data <= ate)) {
            const fim = new Date(new Date(x.hora_inicio).getTime() + (x.duracao_seg || 3600) * 1000);
            const p2 = (n) => String(n).padStart(2, '0');
            eventos.push({
              uid: `sessao-${x.id}@treino.local`, inicio: x.hora_inicio,
              fim: `${fim.getFullYear()}-${p2(fim.getMonth() + 1)}-${p2(fim.getDate())}T${p2(fim.getHours())}:${p2(fim.getMinutes())}:00`,
              titulo: `${x.tipo === 'reavaliacao' ? 'Reavaliação' : 'Treino'} · ${nomeCalendario(x.cliente_nome, f.iniciais)}`, alarmeMin: 30,
            });
          }
        for (const r of ag.reavaliacoesPrevistas().filter((r) => !r.marcada && r.dia <= ate))
          eventos.push({ uid: `reav-${r.cliente_id}-${r.prevista}@treino.local`, dia: r.dia, titulo: `Reavaliação prevista · ${nomeCalendario(r.cliente_nome, f.iniciais)}${r.atraso ? ' (em atraso)' : ''}` });
        if (!eventos.length) return aviso('Não há sessões agendadas nem reavaliações nesse período.', 'erro'), false;
        baixarFicheiro(`agenda-${hoje}.ics`, gerarICS(eventos), 'text/calendar');
        aviso(`${eventos.length} lembrete(s) exportado(s).`);
      },
    }
  );
}
