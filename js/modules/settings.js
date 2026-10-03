/**
 * Настройки: нотация показа и глубина движка.
 *
 * Нотация — только для показа. Ввод понимает все три сразу (Р-3), поэтому
 * сменить её можно в любой момент, и ни одна партия архива от этого не
 * испортится: ходы хранятся в PGN.
 */

import { app } from '../app.js';
import { actions } from '../core/actions.js';
import { ui } from '../core/ui.js';
import { иконка } from '../core/icons.js';
import { хранилище, ГЛУБИНЫ } from '../core/store.js';
import { НОТАЦИИ, показатьХод } from '../core/notation.js';

const { html, raw } = ui;

const ПОДПИСИ_ГЛУБИНЫ = {
    10: ['Быстро', 'секунды на партию, грубее в острых местах'],
    14: ['Обычно', 'около минуты на партию на телефоне'],
    18: ['Тщательно', 'в несколько раз дольше, точнее в сложных позициях']
};

export const настройкиЭкран = {

    render() {
        const н = хранилище.настройки();

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="в-архив" aria-label="Назад">${raw(иконка('назад'))}</button>
                <h1>Настройки</h1>
            </header>

            <div class="narrow">
                <section class="card">
                    <h2 class="card-title">Нотация</h2>
                    <p class="muted small">Как показывать ходы. Вводить можно в любой — приложение поймёт.</p>
                    <div class="choice-list">
                        ${Object.entries(НОТАЦИИ).map(([код, з]) => html`
                            <button class="choice ${н.нотация === код ? 'on' : ''}" data-action="нотация" data-value="${код}">
                                <b>${з.имя}</b>
                                <span class="muted">${['Nf3', 'Bxe5', 'Qd8+', 'O-O'].map((s) => показатьХод(s, код)).join('  ')}</span>
                            </button>
                        `)}
                    </div>
                </section>

                <section class="card">
                    <h2 class="card-title">Глубина разбора</h2>
                    <div class="choice-list">
                        ${ГЛУБИНЫ.map((г) => html`
                            <button class="choice ${н.глубина === г ? 'on' : ''}" data-action="глубина" data-value="${г}">
                                <b>${ПОДПИСИ_ГЛУБИНЫ[г][0]} · ${г} полуходов</b>
                                <span class="muted">${ПОДПИСИ_ГЛУБИНЫ[г][1]}</span>
                            </button>
                        `)}
                    </div>
                    <p class="muted small">Уже разобранные партии не пересчитываются сами — их можно разобрать заново из экрана разбора.</p>
                </section>
            </div>
        `;
    }
};

actions.on('нотация', (el) => {
    хранилище.настроить({ нотация: el.dataset.value });
    app.render();
});

actions.on('глубина', (el) => {
    хранилище.настроить({ глубина: Number(el.dataset.value) });
    app.render();
});
