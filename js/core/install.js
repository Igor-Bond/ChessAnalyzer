/**
 * Установка на телефон: своя кнопка вместо пункта меню, который пропадает.
 *
 * Chrome сообщает о готовности установить событием beforeinstallprompt —
 * один раз и в произвольный момент после загрузки. Событие придерживается
 * до нажатия кнопки «Установить на телефон» в архиве (Р-24).
 */

let отложенное = null;
let запущено = false;
const слушатели = new Set();

function известить() {
    for (const ф of слушатели) {
        try { ф(); } catch (e) { console.error('[Установка]', e); }
    }
}

export const установка = {

    /** Chrome готов установить прямо сейчас — можно показать кнопку. */
    get можно() {
        return отложенное !== null;
    },

    /** Открыто как установленное приложение, а не вкладкой браузера. */
    get вПриложении() {
        return matchMedia('(display-mode: standalone)').matches
            || matchMedia('(display-mode: fullscreen)').matches
            || navigator.standalone === true;
    },

    наИзменение(функция) {
        слушатели.add(функция);
        return () => слушатели.delete(функция);
    },

    /** Показать системное окно установки. Событие одноразовое. */
    async установить() {
        if (!отложенное) return false;

        const событие = отложенное;
        отложенное = null;
        событие.prompt();
        const { outcome } = await событие.userChoice;
        известить();
        return outcome === 'accepted';
    },

    init() {
        // Повторный вызов навесил бы вторых слушателей
        if (запущено) return;
        запущено = true;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            отложенное = e;
            известить();
        });

        window.addEventListener('appinstalled', () => {
            отложенное = null;
            известить();
        });
    },

    /** Только для проверок: забыть пойманное событие. */
    сбросить() {
        отложенное = null;
    }
};
