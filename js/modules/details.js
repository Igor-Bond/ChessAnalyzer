/**
 * «Детально» — подробности по игроку этой партии (Р-30).
 *
 * Открывается кнопкой из сводки разбора. Белые и чёрные — переключателем,
 * а не двумя колонками: на телефоне две колонки цифр нечитаемы. Всё, что
 * указывает на ход, нажимается и открывает разбор на этом ходе.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { иконка } from '../core/icons.js';
import { хранилище } from '../core/store.js';
import { номерХода } from '../core/game.js';
import { показатьХод } from '../core/notation.js';
import { собратьРазбор } from '../core/report.js';
import { КЛАССЫ, СТАДИИ } from '../core/review.js';
import { подробно, ФИГУРЫ, ИМЕНА_ФИГУР } from '../core/details.js';
import { открытьРазборНа } from './review.js';

const { html, raw } = ui;

const с = { id: null, сторона: 'w' };

const процент = (з) => (з === null || з === undefined ? '—' : `${Math.round(з)}%`);

/**
 * Точность по ходам — столбиками цвета класса хода.
 *
 * Столбики, а не линия: каждый ход — отдельное решение, и провал на одном
 * не должен «перетекать» на соседние, как на графике-линии.
 */
function график(точности) {
    const Ш = 600;
    const В = 110;
    const n = точности.length;
    if (!n) return '';

    const шаг = Ш / n;
    const ширина = Math.max(2, шаг * 0.75);

    const столбики = точности.map((т, i) => {
        const з = т.точность ?? 100;
        const h = Math.max(3, (з / 100) * (В - 6));
        const x = i * шаг + (шаг - ширина) / 2;
        return `<rect class="dbar dbar-${т.класс}" x="${x.toFixed(1)}" y="${(В - h).toFixed(1)}" width="${ширина.toFixed(1)}" height="${h.toFixed(1)}" data-action="детально-к-ходу" data-ply="${т.полуход}"><title>${номерХода(т.полуход)} — ${т.точность === null ? 'вынужденный' : Math.round(т.точность) + '%'}</title></rect>`;
    });

    return raw(`<svg class="dgraph" viewBox="0 0 ${Ш} ${В}" preserveAspectRatio="none" role="img" aria-label="Точность по ходам">${столбики.join('')}</svg>`);
}

function строкаХода(полуход, san, нотация, правее) {
    return html`
        <button class="key-item" data-action="детально-к-ходу" data-ply="${полуход}">
            <b>${номерХода(полуход)} ${показатьХод(san, нотация)}</b>
            <span class="muted">${правее}</span>
        </button>
    `;
}

export const детальноЭкран = {

    render(id) {
        if (с.id !== id) Object.assign(с, { id, сторона: 'w' });

        const п = хранилище.партия(id);
        const р = п && собратьРазбор(п);

        if (!п || !р?.ходы.length) {
            return html`
                <header class="topbar">
                    <button class="icon-btn" data-action="к-разбору-партии" aria-label="Назад">${raw(иконка('назад'))}</button>
                    <h1>Детально</h1>
                </header>
                <div class="empty-note">Разбора этой партии ещё нет.</div>
            `;
        }

        const { нотация } = хранилище.настройки();
        const сторона = с.сторона;
        const д = подробно(р, сторона);
        const сводка = р.сводка[сторона];
        const имя = (ст) => (ст === 'w' ? п.белые || 'Белые' : п.чёрные || 'Чёрные');

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="к-разбору-партии" aria-label="К разбору" title="К разбору">${raw(иконка('назад'))}</button>
                <h1 class="ellipsis">Детально · ${п.белые || 'Белые'} — ${п.чёрные || 'Чёрные'}</h1>
            </header>

            <div class="narrow wide">
                <div class="side-switch" role="tablist">
                    ${['w', 'b'].map((ст) => html`
                        <button class="side-tab ${ст === сторона ? 'on' : ''}" role="tab" data-action="детально-сторона" data-side="${ст}">
                            <span class="side-dot ${ст}"></span>${имя(ст)}
                        </button>
                    `)}
                </div>

                ${р.полный ? '' : html`<p class="muted small">Разбор ещё не закончен — цифры уточнятся.</p>`}

                <section class="card">
                    <div class="detail-head">
                        <div><b>${процент(сводка.точность)}</b><span>точность</span></div>
                        <div><b>${сводка.средняяПотеря ?? '—'}</b><span>средняя потеря</span></div>
                        <div><b>${д.ходов}</b><span>ходов</span></div>
                        <div><b>${д.серия.длина}</b><span>точных подряд</span></div>
                    </div>
                    ${график(д.точностьПоХодам)}
                    <p class="muted small">Столбик — точность хода, цвет — его класс. Нажмите, чтобы открыть ход в разборе.</p>
                </section>

                <section class="card">
                    <h2 class="card-title">По стадиям</h2>
                    <table class="phase-table">
                        ${СТАДИИ.map((ст) => html`
                            <tr><td class="cls-name">${ст}</td><td class="n">${сводка.стадии[ст] ? процент(сводка.стадии[ст].точность) : '—'}</td><td class="n muted">${сводка.стадии[ст]?.ходов ?? 0} ход.</td></tr>
                        `)}
                    </table>
                </section>

                <section class="card">
                    <h2 class="card-title">По фигурам</h2>
                    <table class="phase-table">
                        <tr class="muted small"><td></td><td class="n">точность</td><td class="n">ходов</td><td class="n">ошибок</td></tr>
                        ${ФИГУРЫ.filter((ф) => д.поФигурам[ф]).map((ф) => html`
                            <tr>
                                <td class="cls-name">${ИМЕНА_ФИГУР[ф]}</td>
                                <td class="n">${процент(д.поФигурам[ф].точность)}</td>
                                <td class="n">${д.поФигурам[ф].ходов}</td>
                                <td class="n ${д.поФигурам[ф].ошибок ? 'cls-ошибка' : ''}">${д.поФигурам[ф].ошибок}</td>
                            </tr>
                        `)}
                    </table>
                </section>

                <section class="card">
                    <h2 class="card-title">Ошибки ${д.ошибки.length ? `· ${д.ошибки.length}` : ''}</h2>
                    ${д.ошибки.length ? html`<ul class="key-list">${д.ошибки.map((о) => html`<li>${строкаХода(о.полуход, о.san, нотация,
                        `${КЛАССЫ[о.класс].кратко}, −${Math.round(о.потеря)}%${о.лучший ? ` · лучше ${показатьХод(о.лучший, нотация)}` : ''}`)}</li>`)}</ul>`
                        : html`<p class="muted">Ни одной неточности — сыграно чисто.</p>`}
                </section>

                <section class="card">
                    <h2 class="card-title">Упущенные шансы ${д.упущенные.length ? `· ${д.упущенные.length}` : ''}</h2>
                    ${д.упущенные.length ? html`<ul class="key-list">${д.упущенные.map((у) => html`<li>${строкаХода(у.полуход, у.san, нотация,
                        `соперник ошибся на ${Math.round(у.подарок)}%, ответ отдал ${Math.round(у.отдано)}%${у.лучший ? ` · надо было ${показатьХод(у.лучший, нотация)}` : ''}`)}</li>`)}</ul>`
                        : html`<p class="muted">Ошибки соперника не остались безнаказанными.</p>`}
                </section>

                <section class="card">
                    <h2 class="card-title">Ещё</h2>
                    <table class="phase-table">
                        <tr><td class="cls-name">Единственных ходов найдено</td><td class="n">${д.единственных.length}</td></tr>
                        <tr><td class="cls-name">Взятий</td><td class="n">${д.взятий}</td></tr>
                        <tr><td class="cls-name">Шахов</td><td class="n">${д.шахов}</td></tr>
                        <tr><td class="cls-name">Самый большой перевес</td><td class="n">${д.пик ? html`<button class="mv-btn" data-action="детально-к-ходу" data-ply="${д.пик.полуход}">${процент(д.пик.шансы)}</button>` : '—'}</td></tr>
                    </table>
                    ${д.серия.длина > 1 ? html`<p class="muted small">Точных ходов подряд: ${д.серия.длина} — с ${номерХода(д.серия.с)} по ${номерХода(д.серия.по)}</p>` : ''}
                </section>
            </div>
        `;
    }
};

actions.on('детально-сторона', (el) => {
    с.сторона = el.dataset.side === 'b' ? 'b' : 'w';
    app.render();
});

actions.on('детально-к-ходу', (el) => {
    открытьРазборНа(с.id, Number(el.dataset.ply) || 0);
    app.go('разбор', с.id);
});

actions.on('к-разбору-партии', () => app.go('разбор', с.id));
