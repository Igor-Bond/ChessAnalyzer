/**
 * Запуск всех наборов проверок.
 *
 * Отдельным модулем, а не тегом в index.html: страница обязана снять
 * сервис-воркер и подменить ключ хранения прежде, чем загрузит хоть один
 * модуль приложения.
 */

import { run } from './runner.js';
import { actions } from '../js/core/actions.js';

// Проверки нажимают настоящие кнопки, а слушатели вешает именно init()
actions.init();

// Наборы регистрируют проверки самим фактом импорта
await import('./suites/notation.test.js');
await import('./suites/game.test.js');
await import('./suites/review.test.js');
await import('./suites/board.test.js');
await import('./suites/store.test.js');
await import('./suites/engine.test.js');
await import('./suites/screens.test.js');

const summary = await run(document.getElementById('results'));

// Итог — в globalThis: снаружи проверки запускает CI, ему нужно значение
globalThis.__RESULT__ = summary;
console.log('[Проверки]', summary);
