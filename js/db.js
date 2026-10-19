// Camada de dados: SQLite (sql.js/WebAssembly) em memória, persistido no IndexedDB
// do próprio dispositivo. Nada sai do dispositivo.
import { MIGRACOES } from './schema.js';

const IDB_NOME = 'treino-app';
const IDB_STORE = 'ficheiros';
const IDB_CHAVE = 'base.sqlite';

let SQL = null;
let db = null;
let gravacaoPendente = null;

// ---------- IndexedDB (ficheiro .sqlite inteiro + fotografias em blobs à parte) ----------
const IDB_FOTOS = 'fotos';
function abrirIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NOME, 2);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
      if (!idb.objectStoreNames.contains(IDB_FOTOS)) idb.createObjectStore(IDB_FOTOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Fotografias: blobs JPEG guardados no IndexedDB (a base SQLite guarda só os metadados).
async function idbOperacao(modo, fn) {
  const idb = await abrirIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_FOTOS, modo);
    const r = fn(tx.objectStore(IDB_FOTOS));
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const fotoGravar = (chave, blob) => idbOperacao('readwrite', (s) => s.put(blob, chave));
export const fotoLer = (chave) => idbOperacao('readonly', (s) => s.get(chave));
export const fotoApagar = (chave) => idbOperacao('readwrite', (s) => s.delete(chave));
export const fotoChaves = () => idbOperacao('readonly', (s) => s.getAllKeys());
export const fotoLimparTudo = () => idbOperacao('readwrite', (s) => s.clear());
export const versaoEsquema = () => escalar('PRAGMA user_version');
async function idbLer(chave) {
  const idb = await abrirIDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(chave);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbGravar(chave, valor) {
  const idb = await abrirIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(valor, chave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Inicialização ----------
export async function iniciarDB() {
  // eslint-disable-next-line no-undef
  SQL = await initSqlJs({ locateFile: (f) => `lib/${f}` });
  const guardado = await idbLer(IDB_CHAVE);
  db = guardado ? new SQL.Database(new Uint8Array(guardado)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  migrar();
  // Pede ao browser para não apagar os dados por falta de espaço.
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch { /* ignorar */ }
  }
}

function migrar() {
  const versao = escalar('PRAGMA user_version') || 0;
  for (let v = versao; v < MIGRACOES.length; v++) {
    db.run('BEGIN');
    try {
      db.run(MIGRACOES[v]);
      db.run(`PRAGMA user_version = ${v + 1}`);
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw new Error(`Falha na migração ${v + 1}: ${e.message}`);
    }
  }
  if (versao < MIGRACOES.length) agendarGravacao(0);
}

// ---------- Persistência ----------
// Grava o ficheiro completo após cada alteração (a base é pequena: poucos MB).
function agendarGravacao(atraso = 300) {
  clearTimeout(gravacaoPendente);
  gravacaoPendente = setTimeout(gravarAgora, atraso);
}
export async function gravarAgora() {
  clearTimeout(gravacaoPendente);
  // Nunca exportar a meio de uma transação: o export do sql.js fecha a base e desfaria a transação.
  if (nivelTransacao > 0) return agendarGravacao(0);
  await idbGravar(IDB_CHAVE, exportarSeguro());
}

// db.export() fecha e reabre a base: os PRAGMA voltam ao valor por defeito.
// Por isso as chaves estrangeiras (ON DELETE CASCADE) têm de ser religadas logo a seguir.
function exportarSeguro() {
  const bytes = db.export();
  db.run('PRAGMA foreign_keys = ON;');
  return bytes;
}
// Garante gravação se a app for fechada, bloqueada ou mudar de app logo após uma alteração.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && db) gravarAgora();
});
window.addEventListener('pagehide', () => { if (db) gravarAgora(); });

// ---------- Consultas ----------
function normalizar(params) {
  // sql.js não aceita undefined; converte para null e booleanos para 0/1.
  if (Array.isArray(params)) return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? +p : p));
  return params;
}

export function todos(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(normalizar(params));
  const linhas = [];
  while (st.step()) linhas.push(st.getAsObject());
  st.free();
  return linhas;
}
export function um(sql, params = []) {
  return todos(sql, params)[0] || null;
}
export function escalar(sql, params = []) {
  const linha = um(sql, params);
  return linha ? Object.values(linha)[0] : null;
}
export function executar(sql, params = []) {
  db.run(sql, normalizar(params));
  agendarGravacao();
  return { id: escalar('SELECT last_insert_rowid()'), alteradas: db.getRowsModified() };
}
// Executa várias operações de forma atómica. Pode ser aninhada: só a mais exterior faz COMMIT/ROLLBACK.
let nivelTransacao = 0;
export function transacao(fn) {
  if (nivelTransacao > 0) return fn();
  db.run('BEGIN');
  nivelTransacao++;
  try {
    const r = fn();
    db.run('COMMIT');
    agendarGravacao();
    return r;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  } finally {
    nivelTransacao--;
  }
}

// Insere/atualiza a partir de um objeto (só colunas indicadas).
export function inserir(tabela, obj) {
  const cols = Object.keys(obj);
  return executar(
    `INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map((c) => obj[c])
  ).id;
}
export function atualizar(tabela, id, obj) {
  const cols = Object.keys(obj);
  executar(`UPDATE ${tabela} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
    ...cols.map((c) => obj[c]),
    id,
  ]);
}

// ---------- Definições (chave/valor em JSON) ----------
export function lerDefinicao(chave, omissao = null) {
  const v = escalar('SELECT valor FROM definicoes WHERE chave = ?', [chave]);
  return v == null ? omissao : JSON.parse(v);
}
export function gravarDefinicao(chave, valor) {
  executar('INSERT INTO definicoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', [
    chave,
    JSON.stringify(valor),
  ]);
}

// ---------- Backup simples (a versão encriptada chega na Fase 7) ----------
export function exportarBytes() {
  return exportarSeguro();
}
export async function importarBytes(bytes) {
  const nova = new SQL.Database(new Uint8Array(bytes));
  // Validação mínima: tem de ser uma base desta app.
  const st = nova.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clientes'");
  const valida = st.step();
  st.free();
  if (!valida) {
    nova.close();
    throw new Error('O ficheiro não é um backup válido desta aplicação.');
  }
  db.close();
  db = nova;
  db.run('PRAGMA foreign_keys = ON;');
  migrar();
  await gravarAgora();
}
export async function apagarTudo() {
  await fotoLimparTudo();
  db.close();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  migrar();
  await gravarAgora();
}
