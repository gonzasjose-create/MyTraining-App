// Fotografias de progresso (frente, lado, costas). SÓ com consentimento de fotografias.
// A imagem é reduzida e recodificada no dispositivo: isto também remove os metadados EXIF
// (incluindo a localização GPS). Nada sai do dispositivo.
import { todos, um, inserir, executar, gravarAgora, fotoGravar, fotoLer, fotoApagar, fotoChaves } from './db.js';
import { temConsentimento } from './repo.js';

export const ANGULOS = { frente: 'Frente', lado: 'Lado', costas: 'Costas' };
const LADO_MAX = 1280;

function reduzir(ficheiro) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(ficheiro);
    img.onload = () => {
      const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve({ blob: b, largura: cv.width, altura: cv.height }) : reject(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ficheiro de imagem inválido.')); };
    img.src = url;
  });
}

export async function adicionarFoto(clienteId, data, angulo, ficheiro, notas = null) {
  if (!temConsentimento(clienteId, 'fotografias')) throw new Error('Sem consentimento de fotografias para este cliente.');
  if (!ficheiro?.type?.startsWith('image/')) throw new Error('Escolhe uma imagem.');
  if (ficheiro.size > 25e6) throw new Error('Imagem demasiado grande (máx. 25 MB).');
  const { blob, largura, altura } = await reduzir(ficheiro);
  const chave = `foto-${clienteId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fotoGravar(chave, blob);
  // Uma foto por cliente, data e ângulo: substitui a anterior.
  const antiga = um('SELECT * FROM fotos WHERE cliente_id = ? AND data = ? AND angulo = ?', [clienteId, data, angulo]);
  if (antiga) await apagarFoto(antiga.id);
  inserir('fotos', { cliente_id: clienteId, data, angulo, chave, largura, altura, bytes: blob.size, notas });
  await gravarAgora();
}

export const listarFotos = (clienteId) => todos('SELECT * FROM fotos WHERE cliente_id = ? ORDER BY data, angulo', [clienteId]);

// Agrupadas por data: [{ data, frente, lado, costas }]
export function linhaTemporalFotos(clienteId) {
  const mapa = new Map();
  for (const f of listarFotos(clienteId)) {
    if (!mapa.has(f.data)) mapa.set(f.data, { data: f.data });
    mapa.get(f.data)[f.angulo] = f;
  }
  return [...mapa.values()];
}

export async function apagarFoto(id) {
  const f = um('SELECT * FROM fotos WHERE id = ?', [id]);
  if (!f) return;
  await fotoApagar(f.chave);
  executar('DELETE FROM fotos WHERE id = ?', [id]);
}

export async function apagarFotosCliente(clienteId) {
  for (const f of listarFotos(clienteId)) await apagarFoto(f.id);
}

// URLs temporários para mostrar as imagens (libertados ao sair do ecrã).
const urls = new Map();
export async function urlFoto(f) {
  if (urls.has(f.chave)) return urls.get(f.chave);
  const blob = await fotoLer(f.chave);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(f.chave, u);
  return u;
}
export function libertarUrls() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}

// Remove imagens que já não têm registo (ex.: cliente apagado) — corre no arranque.
export async function limparFotosOrfas() {
  try {
    const validas = new Set(todos('SELECT chave FROM fotos').map((r) => r.chave));
    for (const k of await fotoChaves()) if (!validas.has(k)) await fotoApagar(k);
  } catch (e) {
    console.warn('Limpeza de fotos:', e);
  }
}
