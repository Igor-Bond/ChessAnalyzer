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

const APP_VERSION = 'v14';
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
    'js/core/autosync.js',
    'js/core/board.js',
    'js/core/chess.js',
    'js/core/cloud.js',
    'js/core/engine.js',
    'js/core/explain.js',
    'js/core/game.js',
    'js/core/icons.js',
    'js/core/install.js',
    'js/core/notation.js',
    'js/core/photo.js',
    'js/core/recognize.js',
    'js/core/report.js',
    'js/core/review.js',
    'js/core/scoresheet.js',
    'js/core/store.js',
    'js/core/sync.js',
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

/**
 * Свежая копия файла — мимо HTTP-кэша браузера.
 *
 * GitHub Pages отдаёт файлы с max-age=600, и обычный запрос десять минут
 * после выкладки получает прежнюю копию. Положенная в наш кэш, она
 * осталась бы там до следующей версии — для движка и фигур, которые
 * берутся сначала из кэша, это значит навсегда.
 */
function свежий(адрес) {
    return new Request(адрес, { cache: 'reload' });
}

/**
 * Докачать в кэш всё, чего в нём нет.
 *
 * Кэш у адреса igor-bond.github.io один на все приложения владельца, и
 * сосед может его стереть: трекер тренировок, обновляясь, удаляет все кэши,
 * кроме своего. Приложение поэтому при каждом запуске просит воркер
 * проверить кэш (сообщение «проверить-кэш» из main.js), и недостающее
 * докачивается, пока есть сеть. Без этого шахматы после обновления трекера
 * не открылись бы офлайн — а узнаётся это в турнирном зале без связи.
 *
 * Каждый файл отдельно: cache.addAll валит всё из-за одного адреса.
 */
async function докачать() {
    const кэш = await caches.open(CACHE_NAME);

    await Promise.all(ФАЙЛЫ.map(async (адрес) => {
        if (await кэш.match(адрес)) return;

        try {
            await кэш.add(свежий(адрес));
        } catch (e) {
            console.warn('[SW] Не удалось положить в кэш', адрес, e);
        }
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(докачать().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            // Только свои прежние версии: чужие кэши на общем адресе не трогаем
            .then((имена) => Promise.all(имена
                .filter((имя) => имя.startsWith('chess-') && имя !== CACHE_NAME)
                .map((имя) => caches.delete(имя))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'проверить-кэш') event.waitUntil(докачать());
});

/**
 * Сеть со сроком: не дождались — берём из кэша.
 *
 * Код запрашивается в обход HTTP-кэша с проверкой свежести (no-cache):
 * иначе десять минут после выкладки половина модулей приходила бы новой, а
 * половина — прежней, и приложение собиралось бы из двух версий. Переходы
 * по страницам идут как есть: запрос перехода нельзя пересоздать с иными
 * параметрами.
 */
function изСети(запрос) {
    const сеть = запрос.mode === 'navigate'
        ? fetch(запрос)
        : fetch(запрос.url, { cache: 'no-cache', credentials: 'same-origin' });

    return new Promise((готово, мимо) => {
        const часы = setTimeout(() => мимо(new Error('Сеть не ответила')), СРОК_СЕТИ);

        сеть.then((ответ) => {
            clearTimeout(часы);
            готово(ответ);
        }).catch((e) => {
            clearTimeout(часы);
            мимо(e);
        });
    });
}

function положить(запрос, ответ) {
    if (!ответ.ok) return;
    const копия = ответ.clone();
    caches.open(CACHE_NAME).then((кэш) => кэш.put(запрос, копия));
}

self.addEventListener('fetch', (event) => {
    const запрос = event.request;

    if (запрос.method !== 'GET') return;

    const адрес = new URL(запрос.url);
    if (адрес.origin !== location.origin) return;

    const тяжёлое = /\.(png|svg|ico|wasm)$/.test(адрес.pathname) || адрес.pathname.includes('/vendor/');

    if (тяжёлое) {
        event.respondWith(
            caches.match(запрос, { ignoreSearch: true }).then((найдено) => найдено || fetch(свежий(запрос.url)).then((ответ) => {
                положить(запрос, ответ);
                return ответ;
            }))
        );
        return;
    }

    event.respondWith(
        изСети(запрос)
            .then((ответ) => {
                положить(запрос, ответ);
                return ответ;
            })
            .catch(async () => {
                // Переход по адресу без своего файла (#/разбор/…) ведёт в тот же
                // index.html. Ждём совпадение, а не берём обещание за ответ:
                // обещание всегда «истинно», и до запасного 503 дело не доходило
                const найдено = await caches.match(запрос)
                    || (запрос.mode === 'navigate' ? await caches.match('index.html') : undefined);

                return найдено || new Response('Нет сети', { status: 503, statusText: 'Нет сети' });
            })
    );
});
