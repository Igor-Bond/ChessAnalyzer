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
import { синхронизация } from '../core/autosync.js';
import { установка } from '../core/install.js';
import { когдаСловами } from './settings.js';
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

/**
 * Строка обмена под кнопками — только когда обмен включён.
 *
 * Ведёт в настройки: там подробности и кнопка «Обменяться сейчас». Ошибку
 * видно и здесь, иначе партия, не доехавшая до компьютера, выглядела бы
 * загадкой, а не «нет связи».
 */
/**
 * Кнопка установки — только когда Chrome готов установить (Р-24).
 *
 * В установленном приложении и там, где Chrome установку не предлагает,
 * её нет вовсе: объяснять установку тому, кто уже установил, незачем.
 */
function строкаУстановки() {
    if (установка.вПриложении || !установка.можно) return '';
    return html`<button class="btn big install-btn" data-action="установить">Установить на телефон</button>`;
}

function строкаОбмена() {
    if (!синхронизация.включена) return '';

    const с_ = синхронизация.состояние;
    const текст = с_.идёт ? 'Обмен…'
        : с_.ошибка ? `Обмен не удался: ${с_.ошибка}`
            : `Синхронизировано ${когдаСловами(хранилище.обмен().когда)}`;

    return html`
        <button class="sync-line ${с_.ошибка ? 'bad' : ''}" data-action="настройки">
            ${ui.raw(иконка('облако'))}<span>${текст}</span>
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
                <div class="hero-actions">
                    <button class="btn primary big" data-action="новая-по-фото">${ui.raw(иконка('камера'))} Сфотографировать бланк</button>
                    <button class="btn big" data-action="новая">+ Ввести ходы</button>
                </div>
                <p class="hint">Снимите бланк или введите ходы — движок разберёт каждый ход.</p>
                ${строкаОбмена()}
                ${строкаУстановки()}
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

actions.on('новая-по-фото', () => {
    const партия = хранилище.сохранить(новаяПартия());
    app.go('фото', партия.id);
});

actions.on('открыть', (el) => {
    const партия = хранилище.партия(el.dataset.id);
    if (!партия) return app.render();

    app.go(собратьРазбор(партия) ? 'разбор' : 'ввод', партия.id);
});

actions.on('настройки', () => app.go('настройки'));

actions.on('в-архив', () => app.go('архив'));

actions.on('установить', async () => {
    await установка.установить();
    app.render();
});
