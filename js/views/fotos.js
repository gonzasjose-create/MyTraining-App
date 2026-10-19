// Fotografias de progresso: carregar (frente/lado/costas), linha temporal e comparação lado a lado.
// Só com consentimento de fotografias. As imagens ficam apenas neste dispositivo.
import * as rf from '../repo-fotos.js';
import { temConsentimento } from '../repo.js';
import { html, data, hojeISO, aviso, esc } from '../util.js';
import { confirmar } from './ui.js';

export function seccaoFotosCliente(sec, c) {
  rf.libertarUrls();
  const consent = temConsentimento(c.id, 'fotografias');
  const tl = rf.linhaTemporalFotos(c.id);
  const recarregar = () => seccaoFotosCliente(sec, c);

  if (!consent) {
    sec.innerHTML = html`<div class="caixa caixa-alerta">Sem consentimento de <strong>fotografias</strong> para este cliente.
      Regista-o em <a href="#/cliente/${c.id}?tab=consentimentos">Consentimentos</a> para poder guardar fotos.</div>
      ${tl.length ? html`<div class="cartao"><p>Existem ${tl.length} data(s) com fotografias guardadas de antes (ex.: consentimento revogado).
        O tratamento deve parar: apaga-as.</p><button class="btn btn-perigo" id="apagar-todas">Apagar todas as fotografias deste cliente</button></div>` : ''}`;
    sec.querySelector('#apagar-todas')?.addEventListener('click', async () => {
      if (!(await confirmar('Apagar TODAS as fotografias deste cliente? Não pode ser desfeito.', { textoOk: 'Apagar' }))) return;
      await rf.apagarFotosCliente(c.id);
      aviso('Fotografias apagadas.');
      recarregar();
    });
    return;
  }

  sec.innerHTML = html`
    <form class="cartao form-fotos" id="f-fotos">
      <h3>Novas fotografias</h3>
      <p class="ajuda">Mesma luz, distância e posição em todas as datas. As imagens são reduzidas e os metadados (incl. localização GPS) são removidos; ficam só neste dispositivo.</p>
      <label class="campo"><span>Data</span><input type="date" name="data" value="${hojeISO()}"></label>
      <div class="fotos-entrada">${Object.entries(rf.ANGULOS).map(([k, n]) => html`<label class="foto-alvo" data-angulo="${k}">
        <input type="file" accept="image/*" capture="environment" name="f_${k}" hidden>
        <span class="foto-prev">📷</span><span>${n}</span></label>`)}</div>
      <button class="btn" type="submit">Guardar fotografias</button>
    </form>
    <div class="cartao" id="comparar"></div>
    <div class="cartao"><h3>Linha temporal</h3>
      ${tl.length ? html`<div class="fotos-tl">${tl.map((x) => html`<div class="tl-linha"><strong>${data(x.data)}</strong>
        <div class="tl-fotos">${Object.keys(rf.ANGULOS).map((k) => (x[k]
          ? html`<figure><img data-chave="${x[k].chave}" alt="${rf.ANGULOS[k]} ${data(x.data)}"><figcaption>${rf.ANGULOS[k]}
              <button type="button" class="btn btn-sec btn-icone" data-apagar="${x[k].id}" aria-label="Apagar">✕</button></figcaption></figure>`
          : html`<figure class="vazia"><span>—</span><figcaption>${rf.ANGULOS[k]}</figcaption></figure>`))}</div></div>`)}</div>`
        : html`<p class="ajuda">Ainda sem fotografias.</p>`}
    </div>`;

  // Pré-visualização ao escolher cada imagem.
  sec.querySelectorAll('.foto-alvo input').forEach((inp) => (inp.onchange = () => {
    const f = inp.files[0];
    const prev = inp.parentElement.querySelector('.foto-prev');
    prev.innerHTML = f ? `<img src="${URL.createObjectURL(f)}" alt="">` : '📷';
  }));
  sec.querySelector('#f-fotos').onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const dt = form.data.value;
    if (!dt || dt > hojeISO()) return aviso('Data inválida (não pode ser no futuro).', 'erro');
    const escolhidas = Object.keys(rf.ANGULOS).map((k) => [k, form[`f_${k}`].files[0]]).filter(([, f]) => f);
    if (!escolhidas.length) return aviso('Escolhe pelo menos uma fotografia.', 'erro');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      for (const [k, f] of escolhidas) await rf.adicionarFoto(c.id, dt, k, f);
      aviso(`${escolhidas.length} fotografia(s) guardada(s).`);
      recarregar();
    } catch (e) {
      aviso(e.message, 'erro');
      btn.disabled = false;
      btn.textContent = 'Guardar fotografias';
    }
  };
  sec.querySelectorAll('[data-apagar]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('Apagar esta fotografia?', { textoOk: 'Apagar' }))) return;
    await rf.apagarFoto(+b.dataset.apagar);
    recarregar();
  }));
  carregarMiniaturas(sec);
  blocoComparacao(sec.querySelector('#comparar'), c.id);
}

// As imagens carregam do IndexedDB depois de a página estar desenhada.
async function carregarMiniaturas(raiz) {
  for (const img of raiz.querySelectorAll('img[data-chave]')) {
    const u = await rf.urlFoto({ chave: img.dataset.chave });
    if (u) img.src = u;
  }
}

// Comparação lado a lado entre quaisquer duas datas (também usada no modo cliente).
export function blocoComparacao(alvo, clienteId, { titulo = 'Comparar' } = {}) {
  const tl = rf.linhaTemporalFotos(clienteId);
  if (tl.length < 2) {
    alvo.innerHTML = html`<h3>${titulo}</h3><p class="ajuda">A comparação aparece com fotografias de pelo menos duas datas.</p>`;
    return;
  }
  const estado = { a: tl[0].data, b: tl[tl.length - 1].data, angulo: 'frente' };
  const desenhar = async () => {
    const fa = tl.find((x) => x.data === estado.a)?.[estado.angulo];
    const fb = tl.find((x) => x.data === estado.b)?.[estado.angulo];
    const opcoes = (sel) => tl.map((x) => `<option value="${x.data}" ${x.data === sel ? 'selected' : ''}>${esc(data(x.data))}</option>`).join('');
    alvo.innerHTML = html`<h3>${titulo}</h3>
      <div class="comparar-controlos">
        <select data-q="a" aria-label="Primeira data"></select>
        <div class="segmentado" role="group" aria-label="Ângulo">${Object.entries(rf.ANGULOS).map(([k, n]) => html`<button type="button" data-ang="${k}" class="${k === estado.angulo ? 'ativo' : ''}">${n}</button>`)}</div>
        <select data-q="b" aria-label="Segunda data"></select>
      </div>
      <div class="comparar-fotos">
        <figure>${fa ? html`<img id="ca" alt="${data(estado.a)}">` : html`<div class="vazia">Sem foto</div>`}<figcaption>${data(estado.a)}</figcaption></figure>
        <figure>${fb ? html`<img id="cb" alt="${data(estado.b)}">` : html`<div class="vazia">Sem foto</div>`}<figcaption>${data(estado.b)}</figcaption></figure>
      </div>`;
    alvo.querySelector('[data-q="a"]').innerHTML = opcoes(estado.a);
    alvo.querySelector('[data-q="b"]').innerHTML = opcoes(estado.b);
    if (fa) alvo.querySelector('#ca').src = await rf.urlFoto(fa);
    if (fb) alvo.querySelector('#cb').src = await rf.urlFoto(fb);
    alvo.querySelectorAll('select').forEach((s) => (s.onchange = () => { estado[s.dataset.q] = s.value; desenhar(); }));
    alvo.querySelectorAll('[data-ang]').forEach((b) => (b.onclick = () => { estado.angulo = b.dataset.ang; desenhar(); }));
  };
  desenhar();
}
