/**
 * Свободная доска: доигрыш движком и расстановка позиции (Р-31).
 *
 * Сюда приходят с позицией в адресе: из разбора («Доиграть отсюда»), с
 * экрана ввода («Доиграть движком»), из архива («Свободная доска») или на
 * расстановку («расстановка»). Движок играет за обе стороны до конца;
 * ходы появляются по мере счёта и листаются. Свой ход на доске обрезает
 * доигрыш на этом месте — и с него можно доиграть снова.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { иконка } from '../core/icons.js';
import { хранилище } from '../core/store.js';
import { Chess } from '../core/chess.js';
import { показатьХод } from '../core/notation.js';
import { нарисоватьДоску, полеШаха, расстановка as изFen, ФИГУРЫ as ПУТЬ_ФИГУР } from '../core/board.js';
import { движок } from '../core/engine.js';
import { доиграть, вFen, проверитьРасстановку, итогДоигрыша, НАЧАЛО, ПРЕДЕЛ_ПОЛУХОДОВ } from '../core/playout.js';
import { шкала } from './review.js';

const { html, raw } = ui;

/** Глубина доигрыша: сотня ходов на телефоне — около минуты, а не пяти. */
const ГЛУБИНА = 12;

const с = {
    ключ: null,
    режим: 'игра',        // игра | расстановка
    старт: НАЧАЛО,
    ходы: [],             // { san, from, to, fen, оценка }
    шаг: 0,               // сколько ходов показано
    идёт: false,
    отменён: false,
    итог: null,
    расстановка: {},
    очередь: 'w',
    инструмент: 'wQ',
    ошибка: '',
    сторона: 'w',
    выбрано: null
};

function сбросить(ключ) {
    const расстановка = ключ === 'расстановка';
    let старт = НАЧАЛО;

    if (!расстановка && ключ) {
        try {
            new Chess(ключ);
            старт = ключ;
        } catch {
            старт = НАЧАЛО;
        }
    }

    Object.assign(с, {
        ключ, режим: расстановка ? 'расстановка' : 'игра', старт, ходы: [], шаг: 0,
        идёт: false, отменён: false, итог: null, ошибка: '', выбрано: null,
        расстановка: изFen(расстановка ? НАЧАЛО : старт), очередь: new Chess(старт).turn(),
        сторона: new Chess(старт).turn()
    });
}

/** Доска в показанном месте доигрыша — с историей ходов (ради повторений). */
function доскаНаШаге() {
    const доска = new Chess(с.старт);
    for (const х of с.ходы.slice(0, с.шаг)) доска.move(х.san);
    return доска;
}

async function запуститьДоигрыш() {
    if (с.идёт) return;

    // Доигрываем с показанного места: всё, что дальше, отбрасывается
    с.ходы = с.ходы.slice(0, с.шаг);
    с.итог = null;
    с.идёт = true;
    с.отменён = false;
    const ключ = с.ключ;
    app.render();

    try {
        const р = await доиграть(с.старт, движок(), {
            глубина: Math.min(ГЛУБИНА, хранилище.настройки().глубина),
            предыдущие: с.ходы.map((х) => х.san),
            отменён: () => с.отменён || с.ключ !== ключ,
            наХод: (запись) => {
                if (с.ключ !== ключ) return;
                // Показ идёт за доигрышем, если человек не ушёл листать назад
                const наКонце = с.шаг === с.ходы.length;
                с.ходы.push(запись);
                if (наКонце) с.шаг = с.ходы.length;
                if (app.route.name === 'доска') app.render({ фон: true });
            }
        });
        if (с.ключ === ключ) с.итог = р.итог;
    } catch (e) {
        if (с.ключ === ключ) с.ошибка = `Движок не справился: ${e.message || e}`;
    } finally {
        if (с.ключ === ключ) с.идёт = false;
        if (app.route.name === 'доска' && с.ключ === ключ) app.render();
    }
}

// ================== ЧАСТИ ЭКРАНА ==================

function списокХодов(нотация) {
    if (!с.ходы.length) return '';

    const номер0 = Number(с.старт.split(' ')[5]) || 1;
    const чёрныеПервые = с.старт.split(' ')[1] === 'b';

    return html`
        <div class="free-moves">
            ${с.ходы.map((х, i) => {
                const полуход = i + (чёрныеПервые ? 1 : 0);
                const номер = номер0 + Math.floor(полуход / 2);
                const подпись = полуход % 2 === 0 ? `${номер}.` : (i === 0 ? `${номер}…` : '');
                return html`${подпись ? html`<span class="mv-num">${подпись}</span>` : ''}<button class="var-mv ${i + 1 === с.шаг ? 'on' : ''}" data-action="доска-шаг" data-step="${i + 1}">${показатьХод(х.san, нотация)}</button>`;
            })}
        </div>
    `;
}

function экранИгры(нотация) {
    const доска = доскаНаШаге();
    const х = с.ходы[с.шаг - 1];
    const цели = с.выбрано && !с.идёт ? доска.moves({ square: с.выбрано, verbose: true }).map((м) => м.to) : [];
    const конецЗдесь = итогДоигрыша(доска);

    return html`
        <div class="layout">
            <div class="board-col">
                <div class="board-row">
                    ${шкала(х?.оценка || null, с.сторона === 'b')}
                    <div class="board-wrap">
                        ${raw(нарисоватьДоску({
                            fen: доска.fen(),
                            сторона: с.сторона,
                            последний: х ? { from: х.from, to: х.to } : null,
                            выбрано: с.выбрано,
                            цели,
                            шах: полеШаха(доска),
                            нажимаемая: !с.идёт,
                            действие: 'доска-клетка'
                        }))}
                    </div>
                </div>
                <nav class="nav-row" aria-label="Листать доигрыш">
                    <button class="nav-btn" data-action="доска-в-начало" data-key="home arrowup" aria-label="В начало">${raw(иконка('начало'))}</button>
                    <button class="nav-btn" data-action="доска-назад" data-key="arrowleft" aria-label="Назад">${raw(иконка('влево'))}</button>
                    <button class="nav-btn" data-action="доска-вперёд" data-key="arrowright" aria-label="Вперёд">${raw(иконка('вправо'))}</button>
                    <button class="nav-btn" data-action="доска-в-конец" data-key="end arrowdown" aria-label="В конец">${raw(иконка('конец'))}</button>
                </nav>
            </div>

            <div class="panel-col">
                <section class="card">
                    ${с.идёт ? html`
                        <div class="progress-head"><span>Движок доигрывает партию</span><span class="muted">${с.ходы.length} пол.</span></div>
                        <div class="progress"><div class="progress-bar indeterminate"></div></div>
                        <div class="row-actions"><button class="btn" data-action="доска-стоп">Остановить</button></div>
                    ` : html`
                        <button class="btn primary big" data-action="доиграть" ${конецЗдесь ? 'disabled' : ''}>${raw(иконка('играть'))} ${с.шаг < с.ходы.length ? 'Доиграть движком отсюда' : 'Доиграть движком'}</button>
                        <p class="muted small">Движок сыграет за обе стороны до мата, ничьей или ${ПРЕДЕЛ_ПОЛУХОДОВ} полуходов. Можно сделать свой ход на доске — и доиграть уже от него.</p>
                        <div class="row-actions">
                            <button class="btn ghost" data-action="доска-расставить">${raw(иконка('править'))} Расставить позицию</button>
                            <button class="btn ghost" data-action="доска-перевернуть">${raw(иконка('перевернуть'))} Перевернуть</button>
                        </div>
                    `}
                    ${с.итог && !с.идёт ? html`<p class="form-note"><b>${с.итог.текст}</b></p>` : ''}
                    ${конецЗдесь && !с.итог ? html`<p class="form-note"><b>${конецЗдесь.текст}</b></p>` : ''}
                    ${с.ошибка ? html`<p class="form-error">${с.ошибка}</p>` : ''}
                </section>

                ${с.ходы.length ? html`
                    <section class="card">
                        <h2 class="card-title">Ходы доигрыша</h2>
                        ${списокХодов(нотация)}
                    </section>
                ` : ''}
            </div>
        </div>
    `;
}

const ПАЛИТРА = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

function экранРасстановки() {
    const fen = вFen(с.расстановка, с.очередь);

    return html`
        <div class="layout">
            <div class="board-col">
                <div class="board-wrap">
                    ${raw(нарисоватьДоску({ fen, сторона: с.сторона, нажимаемая: true, действие: 'расстановка-клетка' }))}
                </div>
            </div>

            <div class="panel-col">
                <section class="card">
                    <h2 class="card-title">Расстановка</h2>
                    <p class="small muted">Выберите фигуру и нажимайте на клетки. Нажатие той же фигурой на занятую ею клетку — убирает.</p>
                    <div class="palette">
                        ${ПАЛИТРА.map((ф) => html`
                            <button class="palette-btn ${с.инструмент === ф ? 'on' : ''}" data-action="расстановка-фигура" data-piece="${ф}" aria-label="${ф}">
                                <img src="${ПУТЬ_ФИГУР}${ф}.svg" alt="">
                            </button>
                        `)}
                        <button class="palette-btn erase ${с.инструмент === 'стереть' ? 'on' : ''}" data-action="расстановка-фигура" data-piece="стереть" aria-label="Стереть">${raw(иконка('удалить'))}</button>
                    </div>

                    <div class="choice-row turn-row">
                        <span class="small">Ход:</span>
                        <button class="btn small ${с.очередь === 'w' ? 'primary' : ''}" data-action="расстановка-очередь" data-side="w">белых</button>
                        <button class="btn small ${с.очередь === 'b' ? 'primary' : ''}" data-action="расстановка-очередь" data-side="b">чёрных</button>
                    </div>

                    <div class="row-actions">
                        <button class="btn ghost" data-action="расстановка-начальная">Начальная</button>
                        <button class="btn ghost" data-action="расстановка-очистить">Очистить</button>
                    </div>

                    ${с.ошибка ? html`<p class="form-error" role="alert">${с.ошибка}</p>` : ''}
                    <button class="btn primary big" data-action="расстановка-готово">Готово — к доигрышу</button>
                </section>
            </div>
        </div>
    `;
}

export const свободнаяДоска = {

    render(ключ) {
        if (с.ключ !== ключ) сбросить(ключ);
        const { нотация } = хранилище.настройки();

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="доска-назад-экран" aria-label="Назад" title="Назад">${raw(иконка('назад'))}</button>
                <h1>${с.режим === 'расстановка' ? 'Расстановка позиции' : 'Свободная доска'}</h1>
            </header>
            ${с.режим === 'расстановка' ? экранРасстановки() : экранИгры(нотация)}
        `;
    },

    leave() {
        с.отменён = true;
    }
};

// ================== ДЕЙСТВИЯ: ИГРА ==================

function шагнуть(куда) {
    с.шаг = Math.max(0, Math.min(с.ходы.length, куда(с.шаг, с.ходы.length)));
    с.выбрано = null;
    app.render();
}

actions.on('доска-назад', () => шагнуть((i) => i - 1));
actions.on('доска-вперёд', () => шагнуть((i) => i + 1));
actions.on('доска-в-начало', () => шагнуть(() => 0));
actions.on('доска-в-конец', () => шагнуть((_, n) => n));
actions.on('доска-шаг', (el) => шагнуть(() => Number(el.dataset.step) || 0));

actions.on('доиграть', () => запуститьДоигрыш());

actions.on('доска-стоп', () => {
    с.отменён = true;
    app.render();
});

actions.on('доска-перевернуть', () => {
    с.сторона = с.сторона === 'w' ? 'b' : 'w';
    app.render();
});

/** Свой ход на доске: доигрыш обрезается на показанном месте, ход дописывается. */
actions.on('доска-клетка', (el) => {
    if (с.идёт) return;
    const поле = el.dataset.square;
    const доска = доскаНаШаге();

    if (с.выбрано) {
        const ход = доска.moves({ square: с.выбрано, verbose: true })
            .find((м) => м.to === поле && (!м.promotion || м.promotion === 'q'));

        if (ход) {
            доска.move(ход.san);
            с.ходы = [...с.ходы.slice(0, с.шаг), { san: ход.san, from: ход.from, to: ход.to, fen: доска.fen(), оценка: null }];
            с.шаг = с.ходы.length;
            с.итог = null;
            с.выбрано = null;
            return app.render();
        }
    }

    const фигура = доска.get(поле);
    с.выбрано = фигура && фигура.color === доска.turn() && поле !== с.выбрано ? поле : null;
    app.render();
});

actions.on('доска-расставить', () => {
    с.отменён = true;
    с.расстановка = изFen(доскаНаШаге().fen());
    с.очередь = доскаНаШаге().turn();
    с.режим = 'расстановка';
    с.ошибка = '';
    app.render();
});

actions.on('доска-назад-экран', () => history.length > 1 ? history.back() : app.go('архив'));

// ================== ДЕЙСТВИЯ: РАССТАНОВКА ==================

actions.on('расстановка-фигура', (el) => {
    с.инструмент = el.dataset.piece;
    app.render();
});

actions.on('расстановка-клетка', (el) => {
    const поле = el.dataset.square;
    if (с.инструмент === 'стереть' || с.расстановка[поле] === с.инструмент) delete с.расстановка[поле];
    else с.расстановка[поле] = с.инструмент;
    с.ошибка = '';
    app.render();
});

actions.on('расстановка-очередь', (el) => {
    с.очередь = el.dataset.side === 'b' ? 'b' : 'w';
    app.render();
});

actions.on('расстановка-начальная', () => {
    с.расстановка = изFen(НАЧАЛО);
    с.очередь = 'w';
    с.ошибка = '';
    app.render();
});

actions.on('расстановка-очистить', () => {
    с.расстановка = {};
    с.ошибка = '';
    app.render();
});

actions.on('расстановка-готово', () => {
    const причина = проверитьРасстановку(с.расстановка, с.очередь);
    if (причина) {
        с.ошибка = причина;
        return app.render();
    }

    с.старт = вFen(с.расстановка, с.очередь);
    с.ходы = [];
    с.шаг = 0;
    с.итог = null;
    с.режим = 'игра';
    с.сторона = с.очередь;
    с.ошибка = '';
    app.render();
});
