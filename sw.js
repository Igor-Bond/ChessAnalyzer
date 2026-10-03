/**
 * Разбор партий — сервис-воркер.
 *
 * Стратегии:
 *   - код и стили (js, css, html) → сначала сеть, чтобы правки доезжали сразу
 *   - движок, фигуры, значки       → сначала кэш: они тяжёлые (движок — почти
 *     два мегабайта) и меняются только вместе с версией
 *
 * У «сначала сеть» есть срок ожидания: разбирают партию часто прямо в
 * турнирном зале, где связь едва живая, и ждать таймаута браузера при
 * рабочей копии в кэше незачем.
 *
 * ВАЖНО: при изменении состава файлов поднимать APP_VERSION, иначе у
 * установленных приложений останется старый кэш.
 */

const APP_VERSION = 'v2';
const CACHE_NAME = `chess-${APP_VERSION}`;

const СРОК_СЕТИ = 3000;

const ФАЙЛЫ = [
    './',
    'index.html',
    'manifest.json',
    'css/style.css',

    'assets/icon-192.png',
    'assets/icon-512.png',
    'assets/icon-maskable-192.png',
    'assets/icon-maskable-512.png',

    'assets/pieces/bB.svg',
    'assets/pieces/bK.svg',
    'assets/pieces/bN.svg',
    'assets/pieces/bP.svg',
    'assets/pieces/bQ.svg',
    'assets/pieces/bR.svg',
    'assets/pieces/wB.svg',
    'assets/pieces/wK.svg',
    'assets/pieces/wN.svg',
    'assets/pieces/wP.svg',
    'assets/pieces/wQ.svg',
    'assets/pieces/wR.svg',

    'js/main.js',
    'js/app.js',
    'js/version.js',

    'js/core/actions.js',
    'js/core/ai.js',
    'js/core/analyze.js',
    'js/core/board.js',
    'js/core/chess.js',
    'js/core/engine.js',
    'js/core/explain.js',
    'js/core/game.js',
    'js/core/icons.js',
    'js/core/notation.js',
    'js/core/photo.js',
    'js/core/recognize.js',
    'js/core/report.js',
    'js/core/review.js',
    'js/core/scoresheet.js',
    'js/core/store.js',
    'js/core/trackerkey.js',
    'js/core/ui.js',

    'js/modules/entry.js',
    'js/modules/home.js',
    'js/modules/photo.js',
    'js/modules/review.js',
    'js/modules/settings.js',

    'vendor/chess.js/chess.js',
    'vendor/stockfish/stockfish-19-lite-single.js',
    'vendor/stockfish/stockfish-19-lite-single.wasm'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // Каждый файл отдельно: cache.addAll валит установку целиком из-за одного адреса
            .then((кэш) => Promise.all(ФАЙЛЫ.map((адрес) => кэш.add(адрес).catch(
                (e) => console.warn('[SW] Не удалось положить в кэш', адрес, e)
            ))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((имена) => Promise.all(имена
                .filter((имя) => имя.startsWith('chess-') && имя !== CACHE_NAME)
                .map((имя) => caches.delete(имя))))
            .then(() => self.clients.claim())
    );
});

/** Сеть со сроком: не дождались — берём из кэша. */
function изСети(запрос) {
    return new Promise((готово, мимо) => {
        const часы = setTimeout(() => мимо(new Error('Сеть не ответила')), СРОК_СЕТИ);

        fetch(запрос).then((ответ) => {
            clearTimeout(часы);
            готово(ответ);
        }).catch((e) => {
            clearTimeout(часы);
            мимо(e);
        });
    });
}

self.addEventListener('fetch', (event) => {
    const запрос = event.request;

    if (запрос.method !== 'GET') return;

    const адрес = new URL(запрос.url);
    if (адрес.origin !== location.origin) return;

    const тяжёлое = /\.(png|svg|ico|wasm)$/.test(адрес.pathname) || адрес.pathname.includes('/vendor/');

    if (тяжёлое) {
        event.respondWith(
            caches.match(запрос, { ignoreSearch: true }).then((найдено) => найдено || fetch(запрос).then((ответ) => {
                if (ответ.ok) {
                    const копия = ответ.clone();
                    caches.open(CACHE_NAME).then((кэш) => кэш.put(запрос, копия));
                }
                return ответ;
            }))
        );
        return;
    }

    event.respondWith(
        изСети(запрос)
            .then((ответ) => {
                if (ответ.ok) {
                    const копия = ответ.clone();
                    caches.open(CACHE_NAME).then((кэш) => кэш.put(запрос, копия));
                }
                return ответ;
            })
            .catch(() => caches.match(запрос)
                .then((найдено) => найдено
                    || (запрос.mode === 'navigate' ? caches.match('index.html') : undefined)
                    || new Response('Нет сети', { status: 503, statusText: 'Нет сети' })))
    );
});
