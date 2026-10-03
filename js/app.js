/**
 * Экраны и маршрутизация.
 *
 * Маршрут — в адресе после решётки: #/разбор/g123. Так работает кнопка
 * «назад», разбор можно открыть заново по ссылке, и приложение остаётся
 * набором статических файлов: правил переписывания путей на Pages нет.
 */

import { архивЭкран } from './modules/home.js';
import { вводЭкран } from './modules/entry.js';
import { разборЭкран } from './modules/review.js';
import { настройкиЭкран } from './modules/settings.js';
import { фотоЭкран } from './modules/photo.js';

/**
 * Список экранов собирается при первом обращении, а не при загрузке модуля:
 * экраны импортируют app.js ради переходов, и пока круг импортов не
 * доисполнен, их переменные ещё недоступны.
 */
let ЭКРАНЫ = null;

function экраны() {
    if (!ЭКРАНЫ) {
        ЭКРАНЫ = {
            архив: архивЭкран,
            ввод: вводЭкран,
            разбор: разборЭкран,
            настройки: настройкиЭкран,
            фото: фотоЭкран
        };
    }

    return ЭКРАНЫ;
}

const ПО_УМОЛЧАНИЮ = 'архив';

function разобрать(hash) {
    const части = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    const имя = decodeURIComponent(части[0] || ПО_УМОЛЧАНИЮ);

    return {
        name: экраны()[имя] ? имя : ПО_УМОЛЧАНИЮ,
        param: части[1] ? decodeURIComponent(части[1]) : null
    };
}

export const app = {

    route: { name: ПО_УМОЛЧАНИЮ, param: null },

    init() {
        // Своя же смена адреса приходит сюда на уже нарисованный экран —
        // повторно его не рисуем, иначе разбор начинался бы заново
        window.addEventListener('hashchange', () => {
            const маршрут = разобрать(location.hash);
            if (маршрут.name === app.route.name && маршрут.param === app.route.param) return;

            app.уйти();
            app.route = маршрут;
            app.render();
        });

        app.route = разобрать(location.hash);
        app.render();
    },

    /** Переход: рисует сразу, адрес правит следом — ради «назад» и перезагрузки. */
    go(имя, параметр) {
        const адрес = параметр
            ? `#/${encodeURIComponent(имя)}/${encodeURIComponent(параметр)}`
            : `#/${encodeURIComponent(имя)}`;

        app.уйти();
        app.route = разобрать(адрес);
        app.render(true);

        if (location.hash !== адрес) location.hash = адрес;
    },

    /** Экран, который покидают, может прибрать за собой: остановить разбор. */
    уйти() {
        экраны()[app.route.name]?.leave?.();
    },

    /**
     * Перерисовать текущий экран.
     *
     * @param {boolean} наверх — прокрутить к началу. Только при переходе:
     *   перерисовка от хода посреди разбора не должна уносить страницу
     *   вверх от списка ходов, который человек читает.
     */
    render(наверх = false) {
        const место = document.getElementById('screen');
        if (!место) return;

        const экран = экраны()[app.route.name] || архивЭкран;

        try {
            место.innerHTML = String(экран.render(app.route.param));
            if (наверх) window.scrollTo?.(0, 0);
        } catch (e) {
            console.error('[Экран] Не удалось нарисовать:', e);
            место.innerHTML = '<div class="empty-note">Экран не открылся. Попробуйте обновить страницу.</div>';
        }

        экран.after?.(app.route.param);
    }
};
