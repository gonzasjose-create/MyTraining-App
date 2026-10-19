// Resumo semanal e relatório de período: página imprimível (PDF A4), imagem vertical e WhatsApp.
// Só mostra dados "visíveis ao cliente" (visao-cliente.js) — sem notas privadas, pagamentos, alertas nem lesões.
import * as vc from '../visao-cliente.js';
import { obterCliente, def, temConsentimento } from '../repo.js';
import { e1rmPorExercicio, inicioSemana, somarDias } from '../analise.js';
import { linhaTemporalFotos, urlFoto, libertarUrls, ANGULOS } from '../repo-fotos.js';
import { ESCALAS_CHECKIN } from '../catalogos.js';
import { imagemSemana, imagemRelatorio, partilharOuDescarregar } from '../imagem-resumo.js';
import { linha, limparGraficos } from '../graficos.js';
import { linkWhatsApp } from './metas.js';
import { html, raw, data, num, hojeISO, aviso, esc } from '../util.js';
import { dialogo, campo } from './ui.js';
import { ir } from '../app.js';

// Textos editáveis antes de gerar (por cliente, enquanto a app está aberta).
const textos = new Map();

export function vistaRelatorio(el, { id, tipo = 'semana', de, ate, semana }) {
  const c = obterCliente(+id);
  if (!c) return ir('/clientes');
  limparGraficos();
  libertarUrls();
  const hoje = hojeISO();
  const marca = def('negocio');
  const eSemana = tipo !== 'periodo';
  const seg = inicioSemana(semana || hoje);
  de = de || somarDias(hoje, -27);
  ate = ate || hoje;
  const r = eSemana ? vc.resumoSemana(c, seg) : vc.relatorioPeriodo(c, de, ate);
  const chave = `${c.id}-${tipo}`;
  const t = textos.get(chave) ?? { foco: eSemana ? r.foco : '', passos: '', fotos: false };
  textos.set(chave, t);
  const podeWA = temConsentimento(c.id, 'partilha_whatsapp') && c.telemovel;
  const podeFotos = temConsentimento(c.id, 'fotografias') && linhaTemporalFotos(c.id).length >= 1;
  const voltar = `/cliente/${c.id}`;
  const url = (o) => `#/relatorio/${c.id}?${new URLSearchParams({ tipo, ...(eSemana ? { semana: seg } : { de, ate }), ...o })}`;

  el.innerHTML = html`
    <div class="barra-relatorio nao-imprimir">
      <div class="cab"><a class="voltar" href="#${voltar}" aria-label="Voltar">‹</a><h1>${eSemana ? 'Resumo semanal' : 'Relatório'} · ${c.nome}</h1></div>
      <nav class="separadores">
        <a href="#/relatorio/${c.id}?tipo=semana" class="${eSemana ? 'ativo' : ''}">Resumo semanal</a>
        <a href="#/relatorio/${c.id}?tipo=periodo" class="${!eSemana ? 'ativo' : ''}">Relatório de período</a>
      </nav>
      ${eSemana
        ? html`<div class="nav-mes"><a class="btn btn-sec btn-icone" href="${url({ semana: somarDias(seg, -7) })}" aria-label="Semana anterior">‹</a>
            <strong>${data(seg).slice(0, 5)} – ${data(somarDias(seg, 6))}</strong>
            <a class="btn btn-sec btn-icone" href="${url({ semana: somarDias(seg, 7) })}" aria-label="Semana seguinte">›</a></div>
          ${campo('foco', 'Foco da próxima semana', { valor: t.foco, ajuda: 'Vem do plano (foco da semana seguinte); podes editar antes de gerar.' })}`
        : html`<div class="grelha-2">${campo('de', 'De', { tipo: 'date', valor: de })}${campo('ate', 'Até', { tipo: 'date', valor: ate })}</div>
          ${campo('passos', 'Próximos passos (texto para o cliente)', { tipo: 'textarea', valor: t.passos, attrs: 'placeholder="Ex.: manter 3 treinos/semana; foco na técnica do RDL; reavaliação a …"' })}
          ${podeFotos ? campo('fotos', 'Incluir comparação de fotografias (só no PDF)', { tipo: 'checkbox', valor: t.fotos }) : ''}`}
      <div class="botoes">
        <button class="btn" id="imprimir">🖨 Imprimir / Guardar PDF</button>
        <button class="btn btn-sec" id="imagem">🖼 Imagem para telemóvel</button>
        ${podeWA ? html`<a class="btn btn-sec" id="wa" target="_blank" rel="noopener" href="#">💬 Abrir WhatsApp</a>` : ''}
      </div>
      <p class="ajuda">${podeWA ? 'O WhatsApp abre com a mensagem escrita; anexas tu o PDF ou a imagem. Nada é enviado automaticamente.'
        : !c.telemovel ? 'Sem telemóvel na ficha: o botão do WhatsApp não aparece.' : 'Sem consentimento para envio por WhatsApp: regista-o nos Consentimentos para usar o botão.'}
        No iPhone: “Imprimir” → gesto de afastar os dedos na pré-visualização → Partilhar → Guardar em Ficheiros (PDF).</p>
    </div>
    <article class="relatorio" id="relatorio">${eSemana ? corpoSemana(c, r, marca, t) : corpoPeriodo(c, r, marca, t)}</article>`;

  // Atualiza o link do WhatsApp com o texto atual.
  const atualizarWA = () => {
    const a = el.querySelector('#wa');
    if (a) a.href = linkWhatsApp(c.telemovel, vc.mensagemWhatsApp(c, { ...r, foco: t.foco }, eSemana ? 'semana' : 'periodo'));
  };
  atualizarWA();
  const redesenhar = () => vistaRelatorio(el, { id, tipo, de, ate, semana: seg });
  el.querySelector('[name="foco"]')?.addEventListener('change', (e) => { t.foco = e.target.value.trim(); redesenhar(); });
  el.querySelector('[name="passos"]')?.addEventListener('change', (e) => { t.passos = e.target.value.trim(); redesenhar(); });
  el.querySelector('[name="fotos"]')?.addEventListener('change', (e) => { t.fotos = e.target.checked; redesenhar(); });
  const mudarPeriodo = () => {
    const nd = el.querySelector('[name="de"]').value, na = el.querySelector('[name="ate"]').value;
    if (!nd || !na || na < nd) return aviso('Período inválido.', 'erro');
    location.hash = url({ de: nd, ate: na });
  };
  el.querySelector('[name="de"]')?.addEventListener('change', mudarPeriodo);
  el.querySelector('[name="ate"]')?.addEventListener('change', mudarPeriodo);
  el.querySelector('#imprimir').onclick = () => window.print();
  el.querySelector('#imagem').onclick = async () => {
    const b = await (eSemana ? imagemSemana(c, { ...r, foco: t.foco }) : imagemRelatorio(c, r));
    const nome = `${eSemana ? 'resumo' : 'relatorio'}-${c.nome.split(' ')[0].toLowerCase()}-${eSemana ? seg : ate}.png`;
    const u = URL.createObjectURL(b);
    const d = dialogo('Imagem para telemóvel', html`<img class="preview-imagem" src="${u}" alt="Pré-visualização">
      <p class="ajuda">No iPhone, “Partilhar” deixa escolher o WhatsApp e anexa a imagem diretamente.</p>`, {
      textoOk: 'Partilhar / guardar',
      onSubmit() { partilharOuDescarregar(b, nome).then((x) => x !== 'cancelada' && aviso(x === 'partilhada' ? 'Imagem partilhada.' : 'Imagem guardada.')); },
      onFechar: () => setTimeout(() => URL.revokeObjectURL(u), 1000),
    });
    void d;
  };

  desenharGraficos(c, r, eSemana);
  if (!eSemana && t.fotos) desenharFotos(el, c);
  // Limpeza ao sair do ecrã.
  return () => { limparGraficos(); libertarUrls(); };
}

// ---------------------------------------------------------------- Peças comuns
function cabecalhoMarca(marca, titulo, c, periodo) {
  return html`<header class="rel-cab" style="--marca:${marca.cor_principal};--marca2:${marca.cor_secundaria}">
    <div class="rel-marca">${marca.logo ? html`<img src="${marca.logo}" alt="${marca.nome}">` : html`<strong>${marca.nome}</strong>`}</div>
    <h1>${titulo}</h1>
    <p>${c.nome.replace(/\(.*?\)/g, '').trim()} · ${periodo}</p>
  </header>`;
}
const kpi = (v, rot) => html`<div class="rel-kpi"><span>${v}</span>${rot}</div>`;
function blocoMetas(metas) {
  if (!metas.length) return '';
  return html`<section><h2>🎯 Metas</h2><ul class="rel-metas">${metas.map((m) => html`<li>
    <div class="rel-meta-cab"><strong>${m.titulo}</strong><span>${Math.round(m.p.progresso * 100)}%${m.p.atingida ? ' · atingida! 🎉' : ''}</span></div>
    <div class="rel-barra"><span style="width:${Math.round(m.p.progresso * 100)}%"></span></div>
    ${m.p.marcos.length ? html`<small>${m.p.marcos.map((mc) => `${mc.atingido ? '✓' : '○'} ${num(mc.valor)}`).join('   ')}</small>` : ''}
  </li>`)}</ul></section>`;
}
function blocoPRs(prs, titulo = '🏆 Recordes') {
  if (!prs.length) return '';
  return html`<section><h2>${titulo}</h2><ul class="rel-lista">${prs.slice(0, 6).map((p) => html`<li><strong>${p.nome}</strong>: ${num(p.valor)} kg <small>(1RM est. · ${num(p.carga)} × ${p.reps} · ${data(p.data).slice(0, 5)} · +${num(p.ganho, 0)}%)</small></li>`)}</ul></section>`;
}

// ---------------------------------------------------------------- Resumo semanal
function corpoSemana(c, r, marca, t) {
  return html`
    ${cabecalhoMarca(marca, 'Resumo da semana', c, `${data(r.de)} – ${data(r.ate)}`)}
    <div class="rel-kpis">
      ${kpi(`${r.sessoes}${r.combinado ? `/${r.combinado}` : ''}`, 'treinos')}
      ${kpi(`🔥 ${r.streak}`, 'semanas seguidas')}
      ${kpi(r.prs.length, r.prs.length === 1 ? 'recorde' : 'recordes')}
    </div>
    ${r.sessoes === 0 ? html`<p class="rel-frase">Esta semana não houve treinos registados — a próxima é uma boa oportunidade para retomar o ritmo! 💪</p>`
      : r.combinado && r.sessoes >= r.combinado ? html`<p class="rel-frase">Cumpriste tudo o que estava combinado esta semana. Excelente! 👏</p>`
      : html`<p class="rel-frase">Cada treino conta — bom trabalho esta semana! 💪</p>`}
    ${blocoPRs(r.prs, '🏆 Recordes da semana')}
    ${blocoMetas(r.metas)}
    ${r.checkin ? html`<section><h2>📝 Check-in</h2><div class="rel-checkin">${ESCALAS_CHECKIN.map((e) => html`<div><span>${r.checkin[e.id]}/5</span>${e.nome}</div>`)}</div>
      <small>Escala 1–5 (na dor, 1 = nenhuma).</small></section>` : ''}
    ${t.foco ? html`<section class="rel-foco"><h2>Foco da próxima semana</h2><p>${t.foco}</p></section>` : ''}
    <footer class="rel-rodape">${marca.nome} · ${data(hojeISO())}</footer>`;
}

// ---------------------------------------------------------------- Relatório de período
function corpoPeriodo(c, r, marca, t) {
  const comp = r.comparacao;
  const grupos = comp ? [...new Set(comp.itens.map((i) => i.grupo))] : [];
  const seta = (i) => (i.sentido === 'melhor' ? raw('<span class="rel-melhor">▲ melhorou</span>') : i.sentido === 'ponto' ? raw('<span class="rel-ponto">ponto a trabalhar</span>') : '');
  return html`
    ${cabecalhoMarca(marca, 'O teu progresso', c, `${data(r.de)} – ${data(r.ate)}`)}
    <div class="rel-kpis">
      ${kpi(r.sessoes, 'treinos')}
      ${kpi(r.assiduidade != null ? `${r.assiduidade}%` : '—', 'do combinado')}
      ${kpi(`🔥 ${r.streak}`, `semanas seguidas (melhor: ${r.melhorStreak})`)}
    </div>
    ${r.melhorias.length ? html`<section><h2>📈 O que melhorou</h2><ul class="rel-lista">${r.melhorias.map((m) => html`<li><strong>${m.texto}</strong> <small>${m.extra}</small></li>`)}</ul></section>` : ''}
    ${blocoPRs(r.prs)}
    <section class="rel-graficos"><h2>Evolução da força</h2><div id="rel-g1" class="rel-g"></div><div id="rel-g2" class="rel-g"></div>
      <small>1RM estimado (fórmula de Epley) a partir dos treinos — é uma estimativa, não um teste máximo.</small></section>
    ${comp && !comp.mesmo ? html`<section class="quebra-evitar"><h2>Comparação com a avaliação inicial</h2>
      <p class="rel-sub">${data(comp.base.data)} → ${data(comp.ult.data)}</p>
      <table class="rel-tabela"><thead><tr><th></th><th>Início</th><th>Agora</th><th></th></tr></thead><tbody>
        ${grupos.map((g) => html`<tr class="rel-grupo"><td colspan="4">${g}${g === 'Corpo' ? ' (bioimpedância: tendência)' : ''}</td></tr>
          ${comp.itens.filter((i) => i.grupo === g).map((i) => html`<tr><td>${i.nome}</td>
            <td>${i.base != null ? `${i.fmt(i.base)} ${i.unidade}` : '—'}</td><td><strong>${i.atual != null ? `${i.fmt(i.atual)} ${i.unidade}` : '—'}</strong></td>
            <td>${seta(i)}${i.sentido === 'neutro' && i.delta != null ? `${i.delta > 0 ? '+' : ''}${i.fmt(i.delta)} ${i.unidade}` : ''}</td></tr>`)}`)}
      </tbody></table></section>` : ''}
    ${blocoMetas(r.metas)}
    ${t.fotos ? html`<section class="quebra-evitar"><h2>Fotografias</h2><div id="rel-fotos" class="rel-fotos"></div></section>` : ''}
    <section class="rel-foco"><h2>Próximos passos</h2>
      ${t.passos ? html`<p class="pre">${t.passos}</p>` : ''}
      ${r.pontos.length ? html`<p>Pontos a trabalhar: ${r.pontos.join(', ')}.</p>` : ''}
      ${r.proxReav ? html`<p>Próxima avaliação prevista: <strong>${data(r.proxReav)}</strong>.</p>` : ''}
    </section>
    <footer class="rel-rodape">${marca.nome} · ${data(hojeISO())}</footer>`;
}

function desenharGraficos(c, r, eSemana) {
  if (eSemana || !window.Chart) return;
  const top = e1rmPorExercicio(c.id).map((x) => ({ ...x, pontos: x.pontos.filter((p) => p.fonte === 'sessão') })).filter((x) => x.pontos.length >= 2).slice(0, 2);
  top.forEach((ex, i) => {
    const alvo = document.getElementById(`rel-g${i + 1}`);
    if (!alvo) return;
    alvo.innerHTML = `<p class="rel-g-tit">${esc(ex.nome)}</p><div style="height:180px"><canvas></canvas></div>`;
    linha(alvo.querySelector('canvas'), { series: [{ nome: '1RM est.', pontos: ex.pontos.map((p) => ({ data: p.data, valor: p.valor })) }], unidade: 'kg', tema: 'claro' });
  });
  if (!top.length) document.querySelector('.rel-graficos')?.remove();
}

async function desenharFotos(el, c) {
  const tl = linhaTemporalFotos(c.id).filter((x) => x.frente);
  const alvo = el.querySelector('#rel-fotos');
  if (!alvo || !tl.length) return;
  const [a, b] = [tl[0], tl[tl.length - 1]];
  const imgs = await Promise.all([a, b].map((x) => urlFoto(x.frente)));
  alvo.innerHTML = [a, b].map((x, i) => `<figure><img src="${imgs[i]}" alt="${ANGULOS.frente} ${esc(data(x.data))}"><figcaption>${esc(data(x.data))}</figcaption></figure>`).join('');
}
