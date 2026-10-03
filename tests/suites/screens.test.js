/**
 * Экраны целиком: от новой партии до разбора.
 *
 * Нажимаются настоящие кнопки настоящего приложения: ошибки живут в стыках —
 * в кнопке, которую никто не слушает, в ходе, который ввёлся, но не
 * сохранился, в разборе, который начался и не кончился.
 */

import { describe, it, equal, assert } from '../runner.js';
import { app } from '../../js/app.js';
import { actions } from '../../js/core/actions.js';
import { хранилище } from '../../js/core/store.js';

const экран = () => document.getElementById('screen');

let поднято = false;

function поднять() {
    if (поднято) return;
    app.init();
    поднято = true;
}

/** Ждать условия — с пределом, чтобы зависание было провалом, а не вечным ожиданием. */
async function дождаться(условие, подпись, срок = 5000) {
    const край = Date.now() + срок;

    while (Date.now() < край) {
        if (условие()) return;
        await new Promise((r) => setTimeout(r, 25));
    }

    throw new Error(`Не дождались: ${подпись}`);
}

async function нажать(селектор) {
    const el = экран().querySelector(селектор);
    if (!el) throw new Error(`Нет на экране: ${селектор}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Обработчик выполняется не сразу, а следующей задачей (см. actions.js)
    await new Promise((r) => setTimeout(r, 0));
    return el;
}

async function ввестиХод(текст) {
    const поле = экран().querySelector('#move-input');
    if (!поле) throw new Error('Нет поля хода');
    поле.value = текст;
    поле.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
}

/** Кнопки, которые никто не слушает: нажимаются и молчат. */
function немыеКнопки() {
    const имена = actions.names();
    const немые = [];

    for (const el of экран().querySelectorAll('[data-action]')) {
        if (!имена.click.includes(el.dataset.action)) немые.push(el.dataset.action);
    }
    for (const el of экран().querySelectorAll('[data-change]')) {
        if (!имена.change.includes(el.dataset.change)) немые.push(el.dataset.change);
    }
    for (const el of экран().querySelectorAll('[data-submit]')) {
        if (!имена.submit.includes(el.dataset.submit)) немые.push(el.dataset.submit);
    }

    return [...new Set(немые)];
}

describe('Экраны', () => {
    it('архив открывается, немых кнопок нет', async () => {
        хранилище.стереть();
        поднять();
        app.go('архив');
        assert(экран().querySelector('[data-action="новая"]'), 'нет кнопки новой партии');
        equal(немыеКнопки(), []);
    });

    it('новая партия → ввод; ходы текстом и нажатиями по доске', async () => {
        app.go('архив');
        await нажать('[data-action="новая"]');
        await дождаться(() => app.route.name === 'ввод', 'экран ввода');
        equal(немыеКнопки(), []);

        await ввестиХод('e4');
        await ввестиХод('e5');
        await ввестиХод('Sf3');

        // Ход нажатиями: конь b8 на c6
        await нажать('[data-square="b8"]');
        assert(экран().querySelectorAll('.board .target').length > 0, 'нет подсказки, куда можно пойти');
        await нажать('[data-square="c6"]');

        const п = хранилище.партия(app.route.param);
        equal(п.ходы, ['e4', 'e5', 'Nf3', 'Nc6']);
    });

    it('невозможный ход — сообщение, набранное не стирается', async () => {
        await ввестиХод('Lxe5');
        await дождаться(() => экран().querySelector('.form-error'), 'сообщение об ошибке');
        equal(экран().querySelector('#move-input').value, 'Lxe5');
        equal(хранилище.партия(app.route.param).ходы.length, 4);
    });

    it('отмена хода', async () => {
        await нажать('[data-action="отменить-ход"]');
        equal(хранилище.партия(app.route.param).ходы, ['e4', 'e5', 'Nf3']);
    });

    it('вставка текста заменяет ходы и берёт заголовки', async () => {
        await нажать('[data-action="вставка"]');
        const поле = экран().querySelector('.paste-text');
        поле.value = '[White "Igor"]\n[Black "Klaus"]\n1. e4 e5 2. Lc4 Sc6 3. Dh5 Sf6 4. D:f7#';
        await нажать('[data-action="взять-текст"]');

        const п = хранилище.партия(app.route.param);
        equal(п.ходы, ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
        equal(п.белые, 'Igor');
        equal(п.результат, '1-0', 'мат — результат ставится сам');
    });

    it('разбор: движок проходит партию, классы и сводка на экране', async () => {
        хранилище.настроить({ глубина: 10 });
        const id = app.route.param;

        await нажать('[data-action="к-разбору"]');
        await дождаться(() => app.route.name === 'разбор', 'экран разбора');
        equal(немыеКнопки(), []);

        await дождаться(() => {
            const п = хранилище.партия(id);
            return п.разбор?.оценки?.length === 8 && !экран().querySelector('.progress-card');
        }, 'конец разбора', 60000);

        assert(экран().querySelector('.summary'), 'нет сводки');
        assert(экран().querySelector('.graph'), 'нет графика');
        assert(экран().querySelector('.mv-зевок'), 'зевок Sf6 не отмечен в списке ходов');
        equal(немыеКнопки(), []);
    });

    it('листание: к ходу, вперёд, назад; знак класса на доске', async () => {
        await нажать('[data-action="к-ходу"][data-ply="6"]');
        assert(экран().querySelector('.board .badge-зевок'), 'нет знака зевка на доске');
        assert(экран().querySelector('.board .arrow-best'), 'нет стрелки лучшего хода');
        assert(/Зевок/.test(экран().querySelector('.move-card').textContent), 'карточка хода не про зевок');

        await нажать('[data-action="вперёд"]');
        assert(экран().querySelector('.board .badge-единственный'), 'Dxf7# не отмечен единственным ходом');

        await нажать('[data-action="назад"]');
        await нажать('[data-action="назад"]');
        assert(экран().querySelector('.mv-btn.on[data-ply="5"]'), 'выделен не тот ход');
    });

    it('вариант: показать лучший ход на доске и вернуться', async () => {
        await нажать('[data-action="к-ходу"][data-ply="6"]');
        await нажать('[data-action="вариант"][data-kind="лучший"]');
        assert(экран().querySelector('.move-card.variation'), 'вариант не открылся');
        equal(немыеКнопки(), []);

        await нажать('[data-action="выйти-из-варианта"]');
        assert(!экран().querySelector('.move-card.variation'), 'вариант не закрылся');
    });

    it('архив показывает точность разобранной партии; настройки открываются', async () => {
        app.go('архив');
        assert(экран().querySelector('.game-acc b'), 'нет точности в карточке');

        app.go('настройки');
        equal(немыеКнопки(), []);
        await нажать('[data-action="нотация"][data-value="ru"]');
        equal(хранилище.настройки().нотация, 'ru');

        хранилище.стереть();
        app.go('архив');
    });
});
