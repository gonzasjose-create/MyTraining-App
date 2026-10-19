// Service worker: guarda os ficheiros da app para funcionar offline.
// Os DADOS não passam por aqui (estão no IndexedDB). Ao publicar uma nova versão, incrementa VERSAO
// (e VERSAO_APP em js/versao.js). Lista gerada a partir da pasta js/ — inclui todos os módulos.
const VERSAO = 'treino-v7';
const FICHEIROS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'lib/sql-wasm.js', 'lib/sql-wasm.wasm', 'lib/chart.umd.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/analise.js',
  'js/app.js',
  'js/backup.js',
  'js/bloqueio.js',
  'js/calc.js',
  'js/catalogos.js',
  'js/db.js',
  'js/exportar-cliente.js',
  'js/graficos.js',
  'js/ics.js',
  'js/imagem-resumo.js',
  'js/pin.js',
  'js/progressao.js',
  'js/repo.js',
  'js/repo-agenda.js',
  'js/repo-fotos.js',
  'js/repo-motivacao.js',
  'js/repo-pacotes.js',
  'js/repo-planos.js',
  'js/repo-sessoes.js',
  'js/ritmos.js',
  'js/schema.js',
  'js/seed.js',
  'js/util.js',
  'js/versao.js',
  'js/views/agenda.js',
  'js/views/analise.js',
  'js/views/avaliacao.js',
  'js/views/avaliacao-form.js',
  'js/views/cliente.js',
  'js/views/cliente-form.js',
  'js/views/clientes.js',
  'js/views/dados.js',
  'js/views/definicoes.js',
  'js/views/escolher-exercicio.js',
  'js/views/fotos.js',
  'js/views/metas.js',
  'js/views/modo-cliente.js',
  'js/views/pacotes.js',
  'js/views/painel.js',
  'js/views/planos.js',
  'js/views/relatorio.js',
  'js/views/resumos.js',
  'js/views/sessao.js',
  'js/views/sessoes.js',
  'js/views/treino.js',
  'js/views/ui.js',
  'js/views/zonas.js',
  'js/visao-cliente.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(FICHEIROS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache primeiro (rápido e offline no ginásio); a versão nova entra quando VERSAO muda.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});