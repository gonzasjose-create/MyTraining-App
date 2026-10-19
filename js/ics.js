// Exportação de lembretes para calendário (.ics, iCalendar). Gerado no dispositivo; o ficheiro
// é aberto pelo Calendário do iPhone/portátil. Horas "flutuantes" (hora local, sem fuso).

const p2 = (n) => String(n).padStart(2, '0');
const dtLocal = (iso) => iso.replace(/[-:]/g, '').slice(0, 15); // aaaammddThhmmss
const dtData = (iso) => iso.replace(/-/g, '').slice(0, 8);
const agoraUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`; };
const escapar = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Dobra linhas com mais de 75 caracteres (regra do formato).
function dobrar(linha) {
  const partes = [];
  let resto = linha;
  while (resto.length > 74) { partes.push(resto.slice(0, 74)); resto = ' ' + resto.slice(74); }
  partes.push(resto);
  return partes.join('\r\n');
}

// eventos: [{ uid, inicio (ISO data/hora) | dia (ISO data), fim?, titulo, descricao?, alarmeMin? }]
export function gerarICS(eventos, nomeCalendario = 'Treino') {
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Treino//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapar(nomeCalendario)}`];
  const stamp = agoraUTC();
  for (const e of eventos) {
    l.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.dia) l.push(`DTSTART;VALUE=DATE:${dtData(e.dia)}`);
    else { l.push(`DTSTART:${dtLocal(e.inicio)}`); if (e.fim) l.push(`DTEND:${dtLocal(e.fim)}`); }
    l.push(`SUMMARY:${escapar(e.titulo)}`);
    if (e.descricao) l.push(`DESCRIPTION:${escapar(e.descricao)}`);
    if (e.alarmeMin != null) l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(e.titulo)}`, `TRIGGER:-PT${e.alarmeMin}M`, 'END:VALARM');
    l.push('END:VEVENT');
  }
  l.push('END:VCALENDAR');
  return l.map(dobrar).join('\r\n') + '\r\n';
}

// Nome a usar no calendário: só iniciais por defeito (o calendário pode sincronizar com a cloud).
export const nomeCalendario = (nome, iniciais) =>
  iniciais ? nome.replace(/\(.*?\)/g, '').trim().split(/\s+/).map((p) => p[0].toUpperCase() + '.').join(' ') : nome;
