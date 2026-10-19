// Pacotes e pagamentos: separador da ficha, tipos de pacote (definições) e resumo mensal.
// Nada disto aparece no modo cliente nem nos PDF.
import * as rk from '../repo-pacotes.js';
import { todos } from '../db.js';
import { METODOS_PAGAMENTO } from '../catalogos.js';
import { html, data, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { cabecalho, etiqueta, dialogo, confirmar, campo, vazio } from './ui.js';

const eur = (v) => (v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v));

// ---------------------------------------------------------------- Separador da ficha
export function seccaoPacotesCliente(sec, c) {
  const recarregar = () => seccaoPacotesCliente(sec, c);
  const pacotes = rk.listarPacotes(c.id);
  const atual = rk.pacoteAtual(c.id);
  const alerta = rk.alertaPacote(c.id);
  const pags = rk.listarPagamentos(c.id);

  sec.innerHTML = html`
    ${alerta ? html`<div class="caixa ${alerta.nivel === 'alerta' ? 'caixa-alerta' : 'caixa-aviso'}">⚠ ${alerta.texto} — considera a renovação.</div>` : ''}
    ${atual ? html`<div class="cartao">
      <h3>${atual.nome} ${atual.expirado ? etiqueta('expirado', 'tag-alerta') : atual.esgotado ? etiqueta('esgotado', 'tag-alerta') : etiqueta('ativo', 'tag-ok')}</h3>
      <div class="barra-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="${atual.sessoes_contratadas}" aria-valuenow="${atual.usadas}">
        <span style="width:${Math.min(100, (atual.usadas / atual.sessoes_contratadas) * 100)}%"></span></div>
      <p><strong>${atual.usadas}</strong> usadas de ${atual.sessoes_contratadas} · <strong>${Math.max(0, atual.restantes)}</strong> em falta</p>
      <p class="ajuda">Início ${data(atual.data_inicio)} · validade ${data(atual.data_validade)}${!atual.expirado ? ` (${atual.diasParaExpirar} dias)` : ''}${atual.preco ? ` · ${eur(atual.preco)}` : ''}</p>
    </div>` : ''}
    <div class="botoes barra-acoes-topo">
      <button class="btn" id="novo-pacote">+ Pacote</button>
      <button class="btn btn-sec" id="novo-pag">+ Pagamento</button>
    </div>

    <div class="cartao"><h3>Histórico de pacotes</h3>
      ${pacotes.length ? html`<ul class="lista lista-simples">${pacotes.map((p) => html`<li>
        <div><strong>${p.nome}</strong> ${p.expirado ? etiqueta('expirado') : p.esgotado ? etiqueta('esgotado') : p.futuro ? etiqueta('futuro') : etiqueta('ativo', 'tag-ok')}
          <div class="ajuda">${data(p.data_inicio)} → ${data(p.data_validade)} · ${p.usadas}/${p.sessoes_contratadas} sessões${p.preco ? ` · ${eur(p.preco)}` : ''}</div>
          ${p.notas ? html`<div class="ajuda">${p.notas}</div>` : ''}</div>
        <button class="btn btn-sec btn-peq" data-pacote="${p.id}">Editar</button></li>`)}</ul>`
        : html`<p class="ajuda">Sem pacotes.</p>`}
    </div>

    <div class="cartao"><h3>Pagamentos</h3>
      <p class="ajuda">Registo manual. A app não processa pagamentos nem guarda dados de cartões.</p>
      ${pags.length ? html`<table class="tabela"><thead><tr><th>Data</th><th>Valor</th><th>Método</th><th>Estado</th><th></th></tr></thead><tbody>
        ${pags.map((p) => html`<tr><td>${data(p.data)}</td><td>${eur(p.valor)}</td><td>${p.metodo}${p.pacote_nome ? html`<br><small>${p.pacote_nome}</small>` : ''}</td>
          <td>${etiqueta(p.estado === 'pago' ? 'Pago' : 'Pendente', p.estado === 'pago' ? 'tag-ok' : 'tag-aviso')}</td>
          <td><button class="btn btn-sec btn-icone" data-pag="${p.id}" aria-label="Editar">✎</button></td></tr>`)}
      </tbody></table>` : html`<p class="ajuda">Sem pagamentos registados.</p>`}
    </div>`;

  sec.querySelector('#novo-pacote').onclick = () => dialogoPacote(c, null, recarregar);
  sec.querySelector('#novo-pag').onclick = () => dialogoPagamento(c, null, pacotes, recarregar);
  sec.querySelectorAll('[data-pacote]').forEach((b) => (b.onclick = () => dialogoPacote(c, pacotes.find((p) => p.id === +b.dataset.pacote), recarregar)));
  sec.querySelectorAll('[data-pag]').forEach((b) => (b.onclick = () => dialogoPagamento(c, pags.find((p) => p.id === +b.dataset.pag), pacotes, recarregar)));
}

function dialogoPacote(c, p, recarregar) {
  const tipos = rk.listarTiposPacote();
  const d = dialogo(
    p ? 'Editar pacote' : 'Novo pacote',
    html`${p ? '' : campo('tipo_pacote_id', 'Tipo de pacote', { tipo: 'select', opcoes: [['', '— personalizado —'], ...tipos.map((t) => [t.id, `${t.nome} (${t.sessoes} sessões, ${t.validade_dias} dias)`])] })}
      ${campo('nome', 'Nome *', { valor: p?.nome ?? '' })}
      <div class="grelha-2">
        ${campo('sessoes_contratadas', 'Sessões contratadas *', { tipo: 'number', valor: p?.sessoes_contratadas ?? '', attrs: 'inputmode="numeric"' })}
        ${campo('preco', 'Preço (€)', { tipo: 'number', valor: p?.preco ?? '' })}
        ${campo('data_inicio', 'Início *', { tipo: 'date', valor: p?.data_inicio ?? hojeISO() })}
        ${campo('data_validade', 'Validade *', { tipo: 'date', valor: p?.data_validade ?? '' })}
      </div>
      ${campo('notas', 'Notas', { valor: p?.notas ?? '' })}
      ${p ? html`<p class="ajuda">Sessões já descontadas: ${p.usadas}.</p><button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar pacote</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dados = {
          nome: v.texto('nome', f.nome, { obrigatorio: true, max: 60, nome: 'Nome' }),
          sessoes_contratadas: v.numero('sessoes_contratadas', f.sessoes_contratadas, { min: 1, max: 500, inteiro: true, obrigatorio: true, nome: 'Sessões' }),
          preco: v.numero('preco', f.preco, { min: 0, max: 20000, nome: 'Preço', unidade: '€' }),
          data_inicio: v.data('data_inicio', f.data_inicio, { obrigatorio: true, futuro: true, nome: 'Início' }),
          data_validade: v.data('data_validade', f.data_validade, { obrigatorio: true, futuro: true, nome: 'Validade' }),
          notas: v.texto('notas', f.notas, { max: 300 }),
        };
        if (dados.data_inicio && dados.data_validade && dados.data_validade < dados.data_inicio) v.erro('data_validade', 'A validade não pode ser antes do início.');
        if (p && dados.sessoes_contratadas != null && dados.sessoes_contratadas < p.usadas)
          v.erro('sessoes_contratadas', `Já foram descontadas ${p.usadas} sessões — não pode ter menos do que isso.`);
        if (!v.ok) return mostrarErros(form, v.erros), false;
        if (!p) dados.tipo_pacote_id = f.tipo_pacote_id ? +f.tipo_pacote_id : null;
        rk.guardarPacote(p ? dados : { ...dados, cliente_id: c.id }, p?.id);
        aviso('Pacote guardado.');
        recarregar();
      },
    }
  );
  const form = d.querySelector('form');
  // Escolher um tipo preenche nome, sessões, preço e validade (editáveis).
  if (form.tipo_pacote_id) form.tipo_pacote_id.onchange = () => {
    const t = tipos.find((x) => x.id === +form.tipo_pacote_id.value);
    if (!t) return;
    form.nome.value = t.nome;
    form.sessoes_contratadas.value = t.sessoes;
    form.preco.value = t.preco ?? '';
    form.data_validade.value = rk.somarDias(form.data_inicio.value || hojeISO(), t.validade_dias);
  };
  form.data_inicio.onchange = () => {
    const t = tipos.find((x) => x.id === +form.tipo_pacote_id?.value);
    if (t) form.data_validade.value = rk.somarDias(form.data_inicio.value, t.validade_dias);
  };
  d.querySelector('#apagar')?.addEventListener('click', async () => {
    d.fechar();
    const n = rk.sessoesDoPacote(p.id);
    if (!(await confirmar(`Apagar o pacote "${p.nome}"?${n ? ` As ${n} sessões ligadas deixam de descontar de um pacote.` : ''}`, { textoOk: 'Apagar' }))) return;
    rk.apagarPacote(p.id);
    recarregar();
  });
}

function dialogoPagamento(c, pg, pacotes, recarregar) {
  const d = dialogo(
    pg ? 'Editar pagamento' : 'Novo pagamento',
    html`<div class="grelha-2">
        ${campo('data', 'Data *', { tipo: 'date', valor: pg?.data ?? hojeISO() })}
        ${campo('valor', 'Valor (€) *', { tipo: 'number', valor: pg?.valor ?? (pacotes[0]?.preco ?? '') })}
        ${campo('metodo', 'Método *', { tipo: 'select', valor: pg?.metodo ?? 'MB WAY', opcoes: METODOS_PAGAMENTO.map((m) => [m, m]) })}
        ${campo('estado', 'Estado *', { tipo: 'select', valor: pg?.estado ?? 'pago', opcoes: [['pago', 'Pago'], ['pendente', 'Pendente']] })}
      </div>
      ${campo('pacote_id', 'Referente ao pacote', { tipo: 'select', valor: pg?.pacote_id ?? pacotes[0]?.id ?? '', opcoes: [['', '— nenhum —'], ...pacotes.map((p) => [p.id, `${p.nome} (${data(p.data_inicio)})`])] })}
      ${campo('notas', 'Notas', { valor: pg?.notas ?? '' })}
      ${pg ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar pagamento</button>` : ''}`,
    {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dados = {
          cliente_id: c.id,
          data: v.data('data', f.data, { obrigatorio: true, futuro: f.estado === 'pendente' }),
          valor: v.numero('valor', f.valor, { min: 0.01, max: 20000, obrigatorio: true, nome: 'Valor', unidade: '€' }),
          metodo: f.metodo, estado: f.estado, pacote_id: f.pacote_id ? +f.pacote_id : null,
          notas: v.texto('notas', f.notas, { max: 300 }),
        };
        if (!v.ok) return mostrarErros(form, v.erros), false;
        rk.guardarPagamento(dados, pg?.id);
        aviso('Pagamento guardado.');
        recarregar();
      },
    }
  );
  d.querySelector('#apagar')?.addEventListener('click', async () => {
    d.fechar();
    if (!(await confirmar('Apagar este pagamento?', { textoOk: 'Apagar' }))) return;
    rk.apagarPagamento(pg.id);
    recarregar();
  });
}

// ---------------------------------------------------------------- Tipos de pacote (nas Definições)
export function blocoTiposPacote(alvo) {
  const desenhar = () => {
    const tipos = rk.listarTiposPacote({ incluirInativos: true });
    alvo.innerHTML = html`<div class="cartao-cab"><h3>Tipos de pacote</h3><button type="button" class="btn btn-peq" id="novo-tipo">+ Tipo</button></div>
      ${tipos.length ? html`<ul class="lista lista-simples">${tipos.map((t) => html`<li class="${t.ativo ? '' : 'inativa'}">
        <div><strong>${t.nome}</strong> <div class="ajuda">${t.sessoes} sessões · ${t.validade_dias} dias${t.preco != null ? ` · ${eur(t.preco)}` : ''}${t.ativo ? '' : ' · inativo'}</div></div>
        <button type="button" class="btn btn-sec btn-peq" data-tipo="${t.id}">Editar</button></li>`)}</ul>`
        : html`<p class="ajuda">Cria aqui os pacotes que vendes (ex.: 10 sessões, 60 dias).</p>`}`;
    alvo.querySelector('#novo-tipo').onclick = () => dialogoTipo(null);
    alvo.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => dialogoTipo(tipos.find((t) => t.id === +b.dataset.tipo))));
  };
  const dialogoTipo = (t) =>
    dialogo(
      t ? 'Editar tipo de pacote' : 'Novo tipo de pacote',
      html`${campo('nome', 'Nome *', { valor: t?.nome ?? '' })}
        <div class="grelha-3">
          ${campo('sessoes', 'Sessões *', { tipo: 'number', valor: t?.sessoes ?? '', attrs: 'inputmode="numeric"' })}
          ${campo('validade_dias', 'Validade (dias) *', { tipo: 'number', valor: t?.validade_dias ?? 60, attrs: 'inputmode="numeric"', ajuda: 'Ex.: 8 semanas = 56' })}
          ${campo('preco', 'Preço (€)', { tipo: 'number', valor: t?.preco ?? '' })}
        </div>
        ${t ? campo('ativo', 'Ativo (aparece ao criar pacotes)', { tipo: 'checkbox', valor: t.ativo }) : ''}`,
      {
        onSubmit(form) {
          const f = lerForm(form);
          const v = new Validador();
          const dados = {
            nome: v.texto('nome', f.nome, { obrigatorio: true, max: 60, nome: 'Nome' }),
            sessoes: v.numero('sessoes', f.sessoes, { min: 1, max: 500, inteiro: true, obrigatorio: true, nome: 'Sessões' }),
            validade_dias: v.numero('validade_dias', f.validade_dias, { min: 1, max: 1000, inteiro: true, obrigatorio: true, nome: 'Validade' }),
            preco: v.numero('preco', f.preco, { min: 0, max: 20000, nome: 'Preço' }),
          };
          if (t) dados.ativo = f.ativo ? 1 : 0;
          if (!v.ok) return mostrarErros(form, v.erros), false;
          rk.guardarTipoPacote(dados, t?.id);
          desenhar();
        },
      }
    );
  desenhar();
}

// ---------------------------------------------------------------- Resumo mensal (página)
export function vistaPagamentos(el, { mes }) {
  mes = /^\d{4}-\d{2}$/.test(mes || '') ? mes : hojeISO().slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const mover = (k) => {
    const d = new Date(a, m - 1 + k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const nomeMes = new Date(a, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const r = rk.resumoMensal(mes);
  const alertas = todos('SELECT id, nome FROM clientes WHERE ativo = 1 ORDER BY nome').map((c) => ({ c, a: rk.alertaPacote(c.id) })).filter((x) => x.a);

  el.innerHTML = html`
    ${cabecalho('Pagamentos e pacotes', { voltar: '/' })}
    <div class="nav-mes">
      <a class="btn btn-sec btn-icone" href="#/pagamentos?mes=${mover(-1)}" aria-label="Mês anterior">‹</a>
      <strong>${nomeMes}</strong>
      <a class="btn btn-sec btn-icone" href="#/pagamentos?mes=${mover(1)}" aria-label="Mês seguinte">›</a>
    </div>
    <div class="kpis">
      <div class="kpi"><span>${eur(r.pago)}</span>recebido</div>
      <div class="kpi"><span>${eur(r.pendente)}</span>pendente (mês)</div>
      <div class="kpi"><span>${r.sessoes.realizadas ?? 0}</span>sessões realizadas${r.sessoes.faltas ? ` · ${r.sessoes.faltas} faltas` : ''}</div>
    </div>
    ${Object.keys(r.porMetodo).length ? html`<div class="cartao"><h3>Recebido por método</h3><table class="tabela"><tbody>
      ${Object.entries(r.porMetodo).map(([k, v]) => html`<tr><td>${k}</td><td>${eur(v)}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="cartao"><h3>Pagamentos do mês</h3>
      ${r.pags.length ? html`<table class="tabela"><thead><tr><th>Data</th><th>Cliente</th><th>Valor</th><th>Estado</th></tr></thead><tbody>
        ${r.pags.map((p) => html`<tr><td>${data(p.data)}</td><td><a href="#/cliente/${p.cliente_id}?tab=pacotes">${p.cliente_nome}</a></td><td>${eur(p.valor)}<br><small>${p.metodo}</small></td>
          <td>${etiqueta(p.estado === 'pago' ? 'Pago' : 'Pendente', p.estado === 'pago' ? 'tag-ok' : 'tag-aviso')}</td></tr>`)}
      </tbody></table>` : vazio('Sem pagamentos neste mês.')}
    </div>
    ${r.pendentesTotais.length ? html`<div class="cartao"><h3>Pendentes (todos os meses)</h3><ul class="lista lista-simples">
      ${r.pendentesTotais.map((p) => html`<li><div><a href="#/cliente/${p.cliente_id}?tab=pacotes">${p.cliente_nome}</a> <div class="ajuda">${data(p.data)} · ${p.metodo}</div></div><strong>${eur(p.valor)}</strong></li>`)}
    </ul></div>` : ''}
    <div class="cartao"><h3>Pacotes a renovar</h3>
      ${alertas.length ? html`<ul class="lista lista-simples">${alertas.map(({ c, a: al }) => html`<li><a href="#/cliente/${c.id}?tab=pacotes">${c.nome}</a>
        ${etiqueta(al.texto, al.nivel === 'alerta' ? 'tag-alerta' : 'tag-aviso')}</li>`)}</ul>` : html`<p class="ajuda">Nenhum pacote a precisar de renovação.</p>`}
    </div>`;
}
