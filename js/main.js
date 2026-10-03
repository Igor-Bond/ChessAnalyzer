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
 * Новая версия не применяется сама посреди разбора: перезагрузка стёрла бы
 * позицию, на которой человек остановился. Она подхватится при следующем
 * запуске.
 */
function зарегистрироватьВоркер() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('sw.js')
        .catch((e) => console.error('[PWA] Не удалось зарегистрировать сервис-воркер:', e));
}

actions.init();
app.init();

window.addEventListener('load', зарегистрироватьВоркер);
