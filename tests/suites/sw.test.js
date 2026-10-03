/**
 * Офлайн-кэш переживает соседей по домену.
 *
 * На igor-bond.github.io живут несколько приложений, а хранилище кэшей у
 * адреса одно на всех. Трекер тренировок при каждом своём обновлении
 * удаляет все кэши, кроме своего, — и шахматы после этого не открылись бы
 * без сети. Узнаётся такое в турнирном зале, где сети нет.
 *
 * Проверка ставит настоящий сервис-воркер, стирает его кэш так же, как это
 * делает сосед, и ждёт, что следующий запуск приложения кэш восстановит.
 *
 * Идёт последней: воркер, поставленный здесь, начинает управлять страницей
 * проверок. Следующий прогон снимает его сам (см. index.html).
 */

import { describe, it, equal, assert } from '../runner.js';

const КОРЕНЬ = new URL('../', location.href);

async function списокФайлов() {
    const текст = await (await fetch(new URL('sw.js', КОРЕНЬ), { cache: 'no-store' })).text();
    const блок = /ФАЙЛЫ\s*=\s*\[(.*?)\]/s.exec(текст)?.[1] || '';
    return [...блок.matchAll(/'([^']+)'/g)].map((м) => м[1]).filter((ф) => ф !== './');
}

async function дождаться(условие, подпись, срок) {
    const край = Date.now() + срок;
    while (Date.now() < край) {
        if (await условие()) return;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Не дождались: ${подпись}`);
}

async function недостаёт(имя, файлы) {
    const нет = [];
    for (const ф of файлы) {
        if (!(await caches.match(new URL(ф, КОРЕНЬ).href, { cacheName: имя }))) нет.push(ф);
    }
    return нет;
}

describe('Офлайн-кэш', () => {
    it('кэш, стёртый соседним приложением, восстанавливается при следующем запуске', async () => {
        if (!('serviceWorker' in navigator)) return;

        const файлы = await списокФайлов();
        assert(файлы.length > 20, `список файлов не прочитался: ${файлы.length}`);

        const рег = await navigator.serviceWorker.register(new URL('sw.js', КОРЕНЬ).href, { scope: КОРЕНЬ.href });

        try {
            await дождаться(() => рег.active?.state === 'activated', 'воркер активирован', 30000);

            const имя = (await caches.keys()).find((к) => к.startsWith('chess-'));
            assert(имя, 'воркер не завёл кэш');
            await дождаться(async () => !(await недостаёт(имя, файлы)).length, 'кэш собран при установке', 30000);

            // Так поступает трекер, обновляясь: удаляет все чужие кэши
            await caches.delete(имя);
            equal((await недостаёт(имя, ['index.html'])).length, 1, 'кэш не стёрся');

            // Следующий запуск приложения — оно просит воркер проверить кэш
            рег.active.postMessage('проверить-кэш');

            await дождаться(async () => !(await недостаёт(имя, файлы)).length, 'кэш восстановлен', 30000);
        } finally {
            await рег.unregister();
            for (const к of await caches.keys()) if (к.startsWith('chess-')) await caches.delete(к);
        }
    });

    it('приложение при запуске просит воркер проверить кэш', async () => {
        const main = await (await fetch(new URL('js/main.js', КОРЕНЬ), { cache: 'no-store' })).text();
        assert(/postMessage\('проверить-кэш'\)/.test(main), 'main.js не просит проверить кэш');
    });
});
