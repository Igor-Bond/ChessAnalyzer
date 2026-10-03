/**
 * Запускатель проверок.
 *
 * Без сборки и без внешних зависимостей: наборы — обычные модули ES, запуск —
 * открыть tests/index.html в браузере. Проверять логику надо там же, где она
 * выполняется: половина проверок рисует настоящие экраны, а DOM вне браузера
 * взять неоткуда.
 */

const tests = [];
let currentSuite = '';

export function describe(name, fn) {
    const previous = currentSuite;
    currentSuite = name;
    fn();
    currentSuite = previous;
}

export function it(name, fn) {
    tests.push({ suite: currentSuite, name, fn });
}

// ================== ПРОВЕРКИ ==================

export function assert(condition, message = 'Ожидалось истинное значение') {
    if (!condition) throw new Error(message);
}

/** Сравнение по значению: числа, строки, массивы, простые объекты. */
export function equal(actual, expected, message) {
    const a = stable(actual);
    const b = stable(expected);

    if (a !== b) {
        throw new Error(message || `Ожидалось ${b}, получено ${a}`);
    }
}

export async function throws(fn, message = 'Ожидалась ошибка, её не было') {
    try {
        await fn();
    } catch {
        return;
    }
    throw new Error(message);
}

/** Стабильное представление: порядок ключей объекта не должен влиять. */
function stable(value) {
    return JSON.stringify(value, (_, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v).sort().reduce((acc, k) => { acc[k] = v[k]; return acc; }, {});
        }
        return v;
    });
}

// ================== ЗАПУСК ==================

export async function run(root) {
    const results = [];
    let passed = 0;

    for (const test of tests) {
        try {
            await test.fn();
            results.push({ ...test, ok: true });
            passed += 1;
        } catch (e) {
            results.push({ ...test, ok: false, error: e.message });
        }
    }

    render(root, results, passed);
    return { total: tests.length, passed, failed: tests.length - passed };
}

function render(root, results, passed) {
    const failed = results.length - passed;

    const bySuite = results.reduce((acc, r) => {
        (acc[r.suite] ||= []).push(r);
        return acc;
    }, {});

    const blocks = Object.entries(bySuite).map(([suite, items]) => `
        <div class="suite">
            <h2>${escape(suite)}</h2>
            ${items.map((r) => `
                <div class="test ${r.ok ? 'ok' : 'fail'}">
                    <span class="mark">${r.ok ? '✓' : '✗'}</span>
                    <span>${escape(r.name)}</span>
                    ${r.ok ? '' : `<div class="error">${escape(r.error)}</div>`}
                </div>
            `).join('')}
        </div>
    `).join('');

    root.innerHTML = `
        <div class="total ${failed ? 'fail' : 'ok'}">
            ${failed ? `Провалено ${failed} из ${results.length}` : `Все проверки пройдены: ${passed}`}
        </div>
        ${blocks}
    `;

    // Заголовок вкладки виден в списке вкладок — не приходится открывать
    document.title = failed ? `✗ ${failed} — проверки` : `✓ ${passed} — проверки`;
}

function escape(value) {
    return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
