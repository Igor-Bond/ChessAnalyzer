/**
 * Архив партий — первый экран.
 *
 * Карточка партии ведёт туда, где с ней есть что делать: разобранная — в
 * разбор, неразобранная — к вводу ходов, где её дописывают.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { хранилище } from '../core/store.js';
import { новаяПартия } from '../core/game.js';
import { собратьРазбор } from '../core/report.js';
import { иконка } from '../core/icons.js';
import { VERSION } from '../version.js';

const { html } = ui;

function имяИгрока(имя, запасное) {
    return (имя || '').trim() || запасное;
}

function процент(значение) {
    return значение === null || значение === undefined ? '—' : `${значение.toFixed(1)}%`;
}

function карточка(партия) {
    const разбор = собратьРазбор(партия);
    const ходов = Math.ceil(партия.ходы.length / 2);
    const с = разбор?.полный ? разбор.сводка : null;

    return html`
        <button class="game-card" data-action="открыть" data-id="${партия.id}">
            <span class="game-players">
                <span class="side-dot w"></span>${имяИгрока(партия.белые, 'Белые')}
                <span class="vs">—</span>
                <span class="side-dot b"></span>${имяИгрока(партия.чёрные, 'Чёрные')}
            </span>
            <span class="game-meta">
                ${партия.дата || ''}${партия.событие ? html` · ${партия.событие}` : ''}
                · ${ходов} ${склонение(ходов, 'ход', 'хода', 'ходов')}
                · <b>${партия.результат || '*'}</b>
            </span>
            ${с
                ? html`<span class="game-acc"><span>Точность</span><b>${процент(с.w.точность)}</b><i>/</i><b>${процент(с.b.точность)}</b></span>`
                : html`<span class="game-acc muted">${партия.ходы.length ? 'не разобрана' : 'пустая'}</span>`}
        </button>
    `;
}

export function склонение(n, один, два, пять) {
    const н = Math.abs(n) % 100;
    const н1 = н % 10;
    if (н > 10 && н < 20) return пять;
    if (н1 > 1 && н1 < 5) return два;
    if (н1 === 1) return один;
    return пять;
}

export const архивЭкран = {

    render() {
        const партии = хранилище.партии();

        return html`
            <header class="topbar">
                <h1 class="brand"><img class="brand-mark" src="assets/pieces/wN.svg" alt=""> Разбор партий</h1>
                <button class="icon-btn" data-action="настройки" aria-label="Настройки" title="Настройки">${ui.raw(иконка('настройки'))}</button>
            </header>

            <section class="hero">
                <button class="btn primary big" data-action="новая">+ Новая партия</button>
                <p class="hint">Введите ходы с бланка или вставьте текст партии — движок разберёт каждый ход.</p>
            </section>

            <section class="games">
                ${партии.length
                    ? партии.map(карточка)
                    : html`<div class="empty-note">Партий пока нет.</div>`}
            </section>

            <footer class="foot">Версия ${VERSION} · Stockfish 19</footer>
        `;
    }
};

actions.on('новая', () => {
    const партия = хранилище.сохранить(новаяПартия());
    app.go('ввод', партия.id);
});

actions.on('открыть', (el) => {
    const партия = хранилище.партия(el.dataset.id);
    if (!партия) return app.render();

    app.go(собратьРазбор(партия) ? 'разбор' : 'ввод', партия.id);
});

actions.on('настройки', () => app.go('настройки'));

actions.on('в-архив', () => app.go('архив'));
