/**
 * Точка входа.
 *
 * Зависимости объявлены через import, порядком загрузки занимается браузер.
 * Inline-обработчиков нет — вместо них делегирование по data-action.
 */

import { app } from './app.js';
import { actions } from './core/actions.js';

/** Упавшее действие обязано быть видно: молча съеденная ошибка выглядит как «кнопка не работает». */
actions.onError((ошибка, имя) => {
    console.error(`[Действие «${имя}»]`, ошибка);
    alert(`Не получилось: ${ошибка?.message || ошибка}`);
});

window.addEventListener('error', (e) => console.error('[Страница]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[Обещание]', e.reason));

/**
 * Сервис-воркер: офлайн и обновления.
 *
 * Новый воркер встаёт сразу (skipWaiting в sw.js), но страницу не
 * перезагружает: перезагрузка посреди разбора стёрла бы позицию, на которой
 * человек остановился. Уже загруженный код доживает до следующего запуска,
 * а новые файлы приходят с ним.
 *
 * При каждом запуске воркер просят проверить офлайн-кэш: соседние
 * приложения на том же адресе могут его стереть (см. докачать в sw.js).
 */
function зарегистрироватьВоркер() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then((рег) => рег.active?.postMessage('проверить-кэш'))
        .catch((e) => console.error('[PWA] Не удалось зарегистрировать сервис-воркер:', e));
}

actions.init();
app.init();

window.addEventListener('load', зарегистрироватьВоркер);
