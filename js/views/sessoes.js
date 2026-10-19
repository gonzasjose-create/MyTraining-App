// Histórico de sessões do cliente, "Iniciar treino" (Modo Treino) e registo manual de sessões.
import * as rs from '../repo-sessoes.js';
import { listarClientes, temConsentimento } from '../repo.js';
import { pacoteParaData } from '../repo-pacotes.js';
import { agendadaHoje } from '../repo-agenda.js';
import { ESTADOS_SESSAO, TIPOS_SESSAO } from '../catalogos.js';
import { html, data, tempo, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { etiqueta, dialogo, campo, vazio } from './ui.js';
import { ir } from '../app.js';

// ---------------------------------------------------------------- Separador "Sessões" da ficha
export function seccaoSessoesCliente(sec, c, q = '') {
  const lista = rs.listarSessoesCliente(c.id, q);
  sec.innerHTML = html`
    <div class="botoes barra-acoes-topo">
      <button class="btn" data-iniciar>▶ Iniciar treino</button>
      <button class="btn btn-sec" data-registar>+ Registar sessão</button>
    </div>
    <input type="search" id="q-sessoes" class="pesquisa" value="${q}" placeholder="Pesquisar notas, etiquetas, exercícios, dor…" aria-label="Pesquisar sessões">
    ${lista.length
      ? html`<ul class="lista">${lista.map(
          (s) => html`<li><a class="item" href="#/sessao/${s.id}">
            <div class="item-principal">
              <strong>${data(s.data)}${s.hora_inicio ? ` · ${s.hora_inicio.slice(11, 16)}` : ''}</strong>
              ${etiqueta(ESTADOS_SESSAO[s.estado], s.estado === 'realizada' ? 'tag-ok' : s.estado === 'faltou' ? 'tag-alerta' : s.estado === 'em_curso' ? 'tag-aviso' : '')}
              <div class="ajuda">${s.plano_sessao_nome || TIPOS_SESSAO[s.tipo]}${s.semana ? ` · S${s.semana}` : ''}
                ${s.series_total ? ` · ${s.series_feitas}/${s.series_total} séries` : ''}${s.duracao_seg ? ` · ${tempo(s.duracao_seg)}` : ''}
                ${s.desconta_pacote && s.pacote_id ? ' · desconta' : ''}${s.motivo_falta ? ` · ${s.motivo_falta}` : ''}</div>
              <div class="item-tags">
                ${s.series_dor ? etiqueta(`dor em ${s.series_dor} série(s)`, 'tag-alerta') : ''}
                ${(s.etiquetas || '').split(',').filter(Boolean).map((t) => etiqueta(t))}
              </div>
              ${s.notas ? html`<div class="ajuda">${s.notas.length > 90 ? s.notas.slice(0, 90) + '…' : s.notas}</div>` : ''}
            </div><div class="item-sec">›</div></a></li>`
        )}</ul>`
      : vazio(q ? 'Nenhuma sessão encontrada.' : 'Ainda não há sessões registadas.')}`;

  sec.querySelector('[data-iniciar]').onclick = () => dialogoIniciarTreino({ clienteId: c.id });
  sec.querySelector('[data-registar]').onclick = () => dialogoRegistarSessao(c, () => seccaoSessoesCliente(sec, c, q));
  const pesquisa = sec.querySelector('#q-sessoes');
  pesquisa.onchange = () => seccaoSessoesCliente(sec, c, pesquisa.value);
}

// ---------------------------------------------------------------- Iniciar treino
export function dialogoIniciarTreino({ clienteId = null } = {}) {
  const emCurso = rs.sessaoEmCurso();
  if (emCurso) {
    aviso(`Já há um treino em curso (${emCurso.cliente_nome}). A abrir para retomares.`, 'info');
    return ir(`/sessao/${emCurso.id}`);
  }
  const clientes = listarClientes();
  if (!clientes.length) return aviso('Ainda não tens clientes.', 'erro');

  const corpoPlano = (cid) => {
    const sug = cid ? rs.sugerirSessaoPlano(cid) : null;
    if (!sug) return html`<p class="ajuda">Este cliente não tem plano ativo — podes fazer uma sessão livre.</p>`;
    if (!sug.sugerida) return html`<p class="ajuda">O plano ativo não tem sessões.</p>`;
    return html`${campo('plano_sessao_id', `Sessão do plano "${sug.plano.nome}" · semana ${sug.semana}${sug.plano.semanas.find((x) => x.semana === sug.semana)?.deload ? ' (deload)' : ''}`, {
      tipo: 'select', valor: sug.sugerida.id,
      opcoes: sug.plano.sessoes.map((s) => [s.id, `${s.nome}${sug.feitas.includes(s.id) ? ' ✓ já feita esta semana' : ''}`]),
    })}<input type="hidden" name="plano_id" value="${sug.plano.id}"><input type="hidden" name="semana" value="${sug.semana}">`;
  };

  const d = dialogo(
    'Iniciar treino',
    html`${campo('cliente_id', 'Cliente *', { tipo: 'select', valor: clienteId ?? '', opcoes: [['', '— escolher —'], ...clientes.map((c) => [c.id, c.nome])] })}
      ${campo('tipo', 'Tipo', { tipo: 'select', valor: 'treino', opcoes: Object.entries(TIPOS_SESSAO) })}
      <div id="w-plano">${corpoPlano(clienteId)}</div>
      <p class="ajuda" id="info-tipo"></p>`,
    {
      textoOk: '▶ Iniciar',
      onSubmit(form) {
        const f = lerForm(form);
        if (!f.cliente_id) return aviso('Escolhe o cliente.', 'erro'), false;
        const cid = +f.cliente_id;
        if (f.tipo === 'reavaliacao' && !temConsentimento(cid, 'dados_saude'))
          return aviso('Sem consentimento de dados de saúde: regista-o antes da reavaliação.', 'erro'), false;
        const usarPlano = f.tipo === 'treino' && f.plano_sessao_id;
        const escolha = {
          tipo: f.tipo === 'treino' && !usarPlano ? 'livre' : f.tipo,
          plano_id: usarPlano ? +f.plano_id : null, plano_sessao_id: usarPlano ? +f.plano_sessao_id : null, semana: usarPlano ? +f.semana : null,
        };
        // Se há uma sessão agendada hoje para o cliente, é ESSA que passa a "em curso" (não se duplica).
        const marcada = agendadaHoje(cid);
        const agora = rs.agoraLocal();
        if (!marcada && rs.sessaoDuplicada(cid, agora.slice(0, 10), agora.slice(11, 16)))
          return aviso('Já existe uma sessão deste cliente hoje a esta hora. Abre-a no histórico em vez de criar outra.', 'erro'), false;
        try {
          const id = marcada ? rs.iniciarSessaoAgendada(marcada.id, escolha) : rs.iniciarSessao({ cliente_id: cid, ...escolha });
          ir(`/sessao/${id}`);
        } catch (e) {
          aviso(e.message, 'erro');
          return false;
        }
      },
    }
  );
  const form = d.querySelector('form');
  const sync = () => {
    d.querySelector('#w-plano').hidden = form.tipo.value !== 'treino';
    const marcada = +form.cliente_id.value ? agendadaHoje(+form.cliente_id.value) : null;
    d.querySelector('#info-tipo').textContent = [
      marcada ? `Usa a sessão agendada para hoje às ${marcada.hora_inicio.slice(11, 16)}.` : '',
      form.tipo.value === 'reavaliacao' ? 'Abre a ficha de testes da baseline (pré-preenchida). Não desconta do pacote.'
        : form.tipo.value === 'livre' ? 'Sessão sem plano: acrescentas os exercícios durante o treino.' : '',
    ].filter(Boolean).join(' ');
  };
  form.cliente_id.onchange = () => { d.querySelector('#w-plano').innerHTML = corpoPlano(+form.cliente_id.value || null); sync(); };
  form.tipo.onchange = sync;
  sync();
}

// ---------------------------------------------------------------- Registar sessão (depois de acontecer)
export function dialogoRegistarSessao(c, depois) {
  const sug = rs.sugerirSessaoPlano(c.id);
  const d = dialogo(
    'Registar sessão',
    html`<div class="grelha-2">
        ${campo('data', 'Data *', { tipo: 'date', valor: hojeISO() })}
        ${campo('hora', 'Hora de início', { tipo: 'time', valor: '' })}
      </div>
      <div class="grelha-2">
        ${campo('estado', 'Estado *', { tipo: 'select', valor: 'realizada', opcoes: [['realizada', 'Realizada (presente)'], ['faltou', 'Faltou'], ['cancelada', 'Cancelada']] })}
        ${campo('tipo', 'Tipo', { tipo: 'select', valor: sug?.sugerida ? 'treino' : 'livre', opcoes: Object.entries(TIPOS_SESSAO) })}
      </div>
      <div id="w-plano">${sug?.sugerida
        ? html`${campo('plano_sessao_id', `Sessão do plano "${sug.plano.nome}"`, { tipo: 'select', valor: sug.sugerida.id, opcoes: sug.plano.sessoes.map((s) => [s.id, s.nome]) })}
          ${campo('semana', 'Semana do plano', { tipo: 'select', valor: sug.semana, opcoes: sug.plano.semanas.map((s) => [s.semana, `Semana ${s.semana}${s.deload ? ' (deload)' : ''}`]) })}`
        : html`<p class="ajuda">Sem plano ativo: fica registada como sessão livre.</p>`}</div>
      ${campo('duracao_min', 'Duração (min)', { tipo: 'number', valor: 60 })}
      ${campo('desconta_pacote', 'Descontar do pacote', { tipo: 'checkbox', valor: true })}
      <p class="ajuda" id="info-pacote"></p>
      <div id="w-falta">${campo('motivo_falta', 'Motivo da falta', { valor: '' })}</div>
      ${campo('notas', 'Notas privadas', { tipo: 'textarea', valor: '' })}
      <p class="ajuda">Numa sessão realizada do plano, as séries ficam registadas como planeadas; a seguir abre-se a sessão para corrigires o que mudou.</p>`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dataS = v.data('data', f.data, { obrigatorio: true, futuro: f.estado === 'cancelada' });
        if (f.hora && !/^\d{2}:\d{2}$/.test(f.hora)) v.erro('hora', 'Hora inválida.');
        const dur = f.estado === 'realizada' ? v.numero('duracao_min', f.duracao_min, { min: 1, max: 360, nome: 'Duração', unidade: 'min' }) : null;
        if (dataS && f.hora && rs.sessaoDuplicada(c.id, dataS, f.hora)) v.erro('hora', 'Já existe uma sessão deste cliente nesse dia a essa hora.');
        if (f.tipo === 'reavaliacao' && !temConsentimento(c.id, 'dados_saude')) v.erro('tipo', 'Sem consentimento de dados de saúde.');
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const usarPlano = f.tipo === 'treino' && f.plano_sessao_id;
        const dados = {
          cliente_id: c.id, data: dataS, hora: f.hora || null, duracao_min: dur, estado: f.estado,
          tipo: f.tipo === 'treino' && !usarPlano ? 'livre' : f.tipo,
          plano_id: usarPlano ? sug.plano.id : null, plano_sessao_id: usarPlano ? +f.plano_sessao_id : null, semana: usarPlano ? +f.semana : null,
          desconta_pacote: f.tipo !== 'reavaliacao' && f.estado !== 'cancelada' && f.desconta_pacote,
          motivo_falta: f.estado === 'faltou' ? f.motivo_falta?.trim() || null : null,
          notas: v.texto('notas', f.notas, { max: 3000 }),
        };
        const id = rs.registarSessao(dados);
        const s = rs.obterSessao(id);
        if (dados.desconta_pacote && !s.pacote_id) aviso('Sem pacote disponível nessa data: a sessão ficou registada SEM descontar.', 'erro');
        else aviso('Sessão registada.');
        if (dados.tipo === 'reavaliacao' && f.estado === 'realizada') return void ir(`/cliente/${c.id}/avaliacao/nova?tipo=reavaliacao&sessao=${id}`);
        if (f.estado === 'realizada' && usarPlano) return void ir(`/sessao/${id}`);
        depois?.();
      },
    }
  );
  const form = d.querySelector('form');
  const sync = () => {
    const est = form.estado.value, tipo = form.tipo.value;
    d.querySelector('#w-falta').hidden = est !== 'faltou';
    d.querySelector('#w-plano').hidden = tipo !== 'treino';
    form.duracao_min.closest('.campo').hidden = est !== 'realizada';
    const chk = form.desconta_pacote;
    chk.disabled = tipo === 'reavaliacao' || est === 'cancelada';
    if (chk.disabled) chk.checked = false;
    const { pacote, todosEsgotados } = pacoteParaData(c.id, form.data.value || hojeISO());
    d.querySelector('#info-pacote').textContent = tipo === 'reavaliacao' ? 'Reavaliações não descontam do pacote.'
      : est === 'faltou' ? 'Por defeito uma falta não desconta — liga o interruptor se quiseres descontar.'
      : pacote ? `Pacote "${pacote.nome}": restam ${pacote.restantes}.`
      : todosEsgotados ? '⚠ Pacote esgotado: não vai descontar.' : '⚠ Sem pacote válido nessa data: não vai descontar.';
  };
  form.estado.onchange = () => { form.desconta_pacote.checked = form.estado.value === 'realizada'; sync(); };
  form.tipo.onchange = form.data.onchange = sync;
  sync();
}
