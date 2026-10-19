// Separador "Zonas" (clientes com resistência): zonas de FC, zonas de ritmo, previsões e Hyrox.
// TUDO é apresentado como ESTIMATIVA.
import * as repo from '../repo.js';
import { todos, inserir, atualizar, executar } from '../db.js';
import { zonasFC } from '../calc.js';
import * as rt from '../ritmos.js';
import { DEFINICOES_PADRAO, TESTES_AEROBIOS } from '../catalogos.js';
import { html, data, num, tempo, lerTempo, hojeISO, Validador, mostrarErros, lerForm, aviso } from '../util.js';
import { dialogo, confirmar, campo } from './ui.js';

const defs = (k) => repo.def(k) ?? DEFINICOES_PADRAO[k];
const fx = (a, b) => `${tempo(a)}–${tempo(b)}`;

export function seccaoZonasCliente(sec, c) {
  const recarregar = () => seccaoZonasCliente(sec, repo.obterCliente(c.id));
  const fc = repo.fcMaxCliente(c);
  const rep = repo.ultimaFCRepouso(c.id);
  const zFC = zonasFC(fc.usada, rep, defs('zonas_fc'));

  // Último teste aeróbio de cada tipo.
  const testes = todos(
    `SELECT r.*, a.data FROM avaliacao_resistencia r JOIN avaliacoes a ON a.id = r.avaliacao_id
     WHERE a.cliente_id = ? AND r.teste IS NOT NULL ORDER BY a.data DESC`,
    [c.id]
  );
  const ultimo = (t) => testes.find((x) => x.teste === t);
  const corrida = testes.find((x) => ['corrida_3km', 'cooper_12min'].includes(x.teste));
  const remo = ultimo('remo_2km');
  const k = defs('riegel_k');
  const t5k = corrida ? rt.tempo5kDoTeste(corrida.teste, corrida.tempo_seg, corrida.distancia_m, k) : null;
  const zCorr = t5k ? rt.zonasRitmoCorrida(t5k / 5, defs('zonas_ritmo_corrida')) : null;
  const zRemo = remo ? rt.zonasRitmoRemo(remo.tempo_seg, defs('zonas_ritmo_remo')) : null;
  const previsoes = t5k ? [['5 km', 5000], ['10 km', 10000], ['Meia maratona', 21097]].map(([n, d]) => [n, rt.riegel(t5k, 5000, d, k), d]) : [];

  sec.innerHTML = html`
    <div class="caixa caixa-info">Todos os valores desta página são <strong>estimativas</strong> calculadas a partir dos testes.
      Usa-os como ponto de partida e ajusta pela perceção de esforço, pelo terreno e pelo dia.</div>

    <div class="cartao"><h3>Zonas de FC</h3>
      <p>FC máx.: <strong>${fc.usada ?? '—'} bpm</strong> <small>(${fc.fonte})</small> · FC repouso: <strong>${rep ?? '—'} bpm</strong></p>
      ${zFC ? html`<table class="tabela"><thead><tr><th>Zona</th><th>% reserva</th><th>bpm</th></tr></thead><tbody>
        ${zFC.map((z) => html`<tr><td>${z.nome}</td><td>${z.min}–${z.max}%</td><td><strong>${z.bpmMin}–${z.bpmMax}</strong></td></tr>`)}</tbody></table>`
        : html`<p class="ajuda">Regista a FC de repouso numa avaliação para calcular as zonas.</p>`}
    </div>

    <div class="cartao"><h3>Ritmos de corrida</h3>
      ${zCorr ? html`<p>A partir de: <strong>${TESTES_AEROBIOS[corrida.teste].nome}</strong> de ${data(corrida.data)}
          (${corrida.tempo_seg ? tempo(corrida.tempo_seg) : `${corrida.distancia_m} m`}) → 5 km estimados em <strong>${tempo(t5k)}</strong> (${tempo(t5k / 5)}/km).</p>
        <table class="tabela"><thead><tr><th>Zona</th><th>Ritmo (min/km)</th></tr></thead><tbody>
          ${zCorr.map((z) => html`<tr><td>${z.nome}</td><td><strong>${fx(z.rapido, z.lento)}</strong></td></tr>`)}</tbody></table>
        <h4>Previsões (Riegel)</h4>
        <table class="tabela"><tbody>${previsoes.map(([n, t, d]) => html`<tr><td>${n}</td><td><strong>${tempo(t)}</strong></td><td>${tempo(t / (d / 1000))}/km</td></tr>`)}</tbody></table>
        <p class="ajuda">Quanto mais longe da distância do teste, menos fiável (a meia maratona assume treino de volume adequado).</p>`
        : html`<p class="ajuda">Precisa de um teste de corrida (3 km ou 12 min) numa avaliação.</p>`}
    </div>

    ${zRemo ? html`<div class="cartao"><h3>Ritmos de remo</h3>
      <p>Teste de 2 km de ${data(remo.data)}: <strong>${tempo(remo.tempo_seg)}</strong> → parcial médio <strong>${tempo(zRemo.split)}/500 m</strong>.</p>
      <table class="tabela"><thead><tr><th>Zona</th><th>Parcial (/500 m)</th></tr></thead><tbody>
        ${zRemo.zonas.map((z) => html`<tr><td>${z.nome}</td><td><strong>${fx(z.rapido, z.lento)}</strong></td></tr>`)}</tbody></table></div>` : ''}

    ${blocoHyrox(c, zCorr)}`;

  ligarHyrox(sec, c, recarregar);
}

// ---------------------------------------------------------------- Hyrox
function blocoHyrox(c, zCorr) {
  const refs = defs('hyrox_referencias');
  if (!c.hyrox_escalao)
    return html`<div class="cartao"><h3>Hyrox</h3>
      <p class="ajuda">Para clientes que se preparam para competir: ritmos-alvo por estação e por km, a partir de um tempo-meta.</p>
      <button class="btn btn-sec" id="hx-config">Ativar preparação Hyrox</button></div>`;

  const ref = refs[c.hyrox_escalao];
  const m = rt.metasHyrox(ref.tempos, c.hyrox_meta_seg);
  const sims = todos('SELECT * FROM hyrox_simulacoes WHERE cliente_id = ? ORDER BY data DESC', [c.id]).map((s) => ({ ...s, tempos: JSON.parse(s.tempos) }));
  const ult = sims[0];
  // Em que zona estimada cai o ritmo-alvo de corrida?
  const ritmoMeta = m.metas.corrida;
  const zonaCorr = zCorr?.find((z) => ritmoMeta >= z.rapido && ritmoMeta <= z.lento);

  return html`<div class="cartao"><div class="cartao-cab"><h3>Hyrox · ${ref.nome}</h3><button class="btn btn-sec btn-peq" id="hx-config">Alterar</button></div>
    <p>Meta: <strong>${c.hyrox_meta_seg ? tempo(c.hyrox_meta_seg) : tempo(m.totalRef)}</strong>
      <small>(referência do escalão: ${tempo(m.totalRef)}${c.hyrox_meta_seg ? ` · fator ${num(m.fator, 2)}` : ''})</small></p>
    ${zonaCorr ? html`<p class="ajuda">O ritmo-alvo de corrida (${tempo(ritmoMeta)}/km) cai na tua zona estimada <strong>${zonaCorr.nome}</strong>.</p>` : ''}
    <table class="tabela resultados"><thead><tr><th>Segmento</th><th>Meta</th><th>Ritmo-alvo</th>${ult ? html`<th>Simulação ${data(ult.data).slice(0, 5)}</th>` : ''}</tr></thead><tbody>
      ${rt.SEGMENTOS_HYROX.map((g) => {
        const meta = m.metas[g.id];
        const r = rt.ritmoSegmento(g, meta);
        const feito = ult?.tempos[g.id];
        const dif = feito && meta ? feito - meta : null;
        return html`<tr><td>${g.nome}</td><td><strong>${meta ? tempo(meta) : '—'}</strong>${g.vezes ? html`<br><small>× ${g.vezes} = ${tempo(meta * g.vezes)}</small>` : ''}</td>
          <td>${r ? `${tempo(r.seg)}${r.unidade}` : '—'}</td>
          ${ult ? html`<td>${feito ? tempo(feito) : '—'}${dif != null ? html`<br><small class="${dif <= 0 ? 'txt-ok' : 'txt-alerta'}">${dif <= 0 ? '▲ ' : '▼ +'}${tempo(Math.abs(dif))}</small>` : ''}</td>` : ''}</tr>`;
      })}
      <tr><td><strong>Total</strong></td><td><strong>${tempo(rt.totalHyrox(m.metas))}</strong></td><td></td>${ult ? html`<td><strong>${tempo(ult.total_seg)}</strong>${ult.completa ? '' : html`<br><small>parcial</small>`}</td>` : ''}</tr>
    </tbody></table>
    <p class="ajuda">Metas = tempos de referência do escalão escalados para o teu tempo-meta (editáveis nas Definições). São estimativas.</p>

    <div class="cartao-cab"><h4>Simulações</h4><button class="btn btn-peq" id="hx-sim">+ Simulação</button></div>
    ${sims.length ? html`<ul class="lista lista-simples">${sims.map((s) => html`<li><div><strong>${data(s.data)}</strong> · ${refs[s.escalao]?.nome ?? s.escalao}
        <div class="ajuda">Total ${tempo(s.total_seg)}${s.completa ? '' : ' (parcial)'}${s.notas ? ` · ${s.notas}` : ''}</div></div>
        <button class="btn btn-sec btn-peq" data-sim="${s.id}">Editar</button></li>`)}</ul>`
      : html`<p class="ajuda">Sem simulações registadas (teste opcional).</p>`}
  </div>`;
}

function ligarHyrox(sec, c, recarregar) {
  const refs = defs('hyrox_referencias');
  sec.querySelector('#hx-config')?.addEventListener('click', () =>
    dialogo('Preparação Hyrox', html`
      ${campo('escalao', 'Escalão', { tipo: 'select', valor: c.hyrox_escalao ?? 'open_ind', opcoes: [['', '— desativar —'], ...Object.entries(refs).map(([k, v]) => [k, v.nome])] })}
      ${campo('meta', 'Tempo-meta (h:mm:ss)', { valor: c.hyrox_meta_seg ? tempo(c.hyrox_meta_seg) : '', attrs: 'inputmode="numeric" placeholder="1:25:00"', ajuda: 'Vazio = usa o tempo de referência do escalão.' })}`, {
      onSubmit(form) {
        const f = lerForm(form);
        const meta = f.meta ? lerTempo(f.meta) : null;
        if (f.meta && (meta == null || meta < 2400 || meta > 4 * 3600)) return mostrarErros(form, { meta: 'Tempo-meta impossível (entre 40:00 e 4:00:00, formato h:mm:ss).' }), false;
        atualizar('clientes', c.id, { hyrox_escalao: f.escalao || null, hyrox_meta_seg: f.escalao ? meta : null });
        recarregar();
      },
    }));
  const abrirSim = (s) => {
    const d = dialogo(s ? 'Editar simulação' : 'Nova simulação Hyrox', html`
      <div class="grelha-2">
        ${campo('data', 'Data *', { tipo: 'date', valor: s?.data ?? hojeISO() })}
        ${campo('escalao', 'Escalão', { tipo: 'select', valor: s?.escalao ?? c.hyrox_escalao, opcoes: Object.entries(refs).map(([k, v]) => [k, v.nome]) })}
      </div>
      <p class="ajuda">Tempos em m:ss. Na corrida indica a <strong>média por km</strong>. Deixa vazio o que não fez (simulação parcial).</p>
      <div class="grelha-2">${rt.SEGMENTOS_HYROX.map((g) => campo(`t_${g.id}`, g.nome, { valor: s?.tempos[g.id] ? tempo(s.tempos[g.id]) : '', attrs: 'inputmode="numeric" placeholder="m:ss"' }))}</div>
      ${campo('notas', 'Notas', { valor: s?.notas ?? '' })}
      ${s ? html`<button type="button" class="btn btn-perigo btn-peq" id="apagar">Apagar simulação</button>` : ''}`, {
      onSubmit(form) {
        const f = lerForm(form);
        const v = new Validador();
        const dataS = v.data('data', f.data, { obrigatorio: true });
        const tempos = {};
        for (const g of rt.SEGMENTOS_HYROX) {
          const txt = f[`t_${g.id}`]?.trim();
          if (!txt) continue;
          const t = lerTempo(txt);
          if (t == null || t < 5 || t > 3600) v.erro(`t_${g.id}`, `${g.nome}: tempo inválido (m:ss).`);
          else tempos[g.id] = t;
        }
        if (!Object.keys(tempos).length) v.erro('t_corrida', 'Indica pelo menos um tempo.');
        if (!v.ok) return mostrarErros(form, v.erros), false;
        const completa = rt.SEGMENTOS_HYROX.every((g) => tempos[g.id]) ? 1 : 0;
        const dados = { cliente_id: c.id, data: dataS, escalao: f.escalao, tempos: JSON.stringify(tempos), total_seg: Math.round(rt.totalHyrox(tempos)), completa, notas: f.notas?.trim() || null };
        s ? atualizar('hyrox_simulacoes', s.id, dados) : inserir('hyrox_simulacoes', dados);
        aviso('Simulação guardada.');
        recarregar();
      },
    });
    d.querySelector('#apagar')?.addEventListener('click', async () => {
      d.fechar();
      if (!(await confirmar('Apagar esta simulação?', { textoOk: 'Apagar' }))) return;
      executar('DELETE FROM hyrox_simulacoes WHERE id = ?', [s.id]);
      recarregar();
    });
  };
  sec.querySelector('#hx-sim')?.addEventListener('click', () => abrirSim(null));
  sec.querySelectorAll('[data-sim]').forEach((b) => (b.onclick = () => {
    const s = todos('SELECT * FROM hyrox_simulacoes WHERE id = ?', [+b.dataset.sim])[0];
    abrirSim({ ...s, tempos: JSON.parse(s.tempos) });
  }));
}
