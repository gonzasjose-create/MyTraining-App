// Backup completo ENCRIPTADO (base de dados + fotografias) num único ficheiro .treino.
// Encriptação no próprio dispositivo: AES-256-GCM com chave derivada da palavra-passe por
// PBKDF2-SHA-256 (310 000 iterações) e sal aleatório. Sem a palavra-passe o ficheiro não se lê —
// e se a palavra-passe se perder, o backup NÃO pode ser recuperado.
//
// Formato: "TREINO-BACKUP-1" | 1 byte (1 = comprimido) | sal (16) | iv (12) | dados cifrados
// Dados (antes de cifrar): u32 tamanho do cabeçalho JSON | cabeçalho JSON | sqlite | fotos…
import { exportarBytes, importarBytes, fotoChaves, fotoLer, fotoGravar, fotoLimparTudo, versaoEsquema, gravarDefinicao } from './db.js';

const MAGIC = 'TREINO-BACKUP-1';
const ITERACOES = 310000;
const te = new TextEncoder(), td = new TextDecoder();

function juntar(partes) {
  const total = partes.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };

async function processar(bytes, tipo) {
  const Stream = tipo === 'gzip' ? window.CompressionStream : window.DecompressionStream;
  const s = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function derivarChave(palavraPasse, sal) {
  if (!crypto?.subtle) throw new Error('Encriptação indisponível neste contexto (precisa de https ou localhost).');
  const base = await crypto.subtle.importKey('raw', te.encode(palavraPasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------------------------------------------------------------- Criar
export async function criarBackup(palavraPasse) {
  const sqlite = exportarBytes();
  const fotos = [];
  for (const chave of await fotoChaves()) {
    const b = await fotoLer(chave);
    if (b) fotos.push({ chave, tipo: b.type || 'image/jpeg', dados: new Uint8Array(await b.arrayBuffer()) });
  }
  const cab = te.encode(JSON.stringify({
    app: 'treino', esquema: versaoEsquema(), criado: new Date().toISOString(),
    sqlite: sqlite.length, fotos: fotos.map((f) => ({ chave: f.chave, tipo: f.tipo, tam: f.dados.length })),
  }));
  let corpo = juntar([u32(cab.length), cab, sqlite, ...fotos.map((f) => f.dados)]);
  const comprimido = !!window.CompressionStream;
  if (comprimido) corpo = await processar(corpo, 'gzip');
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derivarChave(palavraPasse, sal), corpo));
  return { bytes: juntar([te.encode(MAGIC), new Uint8Array([comprimido ? 1 : 0]), sal, iv, cifra]), nFotos: fotos.length };
}

export const ehBackupEncriptado = (bytes) => td.decode(bytes.slice(0, MAGIC.length)) === MAGIC;

// ---------------------------------------------------------------- Ler e restaurar
export async function lerBackup(bytes, palavraPasse) {
  bytes = new Uint8Array(bytes);
  if (!ehBackupEncriptado(bytes)) throw new Error('Este ficheiro não é um backup encriptado desta aplicação.');
  let o = MAGIC.length;
  const comprimido = bytes[o] === 1; o += 1;
  const sal = bytes.slice(o, o + 16); o += 16;
  const iv = bytes.slice(o, o + 12); o += 12;
  let corpo;
  try {
    corpo = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await derivarChave(palavraPasse, sal), bytes.slice(o)));
  } catch (e) {
    if (e.message?.includes('indisponível')) throw e;
    throw new Error('Palavra-passe errada ou ficheiro danificado.');
  }
  if (comprimido) {
    if (!window.DecompressionStream) throw new Error('Este browser não consegue descomprimir o backup — atualiza o iOS/browser.');
    corpo = await processar(corpo, 'gunzip');
  }
  const tamCab = new DataView(corpo.buffer, corpo.byteOffset).getUint32(0);
  const cab = JSON.parse(td.decode(corpo.slice(4, 4 + tamCab)));
  if (cab.app !== 'treino') throw new Error('O ficheiro não é um backup desta aplicação.');
  let p = 4 + tamCab;
  const sqlite = corpo.slice(p, p + cab.sqlite); p += cab.sqlite;
  const fotos = cab.fotos.map((f) => { const dados = corpo.slice(p, p + f.tam); p += f.tam; return { ...f, dados }; });
  return { cab, sqlite, fotos };
}

// Substitui TODOS os dados deste dispositivo pelos do backup (base de dados e fotografias).
export async function restaurarBackup({ sqlite, fotos }) {
  await importarBytes(sqlite); // valida e migra para a versão atual do esquema
  await fotoLimparTudo();
  for (const f of fotos) await fotoGravar(f.chave, new Blob([f.dados], { type: f.tipo }));
}

export function registarBackupFeito() {
  gravarDefinicao('ultimo_backup', new Date().toISOString());
}
