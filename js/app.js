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
import { детальноЭкран } from './modules/details.js';
import { свободнаяДоска } from './modules/free.js';
import { задачиЭкран } from './modules/puzzles.js';

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
            фото: фотоЭкран,
            детально: детальноЭкран,
            доска: свободнаяДоска,
            задачи: задачиЭкран
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

            app.уйти(маршрут);
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

        const куда = разобрать(адрес);
        app.уйти(куда);
        app.route = куда;
        app.render(true);

        if (location.hash !== адрес) location.hash = адрес;
    },

    /**
     * Экран, который покидают, может прибрать за собой: остановить разбор,
     * убрать брошенную пустую партию. Он знает, куда уходят: с фото бланка
     * на ввод той же партии — не бросили, а продолжают.
     */
    уйти(куда = null) {
        экраны()[app.route.name]?.leave?.(куда);
    },

    /**
     * Перерисовать текущий экран.
     *
     * @param {boolean|{наверх?: boolean, фон?: boolean}} параметры
     *   наверх — прокрутить к началу. Только при переходе: перерисовка от
     *   хода посреди разбора не должна уносить страницу вверх.
     *   фон — перерисовка не по действию человека (догрузилась вырезка,
     *   пришли партии с другого устройства, шаг разбора): набираемый текст и
     *   курсор в поле сохраняются. Раньше такая перерисовка стирала
     *   набранное посреди слова и закрывала клавиатуру телефона.
     */
    render(параметры = false) {
        const { наверх = false, фон = false } = typeof параметры === 'object' ? параметры : { наверх: параметры };

        const место = document.getElementById('screen');
        if (!место) return;

        const экран = экраны()[app.route.name] || архивЭкран;

        // Поле, в котором человек сейчас набирает, — запомнить до перерисовки
        const поле = фон && document.activeElement?.id && место.contains(document.activeElement)
            && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)
            ? { id: document.activeElement.id, значение: document.activeElement.value, начало: document.activeElement.selectionStart, конец: document.activeElement.selectionEnd }
            : null;

        try {
            место.innerHTML = String(экран.render(app.route.param));
            if (наверх) window.scrollTo?.(0, 0);
        } catch (e) {
            console.error('[Экран] Не удалось нарисовать:', e);
            место.innerHTML = '<div class="empty-note">Экран не открылся. Попробуйте обновить страницу.</div>';
        }

        if (поле) {
            const новое = document.getElementById(поле.id);
            if (новое) {
                новое.value = поле.значение;
                новое.focus();
                try { новое.setSelectionRange(поле.начало, поле.конец); } catch { /* не у всех полей есть курсор */ }
            }
        }

        экран.after?.(app.route.param);
    }
};
