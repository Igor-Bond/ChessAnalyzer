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
import { доскаНа, разобратьТекст, вPGN, результатПоПозиции, партияОкончена } from '../core/game.js';
import { найтиХод, показатьХод, НОТАЦИИ } from '../core/notation.js';
import { нарисоватьДоску, полеШаха } from '../core/board.js';

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
    фокус: false
};

function сбросить(id) {
    Object.assign(с, {
        id, выбрано: null, превращение: null, ошибка: '', сообщение: '',
        вставка: false, текстВставки: '', сторона: 'w', фокус: false
    });
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
}

function списокХодов(п, нотация) {
    if (!п.ходы.length) return html`<p class="muted small">Ходов пока нет. Начните с первого хода белых.</p>`;

    const пары = [];
    for (let i = 0; i < п.ходы.length; i += 2) {
        пары.push(html`
            <li>
                <span class="mv-num">${i / 2 + 1}.</span>
                <span class="mv">${показатьХод(п.ходы[i], нотация)}</span>
                <span class="mv">${п.ходы[i + 1] ? показатьХод(п.ходы[i + 1], нотация) : ''}</span>
            </li>
        `);
    }

    return html`<ol class="moves-compact">${пары}</ol>`;
}

function выборПревращения(цвет) {
    const фигуры = ['q', 'r', 'b', 'n'];

    return html`
        <div class="promo" role="group" aria-label="Во что превратить пешку">
            <span>Превратить в:</span>
            ${фигуры.map((ф) => html`
                <button class="promo-btn" data-action="превратить" data-piece="${ф}">
                    <img src="assets/pieces/${цвет}${ф.toUpperCase()}.svg" alt="${ф}">
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
        const доска = доскаНа(п, п.ходы.length);
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

                    <section class="card">
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
                            ${с.сообщение ? html`<p class="form-note">${с.сообщение}</p>` : ''}
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
    }
};

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
    const доска = доскаНа(п, п.ходы.length);

    if (с.выбрано) {
        const ходы = доска.moves({ square: с.выбрано, verbose: true }).filter((х) => х.to === поле);

        if (ходы.length) {
            if (ходы.some((х) => х.promotion)) {
                с.превращение = { from: с.выбрано, to: поле };
            } else {
                сделатьХод(п, ходы[0].san);
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

    const доска = доскаНа(п, п.ходы.length);
    const ход = доска.moves({ verbose: true }).find((х) =>
        х.from === с.превращение.from && х.to === с.превращение.to && х.promotion === el.dataset.piece);

    if (ход) сделатьХод(п, ход.san);
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

    хранилище.сохранить({ ...п, ходы: п.ходы.slice(0, -1), результат: '*' });
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
