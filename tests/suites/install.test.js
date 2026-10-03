/**
 * Установка на телефон: всё, что Chrome на Android требует от приложения.
 *
 * Поломка здесь не видна ни на одном экране: приложение открывается и
 * работает, а пункта «Установить» в меню нет — и узнаётся это только с
 * телефона. Поэтому требования проверяются по списку, как их проверяет сам
 * Chrome: манифест, имя, режим окна, стартовый адрес внутри области
 * приложения, значки 192 и 512 точек настоящего размера, сервис-воркер.
 */

import { describe, it, equal, assert } from '../runner.js';

const КОРЕНЬ = new URL('../', location.href);

async function манифест() {
    const ответ = await fetch(new URL('manifest.json', КОРЕНЬ), { cache: 'no-store' });
    assert(ответ.ok, `манифест не отдаётся: ${ответ.status}`);
    return ответ.json();
}

function размер(адрес) {
    return new Promise((готово) => {
        const img = new Image();
        img.onload = () => готово(`${img.naturalWidth}x${img.naturalHeight}`);
        img.onerror = () => готово('не загрузилась');
        img.src = адрес;
    });
}

describe('Установка на телефон', () => {
    it('страница ссылается на манифест', async () => {
        const html = await (await fetch(new URL('index.html', КОРЕНЬ), { cache: 'no-store' })).text();
        assert(/<link rel="manifest" href="manifest\.json">/.test(html), 'нет ссылки на манифест в index.html');
    });

    it('имя, короткое имя и режим отдельного окна', async () => {
        const м = await манифест();
        assert(м.name && м.short_name, 'нет имени');
        assert(м.short_name.length <= 12, `короткое имя длиннее 12 знаков — под значком обрежется: ${м.short_name}`);
        equal(м.display, 'standalone');
    });

    it('у приложения постоянный идентификатор, не зависящий от адреса', async () => {
        // Без id Chrome выводит личность приложения из стартового адреса, и
        // переименование репозитория делает установленное приложение чужим:
        // Chrome помнит «установлено», а открыть нечего (так и случилось)
        const м = await манифест();
        assert(typeof м.id === 'string' && м.id.length > 0, 'в манифесте нет id');
    });

    it('стартовый адрес внутри области приложения и отвечает', async () => {
        const м = await манифест();
        const база = new URL('manifest.json', КОРЕНЬ);
        const старт = new URL(м.start_url, база).href;
        const область = new URL(м.scope, база).href;

        assert(старт.startsWith(область), `старт ${старт} вне области ${область}`);
        equal((await fetch(старт, { cache: 'no-store' })).status, 200);
    });

    it('значки 192 и 512 точек — и настоящего размера', async () => {
        const м = await манифест();
        const база = new URL('manifest.json', КОРЕНЬ);

        for (const нужно of ['192x192', '512x512']) {
            const значок = м.icons.find((з) => з.sizes === нужно && (з.purpose || 'any').includes('any'));
            assert(значок, `нет значка ${нужно} для обычного вида`);
            equal(await размер(new URL(значок.src, база).href), нужно, значок.src);
        }

        for (const з of м.icons) {
            equal(await размер(new URL(з.src, база).href), з.sizes, `${з.src} заявлен как ${з.sizes}`);
        }
    });

    it('сервис-воркер на месте и умеет отвечать на запросы', async () => {
        const текст = await (await fetch(new URL('sw.js', КОРЕНЬ), { cache: 'no-store' })).text();
        assert(/addEventListener\('fetch'/.test(текст), 'в сервис-воркере нет обработчика запросов');

        const main = await (await fetch(new URL('js/main.js', КОРЕНЬ), { cache: 'no-store' })).text();
        assert(/serviceWorker\s*\.register\('sw\.js'\)/.test(main), 'приложение не регистрирует сервис-воркер');
    });
});
