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
import { распознавание } from '../../js/core/recognize.js';
import { разобратьОтвет } from '../../js/core/scoresheet.js';
import { новаяПартия } from '../../js/core/game.js';
import { синхронизация } from '../../js/core/autosync.js';
import { установка } from '../../js/core/install.js';

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

    it('троекратное повторение не закрывает ввод и не ставит ничью', async () => {
        const п = хранилище.партия(app.route.param);
        const копия = хранилище.сохранить({ ...п, id: `${п.id}rep`, ходы: [], результат: '*' });

        // Вернуться к прежней партии обязательно: на ней стоят следующие проверки
        try {
            app.go('ввод', копия.id);
            for (const ход of ['Sf3', 'Sf6', 'Sg1', 'Sg8', 'Sf3', 'Sf6', 'Sg1', 'Sg8']) await ввестиХод(ход);

            equal(хранилище.партия(копия.id).ходы.length, 8);
            assert(!экран().querySelector('#move-input').disabled, 'ввод закрыт после повторения');
            equal(хранилище.партия(копия.id).результат, '*');
        } finally {
            хранилище.удалить(копия.id);
            app.go('ввод', п.id);
        }
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

    it('смена партии посреди разбора: новая разбирается, а не висит на чужом прогрессе', async () => {
        хранилище.настроить({ глубина: 10 });

        const длинная = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5',
            'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7', 'c4', 'c6', 'cxb5', 'axb5'];
        const а = хранилище.сохранить({ ...новаяПартия(), белые: 'A', ходы: длинная });
        const б = хранилище.сохранить({ ...новаяПартия(), белые: 'B', ходы: ['d4', 'd5', 'c4'] });

        app.go('разбор', а.id);
        await дождаться(() => (хранилище.партия(а.id).разбор?.оценки?.length || 0) >= 2, 'разбор A начался', 20000);

        // Назад в архив и сразу другую партию — пока A досчитывает позицию
        app.go('архив');
        app.go('разбор', б.id);

        await дождаться(() => хранилище.партия(б.id).разбор?.оценки?.length === 4
            && !экран().querySelector('.progress-card'), 'конец разбора B', 20000);
        assert(экран().querySelector('.summary'), 'нет сводки B');
        assert(!/A —/.test(экран().querySelector('h1').textContent), 'на экране чужая партия');

        хранилище.удалить(а.id);
        хранилище.удалить(б.id);
        app.go('архив');
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

    it('фото бланка: снимок → чтение → вопрос → ручной ход → партия', async () => {
        хранилище.стереть();
        хранилище.настроить({ ключ: 'тестовый-ключ', глубина: 10 });

        // Вместо Google — ответ, сочинённый как настоящий: одна клетка
        // спорная, одна пустая
        let отправлено = null;
        распознавание.задатьИсполнителя(async (снимки) => {
            отправлено = снимки;
            return разобратьОтвет({
                white: 'Igor', black: 'Klaus',
                moves: [
                    { n: 1, w: ['e4'], b: ['e6', 'c6'], wBox: [100, 100, 140, 300], bBox: [100, 320, 140, 520] },
                    { n: 2, w: [], b: ['d5'], wBox: [150, 100, 190, 300] }
                ]
            });
        });

        app.go('архив');
        await нажать('[data-action="новая-по-фото"]');
        await дождаться(() => app.route.name === 'фото', 'экран фото');
        equal(немыеКнопки(), []);

        // Камера и галерея — разные поля: одно поле с multiple Android
        // открывает без камеры (Р-27)
        assert(экран().querySelector('input[type="file"][capture="environment"]:not([multiple])'), 'нет поля камеры');
        assert(экран().querySelector('input[type="file"][multiple]:not([capture])'), 'нет поля галереи');

        // Снимок — нарисованный тут же холст: настоящий файл через настоящий input
        const холст = document.createElement('canvas');
        холст.width = 600;
        холст.height = 400;
        холст.getContext('2d').fillRect(0, 0, 50, 50);
        const файл = new File([await new Promise((r) => холст.toBlob(r, 'image/png'))], 'бланк.png', { type: 'image/png' });

        const поле = экран().querySelector('input[type="file"]');
        const dt = new DataTransfer();
        dt.items.add(файл);
        поле.files = dt.files;
        поле.dispatchEvent(new Event('change', { bubbles: true }));

        await дождаться(() => экран().querySelector('[data-action="распознать"]'), 'кнопка чтения после выбора снимка');
        await нажать('[data-action="распознать"]');
        await дождаться(() => экран().querySelector('.recog-sum'), 'итог сверки');

        equal(отправлено.length, 1);
        assert(отправлено[0].data.length > 100 && отправлено[0].mime === 'image/jpeg', 'снимок не уменьшен в JPEG');
        equal(немыеКнопки(), []);

        // Первый вопрос — спорный ответ чёрных; выбираем c6
        assert(экран().querySelector('[data-action="выбрать-вариант"][data-san="c6"]'), 'нет варианта c6');
        await нажать('[data-action="выбрать-вариант"][data-san="c6"]');

        // Дальше — пустая клетка 2. хода белых: вписываем сами
        await дождаться(() => экран().querySelector('#manual-move'), 'поле ручного хода');
        assert(экран().querySelector('.mv-btn.st-стоп'), 'место остановки не отмечено');
        await нажать('.mv-btn.st-стоп');
        экран().querySelector('#manual-move').value = 'd4';
        экран().querySelector('#manual-move').closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));

        await дождаться(() => /Вся запись сходится/.test(экран().textContent), 'запись сошлась после ручного хода');

        const id = app.route.param;
        await нажать('[data-action="взять-партию"]');
        await дождаться(() => app.route.name === 'разбор', 'переход к разбору');

        const п = хранилище.партия(id);
        equal(п.ходы, ['e4', 'c6', 'd4', 'd5']);
        equal(п.белые, 'Igor');

        распознавание.задатьИсполнителя(null);
        app.go('архив');
    });

    it('обмен: включается из настроек, отправляет архив, состояние видно в архиве', async () => {
        хранилище.стереть();
        const п = хранилище.сохранить({ ...новаяПартия(), белые: 'Igor', ходы: ['e4', 'e5'] });

        // Облако без Google: вход «уже выполнен» (как после трекера), сервер в памяти
        const наСервере = new Map();
        синхронизация.задатьОблако({
            кто: async () => ({ uid: 'u1', email: 'igor@example.com', имя: 'Igor' }),
            войти: async () => null,
            адаптер: async () => ({
                async отправить(список) { for (const з of список) наСервере.set(з.id, з); },
                async получить() { return { записи: [], курсор: 0 }; }
            })
        });

        try {
            app.go('настройки');
            equal(немыеКнопки(), []);
            await нажать('[data-action="обмен-включить"]');

            await дождаться(() => наСервере.has(п.id) && !синхронизация.состояние.идёт, 'архив отправлен');
            assert(хранилище.обмен().включён, 'обмен не включился');
            await дождаться(() => /igor@example\.com/.test(экран().textContent), 'вход показан в настройках');
            equal(немыеКнопки(), []);

            app.go('архив');
            assert(/Синхронизировано/.test(экран().querySelector('.sync-line')?.textContent || ''), 'нет строки обмена в архиве');

            app.go('настройки');
            await нажать('[data-action="обмен-выключить"]');
            assert(!хранилище.обмен().включён, 'обмен не выключился');
            assert(хранилище.партия(п.id), 'выключение стёрло партии');
        } finally {
            синхронизация.выключить();
            синхронизация.задатьОблако(null);
            хранилище.стереть();
            app.go('архив');
        }
    });

    it('закрытое окно входа не включает обмен', async () => {
        хранилище.стереть();
        синхронизация.задатьОблако({ кто: async () => null, войти: async () => null, адаптер: async () => { throw new Error('нельзя'); } });

        try {
            app.go('настройки');
            await нажать('[data-action="обмен-включить"]');
            await new Promise((r) => setTimeout(r, 50));
            assert(!хранилище.обмен().включён, 'обмен включился без входа');
            assert(экран().querySelector('[data-action="обмен-включить"]'), 'кнопка включения пропала');
        } finally {
            синхронизация.задатьОблако(null);
            app.go('архив');
        }
    });

    it('установка: кнопка в архиве появляется, только когда Chrome готов', async () => {
        установка.init();
        установка.сбросить();

        app.go('архив');
        assert(!экран().querySelector('.install-btn'), 'кнопка установки без готовности Chrome');

        const e = new Event('beforeinstallprompt', { cancelable: true });
        let показано = false;
        e.prompt = () => { показано = true; };
        e.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(e);
        app.render();

        assert(экран().querySelector('.install-btn'), 'кнопка не появилась');
        equal(немыеКнопки(), []);
        await нажать('.install-btn');
        await new Promise((r) => setTimeout(r, 10));
        assert(показано, 'окно установки не показано');
        assert(!экран().querySelector('.install-btn'), 'кнопка осталась после установки');
    });

    it('фото без ключа: подсказка про настройки, чтение недоступно', async () => {
        хранилище.стереть();
        app.go('архив');
        await нажать('[data-action="новая-по-фото"]');
        assert(экран().querySelector('.warn-card [data-action="настройки"]'), 'нет подсказки про ключ');
        app.go('архив');
    });

    it('настройки: ключ сохраняется и показывается только хвостом', async () => {
        хранилище.стереть();
        app.go('настройки');
        equal(немыеКнопки(), []);

        const форма = экран().querySelector('[data-submit="ключ"]');
        форма.querySelector('input').value = 'AIzaSyTEST-1234';
        форма.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 0));

        equal(хранилище.настройки().ключ, 'AIzaSyTEST-1234');
        assert(экран().textContent.includes('••••••1234'), 'хвост ключа не показан');
        assert(!экран().textContent.includes('AIzaSyTEST'), 'ключ виден целиком');
        хранилище.стереть();
    });

});

describe('Экраны: найденное ревизией', () => {
    it('обмен включён, а вход слетел — в настройках есть «Войти»', async () => {
        хранилище.стереть();
        хранилище.настроитьОбмен({ включён: true });
        синхронизация.задатьОблако({ кто: async () => null, войти: async () => null, адаптер: async () => { throw new Error('Вход не выполнен'); } });

        try {
            app.go('настройки');
            await синхронизация.сейчас();
            app.render();
            assert(экран().querySelector('[data-action="обмен-войти"]'), 'нет кнопки «Войти»');
            equal(немыеКнопки(), []);
        } finally {
            синхронизация.выключить();
            синхронизация.задатьОблако(null);
            хранилище.стереть();
            app.go('архив');
        }
    });

    it('двойное нажатие «Включить обмен» — одно окно входа', async () => {
        хранилище.стереть();
        let окон = 0;
        синхронизация.задатьОблако({
            кто: async () => null,
            войти: async () => { окон++; await new Promise((r) => setTimeout(r, 100)); return null; },
            адаптер: async () => { throw new Error('нет'); }
        });

        try {
            app.go('настройки');
            const кнопка = экран().querySelector('[data-action="обмен-включить"]');
            кнопка.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            кнопка.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 250));
            equal(окон, 1, 'окно входа открыто дважды');
        } finally {
            синхронизация.задатьОблако(null);
            хранилище.стереть();
            app.go('архив');
        }
    });

    it('разбор виден с первого мгновения: карточка хода работы, а не «ещё не делался»', async () => {
        хранилище.стереть();
        const п = хранилище.сохранить({ ...новаяПартия(), ходы: ['e4', 'e5', 'Nf3'] });
        app.go('разбор', п.id);
        await new Promise((r) => setTimeout(r, 0));
        assert(экран().querySelector('.progress-card'), 'нет карточки хода разбора сразу после открытия');
        assert(!/ещё не делался/.test(экран().textContent), 'видна карточка «Разбор ещё не делался»');
        app.go('архив');
        хранилище.стереть();
    });

    it('набранный текст переживает перерисовку экрана', async () => {
        хранилище.стереть();
        const п = хранилище.сохранить({ ...новаяПартия(), ходы: ['e4'] });
        app.go('ввод', п.id);
        // Экран на странице проверок спрятан, а в спрятанное поле фокус не
        // ставится — на время проверки показываем
        const обёртка = экран().parentElement;
        обёртка.hidden = false;
        try {
            const поле = экран().querySelector('#move-input');
            поле.focus();
            поле.value = 'Sf';
            app.render({ фон: true });
            equal(экран().querySelector('#move-input').value, 'Sf', 'перерисовка стёрла набранное');
        } finally {
            обёртка.hidden = true;
        }
        app.go('архив');
        хранилище.стереть();
    });

    it('отмена хода не стирает вписанный вручную результат', async () => {
        хранилище.стереть();
        const п = хранилище.сохранить({ ...новаяПартия(), ходы: ['e4', 'e5', 'Nf3'], результат: '0-1' });
        app.go('ввод', п.id);
        await нажать('[data-action="отменить-ход"]');
        equal(хранилище.партия(п.id).результат, '0-1');
        app.go('архив');
        хранилище.стереть();
    });

    it('брошенная пустая партия не остаётся в архиве', async () => {
        хранилище.стереть();
        app.go('архив');
        await нажать('[data-action="новая"]');
        await дождаться(() => app.route.name === 'ввод', 'экран ввода');
        app.go('архив');
        equal(хранилище.партии().length, 0, 'пустая партия осталась');
        assert(!/пустая/.test(экран().textContent), 'карточка пустой партии в архиве');
    });
});
