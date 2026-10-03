/**
 * Делегирование событий.
 *
 * Разметка собирается строками и перерисовывается целиком, поэтому вешать
 * addEventListener на каждый элемент бессмысленно — после перерисовки
 * слушатели теряются вместе с узлами. Вместо этого элемент объявляет
 * намерение атрибутом:
 *
 *   <button data-action="вперёд">▶</button>
 *   <form data-submit="ход">…</form>
 *
 * а обработчик регистрируется один раз на всё приложение.
 */

let запущено = false;

const нажатия = new Map();
const изменения = new Map();
const отправки = new Map();

let наОшибку = null;

function сообщить(имя, ошибка) {
    console.error(`[Действия] Ошибка в обработчике «${имя}»:`, ошибка);

    try {
        наОшибку?.(ошибка, имя);
    } catch (e) {
        console.error('[Действия] Ошибка в сообщении об ошибке:', e);
    }
}

function раздать(карта, событие, атрибут) {
    const el = событие.target.closest?.(`[${атрибут}]`);
    if (!el) return;

    const имя = el.getAttribute(атрибут);
    const обработчик = карта.get(имя);

    if (!обработчик) {
        console.warn(`[Действия] Нет обработчика «${имя}»`);
        return;
    }

    if (атрибут === 'data-submit') событие.preventDefault();

    // Обычный try не ловит отказ асинхронного обработчика — он ушёл бы в
    // необработанное обещание, и нажатая кнопка молча ничего бы не сделала
    Promise.resolve()
        .then(() => обработчик(el, событие))
        .catch((e) => сообщить(имя, e));
}

export const actions = {

    on(имя, обработчик) {
        нажатия.set(имя, обработчик);
    },

    onChange(имя, обработчик) {
        изменения.set(имя, обработчик);
    },

    onSubmit(имя, обработчик) {
        отправки.set(имя, обработчик);
    },

    /** Имена, на которые кто-то подписан, — для проверки «немых» кнопок. */
    names() {
        return { click: [...нажатия.keys()], change: [...изменения.keys()], submit: [...отправки.keys()] };
    },

    onError(обратный) {
        наОшибку = обратный;
    },

    init() {
        if (запущено) return;
        запущено = true;

        document.addEventListener('click', (e) => раздать(нажатия, e, 'data-action'));
        document.addEventListener('change', (e) => раздать(изменения, e, 'data-change'));
        document.addEventListener('submit', (e) => раздать(отправки, e, 'data-submit'));

        /*
         * Клавиши: стрелки листают партию, как на lichess.
         *
         * Кнопка объявляет свою клавишу атрибутом data-key. В поле ввода
         * клавиши не перехватываются: там стрелка двигает курсор по
         * набираемому ходу, и отнимать её нельзя.
         */
        document.addEventListener('keydown', (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.target.closest?.('input, textarea, select')) return;

            const цель = [...document.querySelectorAll('[data-key]')]
                .find((el) => el.dataset.key.split(' ').includes(e.key.toLowerCase()));

            if (цель && !цель.disabled) {
                e.preventDefault();
                цель.click();
            }
        });
    }
};
