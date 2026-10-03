/**
 * Stockfish в браузере.
 *
 * Сборка — облегчённая однопоточная Stockfish 19 (vendor/stockfish, 1,8 МБ,
 * GPL-3). Полная весит сто мегабайт и на Pages не ложится, а многопоточной
 * нужен SharedArrayBuffer, то есть заголовки изоляции, которых GitHub Pages
 * не отдаёт (Р-5). Для разбора своей партии облегчённой хватает с запасом:
 * она играет сильнее любого человека, а различать «неточность» и «ошибку»
 * помогает не лишняя сотня пунктов движка, а честная глубина на каждом ходу.
 *
 * Движок живёт в отдельном потоке (Worker) и говорит текстом по протоколу
 * UCI. Здесь этот разговор превращается в обещания: дал позицию — получил
 * оценку. Запросы выстраиваются в очередь: движок один, и второй «go»
 * посреди первого сбил бы оба.
 */

const ПУТЬ = new URL('../../vendor/stockfish/stockfish-19-lite-single.js', import.meta.url).href;

/**
 * Разобрать строку «info … score cp 35 … multipv 1 … pv e2e4 e7e5».
 *
 * Строки с lowerbound/upperbound — промежуточные, движок в них ещё не
 * уверен; их пропускаем, иначе в разбор попадёт оценка недосчитанной
 * линии.
 */
export function разобратьInfo(строка) {
    if (!строка.startsWith('info ') || !строка.includes(' pv ')) return null;
    if (/ (lower|upper)bound /.test(строка)) return null;

    const слова = строка.split(' ');
    const итог = { multipv: 1, глубина: 0, оценка: null, линия: [] };

    for (let i = 1; i < слова.length; i++) {
        const с = слова[i];

        if (с === 'depth') итог.глубина = Number(слова[++i]);
        else if (с === 'multipv') итог.multipv = Number(слова[++i]);
        else if (с === 'score') {
            const вид = слова[++i];
            const число = Number(слова[++i]);
            итог.оценка = вид === 'mate' ? { мат: число } : { cp: число };
        } else if (с === 'pv') {
            итог.линия = слова.slice(i + 1);
            break;
        }
    }

    return итог.оценка ? итог : null;
}

export class Движок {

    constructor(путь = ПУТЬ) {
        this.путь = путь;
        this.поток = null;
        this.готов = null;
        this.очередь = Promise.resolve();
        this.слушатель = null;
        this.multipv = 1;
    }

    /** Поднять поток и дождаться «uciok» — один раз на всю жизнь движка. */
    запустить() {
        if (this.готов) return this.готов;

        this.готов = new Promise((готово, мимо) => {
            try {
                this.поток = new Worker(this.путь);
            } catch (e) {
                мимо(e);
                return;
            }

            this.поток.onmessage = (e) => this.слушатель?.(String(e.data));
            this.поток.onerror = (e) => {
                const ошибка = new Error(`Движок не запустился: ${e.message || 'ошибка потока'}`);
                this.готов = null;
                мимо(ошибка);
            };

            this.ждать('uciok', () => this.послать('uci'))
                .then(() => {
                    this.послать('setoption name Hash value 32');
                    return this.ждать('readyok', () => this.послать('isready'));
                })
                .then(готово, мимо);
        });

        return this.готов;
    }

    послать(команда) {
        this.поток.postMessage(команда);
    }

    /** Дождаться строки, начинающейся с ожидаемого; по пути отдать прочие. */
    ждать(начало, действие, наСтроку) {
        return new Promise((готово) => {
            this.слушатель = (строка) => {
                if (строка.startsWith(начало)) {
                    this.слушатель = null;
                    готово(строка);
                } else {
                    наСтроку?.(строка);
                }
            };
            действие();
        });
    }

    /**
     * Оценить позицию.
     *
     * @param {string} fen
     * @param {{ глубина?: number, линий?: number }} параметры
     * @returns {Promise<{ лучший: string, линии: Array<{оценка, линия, глубина}> }>}
     *   оценки — со стороны того, кто ходит, как их даёт движок
     */
    оценить(fen, { глубина = 14, линий = 2 } = {}) {
        const работа = this.очередь.then(async () => {
            await this.запустить();

            if (this.multipv !== линий) {
                this.послать(`setoption name MultiPV value ${линий}`);
                this.multipv = линий;
            }

            const линии = [];

            this.послать(`position fen ${fen}`);
            const конец = await this.ждать('bestmove', () => this.послать(`go depth ${глубина}`), (строка) => {
                const info = разобратьInfo(строка);
                if (info) линии[info.multipv - 1] = info;
            });

            return { лучший: конец.split(' ')[1], линии: линии.filter(Boolean) };
        });

        // Упавший запрос не должен останавливать очередь для следующих
        this.очередь = работа.catch(() => {});
        return работа;
    }

    /** Новая партия: движок забывает таблицу позиций прошлой. */
    новаяПартия() {
        this.очередь = this.очередь.then(async () => {
            await this.запустить();
            this.послать('ucinewgame');
            await this.ждать('readyok', () => this.послать('isready'));
        }).catch(() => {});
        return this.очередь;
    }

    остановить() {
        this.поток?.terminate();
        this.поток = null;
        this.готов = null;
        this.слушатель = null;
        this.очередь = Promise.resolve();
        this.multipv = 1;
    }
}

/** Один движок на приложение: поток весит мегабайты памяти. */
let общий = null;

export function движок() {
    if (!общий) общий = new Движок();
    return общий;
}
