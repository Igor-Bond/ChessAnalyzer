/**
 * Разбор партии.
 *
 * Открывается сразу, даже если движок ещё считает: оцененные позиции
 * показываются по мере готовности, график растёт слева направо. Ждать
 * минуту перед пустым экраном — худшее, что можно сделать с человеком,
 * который только что сыграл и хочет посмотреть свой зевок на двадцатом ходу.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { иконка } from '../core/icons.js';
import { хранилище } from '../core/store.js';
import { номерХода } from '../core/game.js';
import { показатьХод } from '../core/notation.js';
import { нарисоватьДоску, полеШаха } from '../core/board.js';
import { Chess } from '../core/chess.js';
import { движок } from '../core/engine.js';
import { разобратьПартию, разборПолон, разборПредварительный } from '../core/analyze.js';
import { собратьРазбор } from '../core/report.js';
import { КЛАССЫ, СТАДИИ, шансыБелых, показатьОценку } from '../core/review.js';
import { подсказка, линияВSan } from '../core/explain.js';
import { открытьПравку } from './entry.js';

const { html, raw } = ui;

const с = {
    id: null,
    полуход: 0,
    сторона: 'w',
    вариант: null,        // { основа: fen, ходы: [{san, from, to, fen}], шаг, подпись }
    ошибка: ''
};

function сбросить(id) {
    Object.assign(с, { id, полуход: 0, сторона: 'w', вариант: null, ошибка: '' });
}

// ================== ДВИЖОК ==================

/**
 * Текущий прогон движка — отдельным заданием со своей партией.
 *
 * Раньше «идёт разбор» было одним флагом на экран. Уйти в архив и открыть
 * другую партию, пока первая досчитывала позицию, значило застрять: флаг
 * ещё стоял, вторая партия не начинала разбор, а первая, закончив, не
 * перерисовывала чужой экран. Теперь у задания своя партия и своя отмена:
 * чужое задание экран не держит, а новое отменяет старое и становится
 * в очередь движка следом за ним.
 */
let работа = null;        // { id, отменён, готово, всего }

/** Партия, чей прогон кончился, а разбор остался неполным: сам не перезапускаем. */
let неДоделан = null;

function идётЗдесь() {
    return !!работа && работа.id === с.id && !работа.отменён;
}

async function запуститьРазбор(п) {
    if (работа && работа.id === п.id && !работа.отменён) return;
    if (работа) работа.отменён = true;

    const моя = работа = { id: п.id, отменён: false, готово: 0, всего: 0, этап: 'быстро' };
    с.ошибка = '';

    const { глубина } = хранилище.настройки();
    const наЭкране = () => app.route.name === 'разбор' && с.id === моя.id;

    // Карточка хода работы — сразу, а не после первой посчитанной позиции:
    // иначе весь запуск движка (в первый раз — скачивание двух мегабайт)
    // на экране висела карточка «Разбор ещё не делался» с кнопкой «Разобрать»
    queueMicrotask(() => {
        if (наЭкране() && работа === моя) app.render({ фон: true });
    });

    /*
     * Перерисовка не чаще раза в 0,4 с.
     *
     * Позиция теперь считается за десятую долю секунды, и перерисовка
     * экрана на каждую съедала бы нажатия: щелчок, начатый на кнопке, ко
     * времени отпускания приходился бы на уже заменённую кнопку. Последнее
     * состояние всё равно рисуется — отложенно.
     */
    let нарисовано = 0;
    let отложено = null;
    const перерисовать = () => {
        if (!наЭкране()) return;
        const прошло = Date.now() - нарисовано;
        if (прошло >= 400) {
            нарисовано = Date.now();
            app.render({ фон: true });
        } else if (!отложено) {
            отложено = setTimeout(() => {
                отложено = null;
                нарисовано = Date.now();
                if (наЭкране()) app.render({ фон: true });
            }, 400 - прошло);
        }
    };

    try {
        await разобратьПартию(п, движок(), {
            глубина,
            отменён: () => моя.отменён,
            наПрогресс: (готово, всего, этап) => {
                моя.готово = готово;
                моя.всего = всего;
                моя.этап = этап;
            },
            наПозицию: (разбор) => {
                if (моя.отменён) return;
                хранилище.сохранитьРазбор(моя.id, разбор);
                перерисовать();
            }
        });
    } catch (e) {
        console.error('[Разбор]', e);
        if (!моя.отменён && с.id === моя.id) с.ошибка = `Движок не справился: ${e.message || e}`;
    } finally {
        if (работа === моя) работа = null;

        // Прогон кончился, а разбор всё ещё неполон — второй раз сам не
        // запускаем: иначе любая такая ошибка превращается в бесконечный
        // перезапуск. Остаётся кнопка «Продолжить разбор»
        const п_ = хранилище.партия(моя.id);
        if (!моя.отменён && п_ && !разборПолон(п_)) неДоделан = моя.id;

        if (наЭкране()) app.render();
    }
}

// ================== ЧАСТИ ЭКРАНА ==================

function шкала(оценка) {
    const белых = оценка ? шансыБелых(оценка) : 50;
    const текст = оценка ? показатьОценку(оценка) : '';

    // На узкой шкале помещается три знака: «4.3», «M3» — знак числа и так
    // виден по тому, с какого края стоит подпись
    const кратко = !оценка ? ''
        : оценка.мат !== undefined && оценка.мат !== null ? (оценка.мат ? `M${Math.abs(оценка.мат)}` : '#')
        : (Math.abs(оценка.cp || 0) / 100).toFixed(1);
    const сверхуБелые = с.сторона === 'b';

    return html`
        <div class="evalbar ${сверхуБелые ? 'flipped' : ''}" aria-label="Оценка ${текст}">
            <div class="evalbar-white" style="height:${белых.toFixed(1)}%"></div>
            <span class="evalbar-text ${белых >= 50 ? 'for-white' : 'for-black'}">${кратко}</span>
        </div>
    `;
}

/**
 * График шансов белых по ходам.
 *
 * Белая область снизу — шансы белых, тёмная сверху — чёрных; середина —
 * равенство. Ошибки и зевки отмечены точками их цвета, чтобы переломы
 * партии находились взглядом, не читая списка ходов.
 */
function график(р) {
    const Ш = 600;
    const В = 120;
    const n = р.поз.length - 1;
    if (n < 1 || !р.оценки.length) return '';

    const x = (i) => (i / n) * Ш;
    const y = (о) => В * (1 - шансыБелых(о) / 100);

    const точки = р.оценки.map((о, i) => `${x(i).toFixed(1)},${y(о.оценка).toFixed(1)}`);
    const последний = x(р.оценки.length - 1).toFixed(1);
    const область = `M0,${В} L${точки.join(' L')} L${последний},${В} Z`;

    const отметки = р.ходы
        .filter((х) => ['неточность', 'ошибка', 'зевок'].includes(х.класс))
        .map((х) => `<circle class="gdot gdot-${х.класс}" cx="${x(х.полуход).toFixed(1)}" cy="${y(х.оценкаПосле).toFixed(1)}" r="4.5"/>`);

    const мишени = [];
    for (let i = 0; i <= n; i++) {
        const ширина = Ш / n;
        мишени.push(`<rect class="ghit" x="${(x(i) - ширина / 2).toFixed(1)}" y="0" width="${ширина.toFixed(1)}" height="${В}" data-action="к-ходу" data-ply="${i}"/>`);
    }

    const сейчас = x(с.полуход).toFixed(1);

    return raw(`
        <svg class="graph" viewBox="0 0 ${Ш} ${В}" preserveAspectRatio="none" role="img" aria-label="График оценки по ходам">
            <rect class="graph-bg" x="0" y="0" width="${Ш}" height="${В}"/>
            <path class="graph-area" d="${область}"/>
            <line class="graph-mid" x1="0" y1="${В / 2}" x2="${Ш}" y2="${В / 2}"/>
            <line class="graph-now" x1="${сейчас}" y1="0" x2="${сейчас}" y2="${В}"/>
            ${отметки.join('')}
            ${мишени.join('')}
        </svg>
    `);
}

function процент(з) {
    return з === null || з === undefined ? '—' : з.toFixed(1);
}

function плашкаИгрока(имя, сторона, р) {
    const т = р?.сводка?.[сторона]?.точность;
    return html`
        <div class="player-plate">
            <span class="side-dot ${сторона}"></span>
            <span class="player-name">${имя || (сторона === 'w' ? 'Белые' : 'Чёрные')}</span>
            ${т !== undefined && т !== null ? html`<span class="player-acc" title="Точность">${процент(т)}%</span>` : ''}
        </div>
    `;
}

function карточкаХода(п, р, нотация) {
    if (с.вариант) {
        const в = с.вариант;
        const ходы = в.ходы.map((х, i) => html`
            <button class="var-mv ${i + 1 === в.шаг ? 'on' : ''}" data-action="шаг-варианта" data-step="${i + 1}">${показатьХод(х.san, нотация)}</button>
        `);

        return html`
            <section class="card move-card variation">
                <div class="move-head">
                    <span class="badge-pill badge-лучший">${raw(иконка('играть'))}</span>
                    <div>
                        <div class="move-title">${в.подпись}</div>
                        <div class="muted small">Ход ${в.шаг} из ${в.ходы.length} · стрелки листают вариант</div>
                    </div>
                </div>
                <div class="var-line">${ходы}</div>
                <button class="btn ghost" data-action="выйти-из-варианта" data-key="escape">Вернуться к партии</button>
            </section>
        `;
    }

    if (с.полуход === 0) {
        return html`
            <section class="card move-card">
                <div class="move-title">Начальная позиция</div>
                <p class="muted">Листайте партию стрелками или нажмите на ход в списке. На графике видно, где партия переломилась.</p>
            </section>
        `;
    }

    const х = р?.ходы[с.полуход - 1];
    const san = п.ходы[с.полуход - 1];
    const подпись = `${номерХода(с.полуход)} ${показатьХод(san, нотация)}`;

    if (!х) {
        return html`
            <section class="card move-card">
                <div class="move-title">${подпись}</div>
                <p class="muted">Движок ещё не дошёл до этого хода.</p>
            </section>
        `;
    }

    const п_ = подсказка(х, р.поз[с.полуход - 1].fen, р.поз[с.полуход].fen, нотация);
    const показатьЛучший = !['лучший', 'единственный', 'вынужденный'].includes(х.класс) && х.линияЛучшего.length;

    return html`
        <section class="card move-card">
            <div class="move-head">
                <span class="badge-pill badge-${х.класс}">${п_.знак}</span>
                <div>
                    <div class="move-title">${подпись} <span class="cls cls-${х.класс}">${п_.заголовок}</span></div>
                    <div class="muted small">Оценка ${показатьОценку(х.оценкаПосле)}${х.точность !== null ? ` · точность хода ${Math.round(х.точность)}%` : ''}</div>
                </div>
            </div>
            <p class="move-text">${п_.текст}</p>
            <button class="btn ghost small fix-move" data-action="исправить-ход">${raw(иконка('править'))} Исправить ход</button>

            ${показатьЛучший ? html`
                <div class="line-box">
                    <div class="line-label">Лучше было</div>
                    <div class="line-text">${п_.лучшийТекстом}</div>
                    <button class="btn small" data-action="вариант" data-kind="лучший">${raw(иконка('играть'))} Показать на доске</button>
                </div>
            ` : ''}

            ${х.ответ.length && ['неточность', 'ошибка', 'зевок'].includes(х.класс) ? html`
                <div class="line-box threat">
                    <div class="line-label">Чем это наказывается</div>
                    <div class="line-text">${п_.ответТекстом}</div>
                    <button class="btn small" data-action="вариант" data-kind="ответ">${raw(иконка('играть'))} Показать</button>
                </div>
            ` : ''}
        </section>
    `;
}

function сводкаКарточка(п, р) {
    if (!р?.ходы.length) return '';

    const { w, b } = р.сводка;
    const строки = ['единственный', 'лучший', 'отличный', 'хороший', 'неточность', 'ошибка', 'зевок'];

    return html`
        <section class="card summary">
            <h2 class="card-title">Качество игры${р.полный ? '' : разборПредварительный(п.разбор) ? ' · предварительно, уточняется' : ' · пока по части партии'}</h2>
            <div class="acc-row">
                <div class="acc-box w">
                    <div class="acc-name">${п.белые || 'Белые'}</div>
                    <div class="acc-val">${процент(w.точность)}<small>%</small></div>
                    <div class="acc-sub">средняя потеря ${w.средняяПотеря ?? '—'}</div>
                </div>
                <div class="acc-box b">
                    <div class="acc-name">${п.чёрные || 'Чёрные'}</div>
                    <div class="acc-val">${процент(b.точность)}<small>%</small></div>
                    <div class="acc-sub">средняя потеря ${b.средняяПотеря ?? '—'}</div>
                </div>
            </div>

            <table class="cls-table">
                ${строки.map((к) => html`
                    <tr>
                        <td class="n">${w.классы[к]}</td>
                        <td class="cls-name"><span class="badge-pill tiny badge-${к}">${КЛАССЫ[к].знак}</span>${КЛАССЫ[к].кратко}</td>
                        <td class="n">${b.классы[к]}</td>
                    </tr>
                `)}
            </table>

            <h3 class="sub-title">По стадиям партии</h3>
            <table class="phase-table">
                ${СТАДИИ.map((ст) => html`
                    <tr>
                        <td class="n">${w.стадии[ст] ? процент(w.стадии[ст].точность) : '—'}</td>
                        <td class="cls-name">${ст}</td>
                        <td class="n">${b.стадии[ст] ? процент(b.стадии[ст].точность) : '—'}</td>
                    </tr>
                `)}
            </table>
            <p class="muted small">Точность — по формуле lichess: сто процентов значит, что каждый ход совпал с движком или почти не уступал ему. Средняя потеря — в сотых пешки за ход.</p>

            ${р.полный && п.разбор.глубина !== хранилище.настройки().глубина && !идётЗдесь() ? html`
                <button class="btn small" data-action="повторить-разбор">Пересчитать на глубине ${хранилище.настройки().глубина} (сейчас ${п.разбор.глубина})</button>
            ` : ''}
        </section>
    `;
}

function переломыКарточка(р, нотация) {
    if (!р?.переломы.length) return '';

    return html`
        <section class="card">
            <h2 class="card-title">Переломные моменты</h2>
            <ul class="key-list">
                ${р.переломы.map((х) => html`
                    <li>
                        <button class="key-item" data-action="к-ходу" data-ply="${х.полуход}">
                            <span class="badge-pill tiny badge-${х.класс}">${КЛАССЫ[х.класс].знак}</span>
                            <b>${номерХода(х.полуход)} ${показатьХод(х.san, нотация)}</b>
                            <span class="muted">${КЛАССЫ[х.класс].кратко}, −${Math.round(х.потеря)}% шансов</span>
                        </button>
                    </li>
                `)}
            </ul>
        </section>
    `;
}

function списокХодов(п, р, нотация) {
    const ячейка = (i) => {
        const san = п.ходы[i];
        if (!san) return html`<td></td>`;
        const х = р?.ходы[i];
        const пл = i + 1;

        return html`
            <td>
                <button class="mv-btn ${пл === с.полуход && !с.вариант ? 'on' : ''} ${х ? `mv-${х.класс}` : ''}" data-action="к-ходу" data-ply="${пл}">
                    ${показатьХод(san, нотация)}${х && ['неточность', 'ошибка', 'зевок', 'единственный'].includes(х.класс) ? html`<sup>${КЛАССЫ[х.класс].знак}</sup>` : ''}
                </button>
            </td>
        `;
    };

    const строки = [];
    for (let i = 0; i < п.ходы.length; i += 2) {
        строки.push(html`<tr><td class="mv-num">${i / 2 + 1}.</td>${ячейка(i)}${ячейка(i + 1)}</tr>`);
    }

    return html`
        <section class="card">
            <h2 class="card-title">Ходы <span class="muted small">${п.результат !== '*' ? п.результат : ''}</span></h2>
            <table class="moves-table">${строки}</table>
        </section>
    `;
}

// ================== ЭКРАН ==================

export const разборЭкран = {

    render(id) {
        if (с.id !== id) сбросить(id);

        const п = хранилище.партия(id);
        if (!п) {
            return html`
                <header class="topbar">
                    <button class="icon-btn" data-action="в-архив" aria-label="Назад">${raw(иконка('назад'))}</button>
                    <h1>Партия не найдена</h1>
                </header>
            `;
        }

        const { нотация } = хранилище.настройки();
        const р = собратьРазбор(п);
        const n = п.ходы.length;
        с.полуход = Math.max(0, Math.min(с.полуход, n));

        // Позиция на доске: из варианта, если он открыт, иначе из партии
        let fen;
        let последний = null;
        let стрелки = [];
        let значок = null;
        let оценка = null;

        if (с.вариант) {
            const в = с.вариант;
            const х = в.ходы[в.шаг - 1];
            fen = х ? х.fen : в.основа;
            последний = х ? { from: х.from, to: х.to } : null;
            const следующий = в.ходы[в.шаг];
            if (следующий) стрелки = [{ from: следующий.from, to: следующий.to, вид: 'next' }];
        } else {
            const доска = new Chess();
            let ход = null;
            for (const san of п.ходы.slice(0, с.полуход)) ход = доска.move(san);
            fen = доска.fen();
            последний = ход ? { from: ход.from, to: ход.to } : null;

            const х = р?.ходы[с.полуход - 1];
            if (х && ход) {
                значок = { поле: ход.to, класс: х.класс, знак: КЛАССЫ[х.класс].знак };

                if (!['лучший', 'единственный', 'вынужденный'].includes(х.класс) && х.лучший) {
                    стрелки.push({ from: х.лучший.slice(0, 2), to: х.лучший.slice(2, 4), вид: 'best' });
                }
            }

            оценка = р?.оценки[с.полуход]?.оценка || null;
        }

        const доскаДляШаха = new Chess(fen);

        const верх = с.сторона === 'w' ? 'b' : 'w';
        const низ = с.сторона;
        const имя = (ст) => (ст === 'w' ? п.белые : п.чёрные);

        const заголовок = `${п.белые || 'Белые'} — ${п.чёрные || 'Чёрные'}`;
        const надоРазбирать = !разборПолон(п);

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="в-архив" aria-label="В архив" title="В архив">${raw(иконка('назад'))}</button>
                <h1 class="ellipsis">${заголовок}</h1>
                <button class="icon-btn" data-action="перевернуть" data-key="f" aria-label="Перевернуть доску" title="Перевернуть (F)">${raw(иконка('перевернуть'))}</button>
                <button class="icon-btn" data-action="править" aria-label="Править ходы" title="Править ходы">${raw(иконка('править'))}</button>
            </header>

            <div class="layout">
                <div class="board-col">
                    ${плашкаИгрока(имя(верх), верх, р)}
                    <div class="board-row">
                        ${шкала(оценка)}
                        <div class="board-wrap">
                            ${raw(нарисоватьДоску({ fen, сторона: с.сторона, последний, стрелки, значок, шах: полеШаха(доскаДляШаха) }))}
                        </div>
                    </div>
                    ${плашкаИгрока(имя(низ), низ, р)}

                    <nav class="nav-row" aria-label="Листать партию">
                        <button class="nav-btn" data-action="в-начало" data-key="home arrowup" aria-label="В начало">${raw(иконка('начало'))}</button>
                        <button class="nav-btn" data-action="назад" data-key="arrowleft" aria-label="Ход назад">${raw(иконка('влево'))}</button>
                        <button class="nav-btn" data-action="вперёд" data-key="arrowright" aria-label="Ход вперёд">${raw(иконка('вправо'))}</button>
                        <button class="nav-btn" data-action="в-конец" data-key="end arrowdown" aria-label="В конец">${raw(иконка('конец'))}</button>
                    </nav>
                </div>

                <div class="panel-col">
                    ${идётЗдесь() ? html`
                        <section class="card progress-card">
                            <div class="progress-head">
                                <span>${работа.этап === 'быстро' ? 'Быстрый просмотр партии' : 'Уточняю разбор'}</span>
                                <span class="muted">${работа.готово} / ${работа.всего || n + 1}</span>
                            </div>
                            <div class="progress"><div class="progress-bar" style="width:${работа.всего ? (100 * работа.готово / работа.всего).toFixed(1) : 0}%"></div></div>
                        </section>
                    ` : ''}

                    ${с.ошибка ? html`
                        <section class="card error-card">
                            <p>${с.ошибка}</p>
                            <button class="btn" data-action="повторить-разбор">Попробовать снова</button>
                        </section>
                    ` : ''}

                    ${!идётЗдесь() && надоРазбирать && !с.ошибка ? html`
                        <section class="card">
                            <p>Разбор ${р ? 'не закончен' : 'ещё не делался'}.</p>
                            <button class="btn primary" data-action="повторить-разбор">${р ? 'Продолжить разбор' : 'Разобрать'}</button>
                        </section>
                    ` : ''}

                    ${карточкаХода(п, р, нотация)}

                    ${р ? html`<section class="card graph-card">${график(р)}</section>` : ''}

                    ${сводкаКарточка(п, р)}
                    ${переломыКарточка(р, нотация)}
                    ${списокХодов(п, р, нотация)}
                </div>
            </div>
        `;
    },

    after(id) {
        const п = хранилище.партия(id);
        if (!п || идётЗдесь() || с.ошибка || неДоделан === id) return;

        // Разбор начинается сам при первом открытии: ради него человек и пришёл
        if (!разборПолон(п)) запуститьРазбор(п);
    },

    leave() {
        // Уходя, отменяем свой прогон: досчитывать партию, которую закрыли,
        // значит держать движок, нужный следующей
        if (работа) работа.отменён = true;
        с.вариант = null;

        // Вернувшись, человек получит ещё одну попытку автозапуска
        неДоделан = null;
    }
};

// ================== ДЕЙСТВИЯ ==================

function партия() {
    return хранилище.партия(с.id);
}

function шагнуть(куда) {
    const п = партия();
    if (!п) return;

    if (с.вариант) {
        const в = с.вариант;
        в.шаг = Math.max(0, Math.min(в.ходы.length, куда(в.шаг, в.ходы.length)));
    } else {
        с.полуход = Math.max(0, Math.min(п.ходы.length, куда(с.полуход, п.ходы.length)));
    }

    app.render();
}

actions.on('назад', () => шагнуть((i) => i - 1));
actions.on('вперёд', () => шагнуть((i) => i + 1));
actions.on('в-начало', () => шагнуть(() => 0));
actions.on('в-конец', () => шагнуть((_, n) => n));

actions.on('к-ходу', (el) => {
    с.вариант = null;
    с.полуход = Number(el.dataset.ply) || 0;
    app.render();
});

actions.on('перевернуть', () => {
    с.сторона = с.сторона === 'w' ? 'b' : 'w';
    app.render();
});

actions.on('править', () => {
    app.go('ввод', с.id);
});

actions.on('повторить-разбор', () => {
    const п = партия();
    if (!п) return;
    с.ошибка = '';
    неДоделан = null;
    запуститьРазбор(п);
    app.render();
});

actions.on('вариант', (el) => {
    const п = партия();
    const р = п && собратьРазбор(п);
    const х = р?.ходы[с.полуход - 1];
    if (!х) return;

    const { нотация } = хранилище.настройки();
    const лучший = el.dataset.kind === 'лучший';
    const основа = р.поз[лучший ? с.полуход - 1 : с.полуход].fen;
    const ходы = линияВSan(основа, лучший ? х.линияЛучшего : х.ответ, 10);
    if (!ходы.length) return;

    с.вариант = {
        основа,
        ходы,
        шаг: 1,
        подпись: лучший
            ? `Вместо ${показатьХод(х.san, нотация)} — ${показатьХод(ходы[0].san, нотация)}`
            : `Ответ на ${показатьХод(х.san, нотация)}`
    };
    app.render();
});

actions.on('шаг-варианта', (el) => {
    if (!с.вариант) return;
    с.вариант.шаг = Number(el.dataset.step) || 0;
    app.render();
});

actions.on('выйти-из-варианта', () => {
    с.вариант = null;
    app.render();
});


// Ход записан неверно — сразу к его правке на экране ввода (Р-29)
actions.on('исправить-ход', () => {
    if (!с.id || !с.полуход) return;
    открытьПравку(с.id, с.полуход);
    app.go('ввод', с.id);
});
