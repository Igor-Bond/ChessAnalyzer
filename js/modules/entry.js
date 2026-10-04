/**
 * Ввод партии: доска, поле для хода, вставка текста.
 *
 * Три способа, потому что партии приходят по-разному. С бланка удобнее
 * набирать текстом — глаза на бумаге, пальцы печатают «Sf3», и доска
 * подтверждает, что ход возможен. Когда запись на бланке неразборчива,
 * проще нажать фигуру на доске и посмотреть, куда она могла пойти. А
 * готовую партию из книги или чата вставляют целиком.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { иконка } from '../core/icons.js';
import { хранилище } from '../core/store.js';
import { доскаНа, разобратьТекст, вPGN, результатПоПозиции, партияОкончена, заменитьХод, номерХода } from '../core/game.js';
import { найтиХод, показатьХод, НОТАЦИИ } from '../core/notation.js';
import { нарисоватьДоску, полеШаха, ФИГУРЫ } from '../core/board.js';

const { html, raw } = ui;

/** Состояние экрана — живёт, пока открыт экран, в архив не пишется. */
const с = {
    id: null,
    выбрано: null,
    превращение: null,     // { from, to } — ждём выбора фигуры
    ошибка: '',
    сообщение: '',
    вставка: false,
    текстВставки: '',
    сторона: 'w',
    фокус: false,
    правка: null,          // номер исправляемого полухода, с единицы
    откат: null,           // { ходы, результат } — вернуть как было до правки
    фокусПравки: false
};

/** Правка, запрошенная с другого экрана (разбор → «Исправить ход»). */
let запрошено = null;

/** Открыть ввод партии сразу на правке хода. */
export function открытьПравку(id, полуход) {
    запрошено = { id, полуход };
}

function сбросить(id) {
    Object.assign(с, {
        id, выбрано: null, превращение: null, ошибка: '', сообщение: '',
        вставка: false, текстВставки: '', сторона: 'w', фокус: false,
        правка: null, откат: null, фокусПравки: false
    });

    if (запрошено?.id === id) {
        с.правка = запрошено.полуход;
        с.фокусПравки = true;
    }
    запрошено = null;
}

function партия() {
    return хранилище.партия(с.id);
}

/** Сделать ход и сохранить. Результат ставится сам, если партия кончилась матом или патом. */
function сделатьХод(п, san) {
    const доска = доскаНа(п, п.ходы.length);
    доска.move(san);

    const ходы = [...п.ходы, san];
    const итог = результатПоПозиции(доска);

    хранилище.сохранить({ ...п, ходы, результат: итог || п.результат });
    с.выбрано = null;
    с.превращение = null;
    с.ошибка = '';
    с.сообщение = '';
    с.откат = null;
}

/** Позиция, в которой сейчас ходят на доске: перед исправляемым ходом или в конце. */
function доскаВвода(п) {
    return доскаНа(п, с.правка ? с.правка - 1 : п.ходы.length);
}

/** Ход, сделанный на доске: правка или новый ход в конце. */
function поставить(п, san) {
    if (с.правка) применитьПравку(п, san);
    else сделатьХод(п, san);
}

function списокХодов(п, нотация) {
    if (!п.ходы.length) return html`<p class="muted small">Ходов пока нет. Начните с первого хода белых.</p>`;

    // Каждый ход нажимается — открыть его правку (Р-29)
    const ход = (i) => (п.ходы[i]
        ? html`<button class="mv mv-edit ${с.правка === i + 1 ? 'on' : ''}" data-action="править-ход" data-ply="${i + 1}">${показатьХод(п.ходы[i], нотация)}</button>`
        : html`<span class="mv"></span>`);

    const пары = [];
    for (let i = 0; i < п.ходы.length; i += 2) {
        пары.push(html`
            <li>
                <span class="mv-num">${i / 2 + 1}.</span>
                ${ход(i)}
                ${ход(i + 1)}
            </li>
        `);
    }

    return html`
        <ol class="moves-compact">${пары}</ol>
        <p class="muted small">Нажмите на ход, чтобы исправить его.</p>
    `;
}

/**
 * Карточка правки хода посреди партии (Р-29).
 *
 * Ошибка переписчика или неверно прочитанная с фото клетка — обычно один
 * ход в середине партии. Раньше исправить его можно было, только отменив
 * всё после него и введя заново.
 */
function карточкаПравки(п, нотация) {
    const ply = с.правка;
    const подпись = `${номерХода(ply)} ${показатьХод(п.ходы[ply - 1], нотация)}`;

    return html`
        <section class="card edit-card">
            <h2 class="card-title">Исправить ход ${подпись}</h2>
            <p class="small">Впишите верный ход или сделайте его на доске — она стоит в позиции перед этим ходом. Остальная партия переиграется сама.</p>
            <form class="move-form" data-submit="заменить-ход" autocomplete="off">
                <div class="move-row">
                    <input id="edit-input" name="ход" class="move-input" placeholder="верный ход"
                        autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
                    <button class="btn primary" type="submit">Заменить</button>
                </div>
                ${с.ошибка ? html`<p class="form-error" role="alert">${с.ошибка}</p>` : ''}
            </form>
            <div class="row-actions">
                <button class="btn ghost danger" data-action="удалить-с-хода">${raw(иконка('удалить'))} Удалить этот ход и все после</button>
                <button class="btn ghost" data-action="отменить-правку">Отмена</button>
            </div>
        </section>
    `;
}

/**
 * Применить правку: заменить ход и переиграть остальное.
 *
 * Результат пересчитывается, только если его ставила сама позиция (мат,
 * пат): вписанный вручную — сдача, время — правкой хода не отменяется.
 */
function применитьПравку(п, san) {
    const ply = с.правка;
    с.правка = null;
    с.выбрано = null;
    с.превращение = null;
    с.ошибка = '';

    if (san === п.ходы[ply - 1]) return;

    const р = заменитьХод(п.ходы, ply, san);
    const былПозицией = результатПоПозиции(доскаНа(п, п.ходы.length)) === п.результат;
    const новый = былПозицией ? (результатПоПозиции(доскаНа({ ходы: р.ходы }, р.ходы.length)) || '*') : п.результат;

    с.откат = { ходы: п.ходы, результат: п.результат };
    хранилище.сохранить({ ...п, ходы: р.ходы, результат: новый });

    с.сообщение = р.отброшено
        ? `Ход ${номерХода(ply)} исправлен. С ${номерХода(р.обрывНа)} дальше записанные ходы стали невозможны — убрано ${р.отброшено}; допишите их заново.`
        : `Ход ${номерХода(ply)} исправлен — остальная партия сходится.`;
}

function выборПревращения(цвет) {
    const фигуры = ['q', 'r', 'b', 'n'];

    return html`
        <div class="promo" role="group" aria-label="Во что превратить пешку">
            <span>Превратить в:</span>
            ${фигуры.map((ф) => html`
                <button class="promo-btn" data-action="превратить" data-piece="${ф}">
                    <img src="${ФИГУРЫ}${цвет}${ф.toUpperCase()}.svg" alt="${ф}">
                </button>
            `)}
            <button class="btn ghost small" data-action="отменить-превращение">Отмена</button>
        </div>
    `;
}

export const вводЭкран = {

    render(id) {
        if (с.id !== id) сбросить(id);

        const п = партия();
        if (!п) {
            return html`
                <header class="topbar">
                    <button class="icon-btn" data-action="в-архив" aria-label="Назад">${raw(иконка('назад'))}</button>
                    <h1>Партия не найдена</h1>
                </header>
                <div class="empty-note">Возможно, её удалили. <button class="btn" data-action="в-архив">В архив</button></div>
            `;
        }

        const { нотация } = хранилище.настройки();

        // Правка закрывается, если исправляемого хода уже нет (отменили)
        if (с.правка && с.правка > п.ходы.length) с.правка = null;

        // При правке доска стоит в позиции перед исправляемым ходом
        const доска = доскаНа(п, с.правка ? с.правка - 1 : п.ходы.length);
        const последний = доска.history({ verbose: true }).at(-1) || null;

        const цели = с.выбрано
            ? доска.moves({ square: с.выбрано, verbose: true }).map((х) => х.to)
            : [];

        const очередь = доска.turn() === 'w' ? 'белых' : 'чёрных';
        const номер = Math.floor(п.ходы.length / 2) + 1;
        const конец = партияОкончена(доска);

        const н = НОТАЦИИ[нотация];
        const пример = `e4, ${н.n}f3, ${н.b}xe5, 0-0`;

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="в-архив" aria-label="В архив" title="В архив">${raw(иконка('назад'))}</button>
                <h1>Ввод партии</h1>
                <button class="icon-btn" data-action="перевернуть-ввод" aria-label="Перевернуть доску" title="Перевернуть доску">${raw(иконка('перевернуть'))}</button>
            </header>

            <div class="layout">
                <div class="board-col">
                    <div class="players-bar">
                        <input class="player-input" data-change="поле" data-field="${с.сторона === 'w' ? 'чёрные' : 'белые'}"
                            value="${с.сторона === 'w' ? п.чёрные : п.белые}" placeholder="${с.сторона === 'w' ? 'Чёрные' : 'Белые'}" aria-label="Игрок сверху">
                    </div>

                    <div class="board-wrap">
                        ${raw(нарисоватьДоску({
                            fen: доска.fen(),
                            сторона: с.сторона,
                            последний,
                            выбрано: с.выбрано,
                            цели,
                            шах: полеШаха(доска),
                            нажимаемая: !с.превращение
                        }))}
                    </div>

                    <div class="players-bar">
                        <input class="player-input" data-change="поле" data-field="${с.сторона === 'w' ? 'белые' : 'чёрные'}"
                            value="${с.сторона === 'w' ? п.белые : п.чёрные}" placeholder="${с.сторона === 'w' ? 'Белые' : 'Чёрные'}" aria-label="Игрок снизу">
                    </div>

                    ${с.превращение ? выборПревращения(доска.turn()) : ''}
                </div>

                <div class="panel-col">
                    ${п.ходы.length ? '' : html`
                        <button class="btn primary big photo-cta" data-action="фото">${raw(иконка('камера'))} Сфотографировать бланк</button>
                    `}

                    ${с.правка ? карточкаПравки(п, нотация) : ''}

                    ${с.откат && !с.правка ? html`
                        <section class="card">
                            <p class="form-note">${с.сообщение}</p>
                            <button class="btn ghost" data-action="вернуть-правку">${raw(иконка('отменить'))} Вернуть как было</button>
                        </section>
                    ` : ''}

                    <section class="card" ${с.правка ? 'hidden' : ''}>
                        <form class="move-form" data-submit="ход" autocomplete="off">
                            <label class="move-label" for="move-input">
                                ${конец ? 'Партия окончена' : `${номер}${доска.turn() === 'w' ? '.' : '…'} Ход ${очередь}`}
                            </label>
                            <div class="move-row">
                                <input id="move-input" name="ход" class="move-input" placeholder="${пример}"
                                    autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"
                                    ${конец ? 'disabled' : ''}>
                                <button class="btn primary" type="submit" ${конец ? 'disabled' : ''}>Ход</button>
                            </div>
                            ${с.ошибка ? html`<p class="form-error" role="alert">${с.ошибка}</p>` : ''}
                            ${с.сообщение && !с.откат ? html`<p class="form-note">${с.сообщение}</p>` : ''}
                            <p class="muted small">Понимаю немецкую, английскую и русскую запись, а также длинную: e2-e4, Sg1-f3.</p>
                        </form>

                        <div class="row-actions">
                            <button class="btn ghost" data-action="отменить-ход" ${п.ходы.length ? '' : 'disabled'}>
                                ${raw(иконка('отменить'))} Отменить ход
                            </button>
                            <button class="btn ghost" data-action="вставка">
                                ${raw(иконка('вставить'))} Вставить текст
                            </button>
                            ${п.ходы.length ? html`
                                <button class="btn ghost" data-action="фото">${raw(иконка('камера'))} Фото бланка</button>
                            ` : ''}
                        </div>

                        ${с.вставка ? html`
                            <div class="paste">
                                <textarea class="paste-text" data-change="текст-вставки" rows="6"
                                    placeholder="1. e4 e5 2. Sf3 Sc6 3. Lb5 a6 …&#10;или PGN целиком">${с.текстВставки}</textarea>
                                <div class="row-actions">
                                    <button class="btn primary" data-action="взять-текст">Взять ходы</button>
                                    <button class="btn ghost" data-action="вставка">Закрыть</button>
                                </div>
                                ${п.ходы.length ? html`<p class="muted small">Ходы из текста заменят введённые.</p>` : ''}
                            </div>
                        ` : ''}
                    </section>

                    <section class="card">
                        <h2 class="card-title">Ходы</h2>
                        ${списокХодов(п, нотация)}
                    </section>

                    <section class="card details">
                        <h2 class="card-title">О партии</h2>
                        <div class="fields">
                            <label>Турнир<input data-change="поле" data-field="событие" value="${п.событие}" placeholder="Bezirksliga, тур 3"></label>
                            <label>Дата<input type="date" data-change="поле" data-field="дата" value="${п.дата}"></label>
                            <label>Результат
                                <select data-change="поле" data-field="результат">
                                    ${['*', '1-0', '0-1', '1/2-1/2'].map((р) => html`<option value="${р}" ${п.результат === р ? 'selected' : ''}>${р === '*' ? 'не указан' : р}</option>`)}
                                </select>
                            </label>
                        </div>
                    </section>

                    <div class="cta">
                        <button class="btn primary big" data-action="к-разбору" ${п.ходы.length ? '' : 'disabled'}>Разобрать партию</button>
                        <div class="row-actions">
                            <button class="btn ghost" data-action="копировать-pgn" ${п.ходы.length ? '' : 'disabled'}>${raw(иконка('копировать'))} PGN</button>
                            <button class="btn ghost danger" data-action="удалить-партию">${raw(иконка('удалить'))} Удалить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    after() {
        if (с.фокус) {
            document.getElementById('move-input')?.focus();
            с.фокус = false;
        }

        if (с.фокусПравки) {
            document.getElementById('edit-input')?.focus();
            с.фокусПравки = false;
        }
    },

    /**
     * Брошенная пустая партия не остаётся в архиве.
     *
     * «Новая партия» заводит запись сразу, и каждое открытие с возвратом
     * назад оставляло в архиве карточку «пустая». Убираем, если в партии
     * нет ни хода, ни имени, ни турнира и уходят не на её же фото бланка.
     */
    leave(куда) {
        убратьПустую(с.id, куда);
    }
};

/** Убрать партию без единого признака жизни — если уходят не к ней же. */
export function убратьПустую(id, куда) {
    const п = id && хранилище.партия(id);
    if (!п || куда?.param === id) return;
    if (п.ходы.length || п.белые || п.чёрные || п.событие) return;

    // Без отметки удаления: пустая партия никуда не уезжала (sync.js)
    хранилище.убрать(id);
}

actions.onSubmit('ход', (форма) => {
    const п = партия();
    const поле = форма.querySelector('input[name="ход"]');
    const текст = поле.value.trim();
    if (!п || !текст) return;

    const найдено = найтиХод(доскаНа(п, п.ходы.length), текст);
    с.фокус = true;

    if (!найдено.ход) {
        с.ошибка = найдено.ошибка;
        app.render();
        // Набранное не стираем: ошибку исправляют, а не набирают заново
        const новое = document.getElementById('move-input');
        if (новое) новое.value = текст;
        return;
    }

    сделатьХод(п, найдено.ход.san);
    app.render();
});

actions.on('клетка', (el) => {
    const п = партия();
    if (!п) return;

    const поле = el.dataset.square;
    const доска = доскаВвода(п);

    if (с.выбрано) {
        const ходы = доска.moves({ square: с.выбрано, verbose: true }).filter((х) => х.to === поле);

        if (ходы.length) {
            if (ходы.some((х) => х.promotion)) {
                с.превращение = { from: с.выбрано, to: поле };
            } else {
                поставить(п, ходы[0].san);
            }
            return app.render();
        }
    }

    const фигура = доска.get(поле);
    с.выбрано = фигура && фигура.color === доска.turn() && поле !== с.выбрано ? поле : null;
    app.render();
});

actions.on('превратить', (el) => {
    const п = партия();
    if (!п || !с.превращение) return;

    const доска = доскаВвода(п);
    const ход = доска.moves({ verbose: true }).find((х) =>
        х.from === с.превращение.from && х.to === с.превращение.to && х.promotion === el.dataset.piece);

    if (ход) поставить(п, ход.san);
    app.render();
});

actions.on('отменить-превращение', () => {
    с.превращение = null;
    с.выбрано = null;
    app.render();
});

actions.on('отменить-ход', () => {
    const п = партия();
    if (!п?.ходы.length) return;
    с.откат = null;
    с.правка = null;

    // Результат сбрасывается, только если его поставила сама позиция (мат,
    // пат). Вписанный вручную — сдача, время — к последнему ходу не привязан,
    // и исправление опечатки в последнем ходе не должно его стирать
    const поставленПозицией = результатПоПозиции(доскаНа(п, п.ходы.length)) === п.результат;
    хранилище.сохранить({ ...п, ходы: п.ходы.slice(0, -1), результат: поставленПозицией ? '*' : п.результат });
    с.выбрано = null;
    с.ошибка = '';
    app.render();
});

actions.on('перевернуть-ввод', () => {
    с.сторона = с.сторона === 'w' ? 'b' : 'w';
    app.render();
});

actions.onChange('поле', (el) => {
    const п = партия();
    if (!п) return;
    хранилище.сохранить({ ...п, [el.dataset.field]: el.value.trim() });
});

actions.on('вставка', () => {
    с.вставка = !с.вставка;
    app.render();
});

actions.onChange('текст-вставки', (el) => {
    с.текстВставки = el.value;
});

actions.on('взять-текст', () => {
    const п = партия();
    const поле = document.querySelector('.paste-text');
    if (поле) с.текстВставки = поле.value;
    if (!п || !с.текстВставки.trim()) return;

    const итог = разобратьТекст(с.текстВставки);

    if (!итог.ходы.length && итог.ошибка) {
        с.ошибка = `Не понял уже первый ход: ${итог.ошибка.причина}`;
        return app.render();
    }

    const з = итог.заголовки;
    хранилище.сохранить({
        ...п,
        ходы: итог.ходы,
        белые: з.белые ?? п.белые,
        чёрные: з.чёрные ?? п.чёрные,
        событие: з.событие ?? п.событие,
        дата: з.дата || п.дата,
        результат: з.результат || результатПоПозиции(доскаНа({ ходы: итог.ходы }, итог.ходы.length)) || '*'
    });

    if (итог.ошибка) {
        const о = итог.ошибка;
        const номер = Math.ceil(о.полуход / 2);
        const кто = о.полуход % 2 === 1 ? 'белых' : 'чёрных';
        с.ошибка = `Ход ${номер} ${кто} «${о.текст}»: ${о.причина}. Взяты первые ${итог.ходы.length} полуходов — допишите остальное вручную.`;
        с.сообщение = '';
    } else {
        с.ошибка = '';
        с.сообщение = `Взято ходов: ${Math.ceil(итог.ходы.length / 2)}.`;
        с.вставка = false;
        с.текстВставки = '';
    }

    app.render();
});

actions.on('к-разбору', () => {
    const п = партия();
    if (п?.ходы.length) app.go('разбор', п.id);
});

actions.on('копировать-pgn', async () => {
    const п = партия();
    if (!п) return;

    const pgn = вPGN(п);

    try {
        await navigator.clipboard.writeText(pgn);
        с.сообщение = 'PGN скопирован — его понимают lichess и chess.com.';
    } catch {
        // Буфер обмена недоступен (нет https или разрешения) — покажем текст
        с.вставка = true;
        с.текстВставки = pgn;
        с.сообщение = 'Скопировать не вышло — PGN в поле ниже, выделите его вручную.';
    }

    app.render();
});

actions.on('удалить-партию', () => {
    const п = партия();
    if (!п) return;
    if (п.ходы.length && !confirm('Удалить партию? Вернуть её будет нельзя.')) return;

    хранилище.удалить(п.id);
    app.go('архив');
});

// ================== ПРАВКА ХОДА (Р-29) ==================

actions.on('править-ход', (el) => {
    const п = партия();
    const ply = Number(el.dataset.ply) || 0;
    if (!п || ply < 1 || ply > п.ходы.length) return;

    с.правка = с.правка === ply ? null : ply;
    с.выбрано = null;
    с.превращение = null;
    с.ошибка = '';
    с.фокусПравки = !!с.правка;
    app.render();
});

actions.onSubmit('заменить-ход', (форма) => {
    const п = партия();
    const поле = форма.querySelector('input[name="ход"]');
    const текст = поле.value.trim();
    if (!п || !с.правка || !текст) return;

    const найдено = найтиХод(доскаВвода(п), текст);

    if (!найдено.ход) {
        с.ошибка = найдено.ошибка;
        с.фокусПравки = true;
        app.render();
        const новое = document.getElementById('edit-input');
        if (новое) новое.value = текст;
        return;
    }

    применитьПравку(п, найдено.ход.san);
    app.render();
});

actions.on('удалить-с-хода', () => {
    const п = партия();
    if (!п || !с.правка) return;

    const ply = с.правка;
    const былПозицией = результатПоПозиции(доскаНа(п, п.ходы.length)) === п.результат;

    с.откат = { ходы: п.ходы, результат: п.результат };
    хранилище.сохранить({ ...п, ходы: п.ходы.slice(0, ply - 1), результат: былПозицией ? '*' : п.результат });

    с.правка = null;
    с.выбрано = null;
    с.ошибка = '';
    с.сообщение = `Ходы с ${номерХода(ply)} удалены (${п.ходы.length - ply + 1}).`;
    app.render();
});

actions.on('отменить-правку', () => {
    с.правка = null;
    с.выбрано = null;
    с.превращение = null;
    с.ошибка = '';
    app.render();
});

actions.on('вернуть-правку', () => {
    const п = партия();
    if (!п || !с.откат) return;

    хранилище.сохранить({ ...п, ходы: с.откат.ходы, результат: с.откат.результат });
    с.откат = null;
    с.сообщение = 'Вернул как было.';
    app.render();
});
