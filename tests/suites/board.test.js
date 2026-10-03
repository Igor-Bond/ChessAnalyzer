/**
 * Доска: что нарисовано, то и стоит.
 *
 * Самая коварная ошибка доски снаружи не видна: картинка уверенная, фигуры
 * на местах — но перевёрнутая доска подписывает клетки чужими именами, и
 * нажатие на e4 ходит на d5. Поэтому проверяется не вид, а соответствие:
 * какая клетка где лежит и какое у неё имя.
 */

import { describe, it, equal, assert } from '../runner.js';
import { нарисоватьДоску, расстановка, угол, полеШаха } from '../../js/core/board.js';
import { Chess } from '../../js/core/chess.js';

const НАЧАЛО = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function разметка(svg) {
    const место = document.createElement('div');
    место.innerHTML = svg;
    return место.firstElementChild;
}

describe('Доска', () => {
    it('расстановка из FEN', () => {
        const р = расстановка(НАЧАЛО);
        equal(Object.keys(р).length, 32);
        equal(р.e1, 'wK');
        equal(р.d8, 'bQ');
        equal(р.a2, 'wP');
    });

    it('a1 — тёмная клетка в левом нижнем углу; h1 — светлая', () => {
        const svg = разметка(нарисоватьДоску({ fen: НАЧАЛО }));
        const a1 = svg.querySelector('[data-sq="a1"]');
        const h1 = svg.querySelector('[data-sq="h1"]');

        assert(a1.classList.contains('dark'), 'a1 не тёмная');
        assert(h1.classList.contains('light'), 'h1 не светлая');
        equal([a1.getAttribute('x'), a1.getAttribute('y')], ['0', '700']);
    });

    it('перевёрнутая доска: a1 справа сверху, имена клеток сохраняются', () => {
        equal(угол('a1', 'b'), { x: 700, y: 0 });
        equal(угол('h8', 'b'), { x: 0, y: 700 });

        const svg = разметка(нарисоватьДоску({ fen: НАЧАЛО, сторона: 'b' }));
        const a1 = svg.querySelector('[data-sq="a1"]');
        equal([a1.getAttribute('x'), a1.getAttribute('y')], ['700', '0']);

        // Фигура рисуется на своей клетке и в перевёрнутом виде
        const король = svg.querySelector('[data-at="e1"]');
        const клетка = svg.querySelector('[data-sq="e1"]');
        equal(король.getAttribute('x'), клетка.getAttribute('x'));
        equal(король.getAttribute('y'), клетка.getAttribute('y'));
    });

    it('32 фигуры — 32 картинки, с правильными файлами', () => {
        const svg = разметка(нарисоватьДоску({ fen: НАЧАЛО }));
        const фигуры = svg.querySelectorAll('.piece');
        equal(фигуры.length, 32);
        assert(svg.querySelector('[data-at="g8"]').getAttribute('href').endsWith('/assets/pieces/bN.svg'), 'не та картинка коня');
    });

    it('клетки нажимаются только когда доска нажимаемая', () => {
        const тихая = разметка(нарисоватьДоску({ fen: НАЧАЛО }));
        equal(тихая.querySelectorAll('[data-action="клетка"]').length, 0);

        const живая = разметка(нарисоватьДоску({ fen: НАЧАЛО, нажимаемая: true }));
        equal(живая.querySelectorAll('[data-action="клетка"]').length, 64);
        equal(живая.querySelector('[data-square="e2"]').dataset.sq, 'e2');
    });

    it('стрелки, цели и значок класса рисуются', () => {
        const svg = разметка(нарисоватьДоску({
            fen: НАЧАЛО,
            стрелки: [{ from: 'e2', to: 'e4', вид: 'best' }],
            цели: ['e3', 'e4'],
            значок: { поле: 'h8', класс: 'зевок', знак: '??' }
        }));
        equal(svg.querySelectorAll('.arrow-best').length, 1);
        equal(svg.querySelectorAll('.target').length, 2);
        equal(svg.querySelector('.badge-зевок text').textContent, '??');
    });

    it('поле шаха — король той стороны, что ходит', () => {
        const д = new Chess();
        for (const х of ['e4', 'f5', 'Qh5']) д.move(х);
        equal(полеШаха(д), 'e8');
        equal(полеШаха(new Chess()), null);
    });
});
