// "Resumos da semana": todos os clientes ativos numa lista, para preparar e enviar os resumos semanais.
import { listarClientes, temConsentimento } from '../repo.js';
import { resumoSemana } from '../visao-cliente.js';
import { inicioSemana, somarDias } from '../analise.js';
import { html, data, hojeISO } from '../util.js';
import { cabecalho, etiqueta, vazio } from './ui.js';

export function vistaResumos(el, { semana }) {
  const seg = inicioSemana(semana || hojeISO());
  const linhas = listarClientes().map((c) => ({ c, r: resumoSemana(c, seg) }));
  el.innerHTML = html`
    ${cabecalho('Resumos da semana', { voltar: '/' })}
    <div class="nav-mes">
      <a class="btn btn-sec btn-icone" href="#/resumos?semana=${somarDias(seg, -7)}" aria-label="Semana anterior">‹</a>
      <strong>${data(seg).slice(0, 5)} – ${data(somarDias(seg, 6))}</strong>
      <a class="btn btn-sec btn-icone" href="#/resumos?semana=${somarDias(seg, 7)}" aria-label="Semana seguinte">›</a>
    </div>
    <p class="ajuda">Abre cada resumo para gerar o PDF ou a imagem e abrir o WhatsApp com a mensagem escrita. Nada é enviado automaticamente.</p>
    ${linhas.length ? html`<ul class="lista">${linhas.map(({ c, r }) => html`<li><a class="item" href="#/relatorio/${c.id}?tipo=semana&semana=${seg}">
      <div class="item-principal"><strong>${c.nome}</strong>
        <div class="item-tags">
          ${etiqueta(`${r.sessoes}${r.combinado ? `/${r.combinado}` : ''} treinos`, r.combinado && r.sessoes >= r.combinado ? 'tag-ok' : '')}
          ${r.prs.length ? etiqueta(`🏆 ${r.prs.length}`, 'tag-pr') : ''}
          ${r.streak ? etiqueta(`🔥 ${r.streak}`) : ''}
          ${r.checkin ? etiqueta('check-in ✓', 'tag-ok') : etiqueta('sem check-in')}
          ${temConsentimento(c.id, 'partilha_whatsapp') && c.telemovel ? '' : etiqueta('sem WhatsApp', 'tag-aviso')}
        </div></div><div class="item-sec">›</div></a></li>`)}</ul>` : vazio('Sem clientes ativos.')}`;
}
