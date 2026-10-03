/**
 * Обращение к Gemini — напрямую из браузера, без посредника.
 *
 * Устроено как в трекере тренировок, где это уже проверено жизнью: Google
 * отвечает на запрос с личным ключом прямо со страницы, и заводить ради
 * этого сервер значило бы завести единственное, чего в приложении нет.
 *
 * Ключ личный и лежит только на этом устройстве. Защита от чужих рук — не в
 * тайне (ключ виден тому, кто откроет хранилище браузера), а в ограничении
 * ключа по адресу в консоли Google.
 *
 * Модель — настройка, а не зашитое имя: состав моделей у Google меняется
 * чаще, чем выходят версии приложения. Список берётся у самого Google.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Модель на случай, если список у Google ещё не спрашивали. */
export const МОДЕЛЬ_ПО_УМОЛЧАНИЮ = 'gemini-3.5-flash';

/**
 * Сколько ждать ответа.
 *
 * Две минуты, а не одна, как в трекере: чтение рукописного бланка на
 * шестьдесят ходов — самый долгий вопрос, который задают модели, а
 * думающие модели перед ответом ещё и размышляют.
 */
const СРОК = 120000;

/**
 * Понятная причина вместо кода ошибки — и слова самого Google следом.
 *
 * Своими словами — то, что можно поправить. Слова Google — для того, кто
 * будет пересказывать: перевод отказа теряет ровно ту подробность, ради
 * которой его читают.
 */
export function причина(status, body) {
    const текст = String(body?.error?.message || '').trim();

    const своими = status === 400 && /API key not valid/i.test(текст)
        ? 'Ключ не принят. Проверьте, что скопирован он целиком.'
        : status === 403 && /referer|referrer/i.test(текст)
            // Ключ из трекера ограничен его адресом — частый случай именно здесь
            ? 'Ключ ограничен другим адресом. В консоли Google добавьте к разрешённым адресам igor-bond.github.io/ChessAnalyzer/*.'
            : status === 400 ? 'Запрос не принят.'
                : status === 403 ? 'Доступ запрещён. Возможно, ключ ограничен другим адресом, модель недоступна в вашей стране или у проекта не включён Gemini API.'
                    : status === 404 ? 'Модель не найдена. Обновите список моделей в настройках.'
                        : status === 429 ? 'Слишком часто или кончилась бесплатная квота. Google просит подождать.'
                            : status >= 500 ? 'Google ответил ошибкой. Попробуйте ещё раз.'
                                : 'Не удалось получить ответ.';

    return текст
        ? `${своими} Google говорит так: «${текст}»`
        : `${своими} Код ответа ${status}.`;
}

async function запрос(url, параметры = {}) {
    const control = new AbortController();
    const часы = setTimeout(() => control.abort(), СРОК);

    let ответ;
    let данные;

    try {
        ответ = await fetch(url, { ...параметры, signal: control.signal });
        данные = await ответ.json().catch(() => null);
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Ответа нет уже две минуты. Похоже, не дождёмся.');
        throw new Error('Нет связи с Google.');
    } finally {
        clearTimeout(часы);
    }

    if (!ответ.ok) throw new Error(причина(ответ.status, данные));
    return данные;
}

export const ai = {

    готов: (ключ) => !!String(ключ || '').trim(),

    /**
     * Какие модели этот ключ вправе спрашивать — заодно самая дешёвая
     * проверка ключа: квота на ответ не тратится.
     */
    async модели(ключ) {
        if (!ai.готов(ключ)) throw new Error('Ключ не задан.');

        const данные = await запрос(`${ENDPOINT}?key=${encodeURIComponent(ключ)}&pageSize=200`);

        return (Array.isArray(данные?.models) ? данные.models : [])
            .filter((m) => (m?.supportedGenerationMethods || []).includes('generateContent'))
            .map((m) => String(m?.name || '').replace(/^models\//, ''))
            .filter((имя) => /gemini/i.test(имя));
    },

    /**
     * Выбрать модель из предложенных: flash новейшей версии.
     *
     * Черновые (preview, exp) Google выключает без предупреждения, лёгкие
     * (lite) хуже читают почерк — их берём, только если других нет.
     */
    выбрать(имена = []) {
        const все = имена.filter(Boolean);
        if (!все.length) return null;

        const версия = (имя) => Number(String(имя).match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
        const черновая = (имя) => /preview|exp|latest/i.test(имя);
        const лёгкая = (имя) => /lite|nano|tts|image|live|embed/i.test(имя);
        const вес = (имя) => (/flash/i.test(имя) ? 2 : /pro/i.test(имя) ? 1 : 0);

        const годные = все.filter((имя) => !черновая(имя) && !лёгкая(имя));
        const откуда = годные.length ? годные : все;

        return [...откуда].sort((a, b) => вес(b) - вес(a) || версия(b) - версия(a) || a.localeCompare(b))[0];
    },

    /**
     * Спросить со снимками и получить JSON по схеме.
     *
     * Снимки стоят перед словами: сначала предмет, потом вопрос о нём — так
     * и просит Google в своих примерах.
     *
     * @param {{ ключ, модель, снимки: Array<{mime, data}>, текст, схема }} п
     * @returns {Promise<object>} разобранный JSON ответа
     */
    async спроситьJSON({ ключ, модель = МОДЕЛЬ_ПО_УМОЛЧАНИЮ, снимки = [], текст, схема }) {
        if (!ai.готов(ключ)) throw new Error('Ключ Gemini не задан. Его вписывают в настройках.');

        const тело = {
            contents: [{
                role: 'user',
                parts: [
                    ...снимки.map((с) => ({ inlineData: { mimeType: с.mime || 'image/jpeg', data: с.data } })),
                    { text: текст }
                ]
            }],
            generationConfig: {
                // Чтение — не сочинение: случайность здесь только вредит
                temperature: 0,
                responseMimeType: 'application/json',
                ...(схема ? { responseSchema: схема } : {})
            }
        };

        const url = `${ENDPOINT}/${encodeURIComponent(модель)}:generateContent?key=${encodeURIComponent(ключ)}`;
        const данные = await запрос(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(тело)
        });

        return ai.прочитатьJSON(данные);
    },

    /**
     * JSON из ответа — или понятный отказ.
     *
     * Отдельно от запроса, чтобы проверяться без сети. Оборванный ответ —
     * не ответ: половина бланка, принятая за целый, хуже честной ошибки.
     */
    прочитатьJSON(данные) {
        const кандидат = данные?.candidates?.[0];
        const текст = (кандидат?.content?.parts || [])
            .filter((p) => !p.thought)
            .map((p) => p.text || '')
            .join('')
            .trim();

        const конец = кандидат?.finishReason || null;
        const блок = данные?.promptFeedback?.blockReason || null;

        if (!текст) {
            throw new Error(блок
                ? `Google не принял снимок: сработал его фильтр. Код: ${блок}.`
                : конец === 'MAX_TOKENS'
                    ? 'Модель израсходовала весь отведённый объём и не успела ответить. Попробуйте ещё раз.'
                    : `Ответ пришёл пустым${конец ? ` (${конец})` : ''}.`);
        }

        if (конец && конец !== 'STOP') {
            throw new Error(`Ответ оборвался, не дойдя до конца. Код Google: ${конец}.`);
        }

        // Модели иногда обрамляют JSON блоком кода даже в режиме JSON
        const чистый = текст.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

        try {
            return JSON.parse(чистый);
        } catch {
            throw new Error('Ответ модели не разобрался: пришёл не JSON.');
        }
    }
};
