/**
 * Настройки: нотация показа, глубина движка, ключ Gemini.
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
import { ai, МОДЕЛЬ_ПО_УМОЛЧАНИЮ } from '../core/ai.js';
import { ключИзТрекера } from '../core/trackerkey.js';
import { синхронизация } from '../core/autosync.js';
import { установка } from '../core/install.js';
import { VERSION } from '../version.js';

const { html, raw } = ui;

const ПОДПИСИ_ГЛУБИНЫ = {
    10: ['Быстро', 'секунды на партию, грубее в острых местах'],
    14: ['Обычно', 'около полуминуты на партию на телефоне'],
    18: ['Тщательно', 'в несколько раз дольше, точнее в сложных позициях']
};

/** Что сказать под ключом: итог проверки или взятия из трекера. */
const с = { сообщение: '', ошибка: '', занято: false, сведения: '' };

/** Ключ на экране — только хвост: экран могут видеть через плечо. */
function замаскировать(ключ) {
    return ключ ? `••••••${ключ.slice(-4)}` : '';
}

function разделGemini(н) {
    const модели = [...new Set([н.модель, ...н.модели].filter(Boolean))];

    return html`
        <section class="card">
            <h2 class="card-title">Чтение бланков · Gemini</h2>
            <p class="muted small">Фото бланка читает модель Google по вашему личному ключу. Ключ хранится только на этом устройстве. Получить его — на <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</p>

            ${н.ключ ? html`
                <p class="key-line">${raw(иконка('ключ'))} Ключ задан: <code>${замаскировать(н.ключ)}</code>
                    <button class="btn ghost small" data-action="забыть-ключ">Убрать</button></p>
            ` : ''}

            <form class="move-form" data-submit="ключ" autocomplete="off">
                <div class="move-row">
                    <input name="ключ" class="move-input key-input" type="password" placeholder="${н.ключ ? 'Заменить ключ' : 'Вставьте ключ'}" autocomplete="off" spellcheck="false">
                    <button class="btn primary" type="submit">Сохранить</button>
                </div>
            </form>

            <div class="row-actions">
                <button class="btn ghost" data-action="ключ-из-трекера">Взять из трекера тренировок</button>
                <button class="btn ghost" data-action="проверить-ключ" ${н.ключ && !с.занято ? '' : 'disabled'}>${с.занято ? 'Проверяю…' : 'Проверить и обновить модели'}</button>
            </div>

            ${с.сообщение ? html`<p class="form-note">${с.сообщение}</p>` : ''}
            ${с.ошибка ? html`<p class="form-error">${с.ошибка}</p>` : ''}

            ${модели.length ? html`
                <label class="fields"><span class="small muted">Модель</span>
                    <select data-change="модель">
                        ${модели.map((м) => html`<option value="${м}" ${м === н.модель ? 'selected' : ''}>${м}</option>`)}
                    </select>
                </label>
            ` : html`<p class="muted small">Модель выберется сама при первом чтении (обычно ${МОДЕЛЬ_ПО_УМОЛЧАНИЮ} или новее).</p>`}
        </section>
    `;
}

/** Время последнего обмена словами: «в 14:05» сегодня, иначе с датой. */
export function когдаСловами(мс) {
    if (!мс) return 'ещё не было';
    const д = new Date(мс);
    const часы = д.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return д.toDateString() === new Date().toDateString()
        ? `сегодня в ${часы}`
        : `${д.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${часы}`;
}

function разделОбмена() {
    const с_ = синхронизация.состояние;

    if (!синхронизация.включена) {
        return html`
            <section class="card">
                <h2 class="card-title">Обмен между устройствами</h2>
                <p>Партии станут одинаковыми на телефоне и компьютере: снятый в турнире бланк можно разбирать дома. Заодно архив перестаёт жить в одном браузере.</p>
                <p class="muted small">Вход через Google — тот же, что в трекере тренировок. Если вы вошли в трекер в этом браузере, входить заново не придётся. Разбор не пересылается: на другом устройстве он пересчитается сам.</p>
                <button class="btn primary" data-action="обмен-включить" ${с_.идёт ? 'disabled' : ''}>${raw(иконка('облако'))} Включить обмен</button>
                ${с_.ошибка ? html`<p class="form-error">${с_.ошибка}</p>` : ''}
            </section>
        `;
    }

    const о = хранилище.обмен();
    const ждут = о.грязные.filter((id) => (хранилище.партия(id)?.ходы.length ?? 1) > 0).length;

    return html`
        <section class="card">
            <h2 class="card-title">Обмен между устройствами</h2>
            <p class="key-line">${raw(иконка('облако'))} ${с_.кто ? html`Вход: <b>${с_.кто.email || с_.кто.имя}</b>` : 'Обмен включён'}</p>
            <p class="small">
                ${с_.идёт ? 'Идёт обмен…' : html`Последний обмен: ${когдаСловами(о.когда)}${с_.последний ? html` · получено ${с_.последний.получено}, отправлено ${с_.последний.отправлено}` : ''}`}
                ${ждут && !с_.идёт ? html`<br><span class="muted">Ждут отправки: ${ждут}</span>` : ''}
            </p>
            ${с_.ошибка ? html`<p class="form-error">${с_.ошибка}</p>` : ''}
            <div class="row-actions">
                <button class="btn" data-action="обмен-сейчас" ${с_.идёт ? 'disabled' : ''}>Обменяться сейчас</button>
                <button class="btn ghost" data-action="обмен-выключить">Выключить на этом устройстве</button>
            </div>
            <p class="muted small">Выключение не стирает партии и не выходит из Google — трекер тренировок продолжит работать как работал.</p>
        </section>
    `;
}

/** Последний ответ браузера об установке — считается после отрисовки (after). */
let диагноз = null;

function разделУстановки() {
    const д = диагноз;
    if (!д) return '';

    const шаги = {
        'в-приложении': html`<p class="form-note">Приложение установлено — вы сейчас в нём.</p>`,

        'можно': html`
            <p>Chrome готов установить приложение.</p>
            <button class="btn primary" data-action="установить">Установить приложение</button>
        `,

        'считает-установленным': html`
            <p><b>Chrome считает приложение уже установленным</b>, поэтому не предлагает установку. Если открыть его не получается, значит, прошлая установка не завершилась — так бывает после смены адреса.</p>
            <ol class="steps">
                <li>Настройки телефона → Приложения → найдите «Разбор» (если не видно, в меню ⋮ включите «Показать системные») → Удалить.</li>
                <li>Закройте Chrome полностью и откройте этот адрес снова.</li>
                <li>Здесь появится кнопка «Установить приложение».</li>
            </ol>
        `,

        'ждём': html`
            <p>Chrome пока не предложил установку.</p>
            <ol class="steps">
                <li>Обновите страницу и подождите несколько секунд — кнопка появится здесь, когда Chrome будет готов.</li>
                <li>Или меню Chrome ⋮ → «Установить приложение» либо «Добавить на главный экран».</li>
                <li>Если ничего не помогает, нажмите «Скопировать сведения» и перешлите их.</li>
            </ol>
        `,

        'вручную': html`
            <p>Этот браузер не устанавливает приложения сам. На Android откройте адрес в Chrome; на iPhone — в Safari: «Поделиться» → «На экран Домой».</p>
        `
    }[д.состояние];

    return html`
        <section class="card">
            <h2 class="card-title">Установка на телефон</h2>
            ${шаги}
            <div class="row-actions">
                <button class="btn ghost small" data-action="сведения-установки">Скопировать сведения</button>
            </div>
            ${с.сведения ? html`<p class="form-note diag">${с.сведения}</p>` : ''}
        </section>
    `;
}

export const настройкиЭкран = {

    render() {
        const н = хранилище.настройки();

        return html`
            <header class="topbar">
                <button class="icon-btn" data-action="в-архив" aria-label="Назад">${raw(иконка('назад'))}</button>
                <h1>Настройки</h1>
            </header>

            <div class="narrow">
                ${разделУстановки()}
                ${разделОбмена()}
                ${разделGemini(н)}

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
                    <p class="muted small">Уже разобранные партии не пересчитываются сами — на экране разбора есть кнопка «Пересчитать».</p>
                </section>
            </div>
        `;
    },

    /**
     * Ответ браузера об установке асинхронный: считаем после отрисовки и
     * перерисовываем, только если он изменился — иначе экран перерисовывал
     * бы сам себя без конца.
     */
    after() {
        установка.диагноз().then((д) => {
            const было = JSON.stringify(диагноз);
            диагноз = д;
            if (JSON.stringify(д) !== было && app.route.name === 'настройки') app.render();
        });
    },

    leave() {
        Object.assign(с, { сообщение: '', ошибка: '', занято: false, сведения: '' });
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

/** Новый ключ — заново и модель: прежняя могла быть недоступна новому. */
function сохранитьКлюч(ключ) {
    хранилище.настроить({ ключ, модель: '', модели: [] });
}

actions.onSubmit('ключ', (форма) => {
    const ключ = форма.querySelector('input[name="ключ"]').value.trim();
    if (!ключ) return;

    сохранитьКлюч(ключ);
    с.сообщение = 'Ключ сохранён. Нажмите «Проверить», чтобы убедиться, что Google его принимает.';
    с.ошибка = '';
    app.render();
});

actions.on('ключ-из-трекера', async () => {
    const ключ = await ключИзТрекера();

    if (!ключ) {
        с.сообщение = '';
        с.ошибка = 'В трекере тренировок на этом устройстве ключа нет. Откройте трекер в этом же браузере или впишите ключ вручную.';
    } else {
        сохранитьКлюч(ключ);
        с.ошибка = '';
        с.сообщение = `Ключ взят из трекера: ${замаскировать(ключ)}. Если он ограничен адресом трекера, добавьте в консоли Google igor-bond.github.io/ChessAnalyzer/*.`;
    }

    app.render();
});

actions.on('забыть-ключ', () => {
    сохранитьКлюч('');
    с.сообщение = 'Ключ убран с этого устройства.';
    с.ошибка = '';
    app.render();
});

actions.on('проверить-ключ', async () => {
    const { ключ, модель } = хранилище.настройки();
    if (!ключ || с.занято) return;

    с.занято = true;
    с.ошибка = '';
    с.сообщение = '';
    app.render();

    try {
        const список = await ai.модели(ключ);
        const выбрана = список.includes(модель) ? модель : ai.выбрать(список);
        хранилище.настроить({ модели: список, модель: выбрана || '' });
        с.сообщение = `Ключ работает. Моделей доступно: ${список.length}, выбрана ${выбрана}.`;
    } catch (e) {
        с.ошибка = e.message || String(e);
    } finally {
        с.занято = false;
    }

    if (app.route.name === 'настройки') app.render();
});

actions.onChange('модель', (el) => {
    хранилище.настроить({ модель: el.value });
});

actions.on('обмен-включить', async () => {
    await синхронизация.включить();
    if (app.route.name === 'настройки') app.render();
});

actions.on('обмен-сейчас', async () => {
    await синхронизация.сейчас();
    if (app.route.name === 'настройки') app.render();
});

actions.on('обмен-выключить', () => {
    синхронизация.выключить();
    app.render();
});

actions.on('установить', async () => {
    await установка.установить();
    app.render();
});

/**
 * Сведения об установке — в буфер обмена, чтобы переслать одним нажатием.
 *
 * Без них жалоба «не устанавливается» — это гадание: на телефоне Chrome
 * знает, почему не предлагает установку, а разработчику отсюда не видно.
 */
actions.on('сведения-установки', async () => {
    const д = await установка.диагноз();
    const текст = [
        `Разбор партий ${VERSION}`,
        `Состояние установки: ${д.состояние}`,
        `Chrome считает установленным: ${д.считаетУстановленным ? 'да' : 'нет'}`,
        `Открыто как приложение: ${установка.вПриложении ? 'да' : 'нет'}`,
        `Событие установки поддерживается: ${установка.поддерживается ? 'да' : 'нет'}`,
        `Сервис-воркер: ${navigator.serviceWorker?.controller ? 'управляет' : 'нет'}`,
        `Адрес: ${location.href}`,
        `Браузер: ${д.браузер}`
    ].join('\n');

    try {
        await navigator.clipboard.writeText(текст);
        с.сведения = 'Скопировано — вставьте в сообщение.';
    } catch {
        с.сведения = текст;
    }

    app.render();
});
