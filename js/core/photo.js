/**
 * Снимок бланка: уменьшить перед отправкой и вырезать клетку для показа.
 *
 * Уменьшать надо, но не так сильно, как еду в трекере: там тысячи точек
 * хватает, чтобы узнать тарелку, а здесь в клетке шириной в сантиметр
 * написано «Sbd7», и при тысяче точек на лист это три-четыре точки на букву.
 * Две тысячи по длинной стороне — буквы различимы, а весит снимок всё ещё
 * полмегабайта, а не восемь.
 *
 * Снимок нигде не сохраняется: он живёт, пока открыт экран распознавания.
 * Через `<img>`, а не createImageBitmap: айфон отдаёт снимки в HEIC, и
 * разобрать их умеет только сам браузер.
 */

const СТОРОНА = 2048;
const КАЧЕСТВО = 0.85;

function загрузить(адрес) {
    return new Promise((готово, беда) => {
        const img = new Image();
        img.onload = () => готово(img);
        img.onerror = () => беда(new Error('Снимок не прочитался. Попробуйте другой.'));
        img.src = адрес;
    });
}

/**
 * Уменьшить и пережать в JPEG.
 *
 * @returns {Promise<{ mime, data, адрес, ширина, высота }>}
 *   data — основание 64 без приставки (так его ждёт Google), адрес — то же
 *   с приставкой, для показа и вырезки
 */
export async function уменьшить(файл, { max = СТОРОНА, качество = КАЧЕСТВО } = {}) {
    if (!файл) throw new Error('Снимок не выбран.');

    const ссылка = URL.createObjectURL(файл);

    try {
        const картинка = await загрузить(ссылка);
        const ш = картинка.naturalWidth || картинка.width;
        const в = картинка.naturalHeight || картинка.height;
        if (!(ш > 0 && в > 0)) throw new Error('Снимок не прочитался. Попробуйте другой.');

        // Маленькое не растягиваем: дорисованные точки не добавляют сведений
        const доля = Math.min(1, max / Math.max(ш, в));

        const холст = document.createElement('canvas');
        холст.width = Math.max(1, Math.round(ш * доля));
        холст.height = Math.max(1, Math.round(в * доля));
        холст.getContext('2d').drawImage(картинка, 0, 0, холст.width, холст.height);

        const адрес = холст.toDataURL('image/jpeg', качество);

        return {
            mime: 'image/jpeg',
            data: адрес.slice(адрес.indexOf(',') + 1),
            адрес,
            ширина: холст.width,
            высота: холст.height
        };
    } finally {
        URL.revokeObjectURL(ссылка);
    }
}

/**
 * Вырезать клетку бланка по рамке модели.
 *
 * Рамка — как её даёт Gemini: [ymin, xmin, ymax, xmax] в долях тысячи. Рамки
 * модели неточны, поэтому вырезка берётся с запасом во все стороны: лучше
 * показать клетку вместе с соседями, чем отрезать половину хода.
 *
 * @returns {Promise<string|null>} адрес картинки или null, если рамки нет
 */
export async function вырезать(снимок, рамка, { запас = 0.6 } = {}) {
    if (!снимок?.адрес || !Array.isArray(рамка) || рамка.length !== 4) return null;

    const [y0, x0, y1, x1] = рамка.map((ч) => Math.max(0, Math.min(1000, Number(ч) || 0)));
    if (y1 <= y0 || x1 <= x0) return null;

    const картинка = await загрузить(снимок.адрес);
    const W = картинка.naturalWidth;
    const H = картинка.naturalHeight;

    const ш = ((x1 - x0) / 1000) * W;
    const в = ((y1 - y0) / 1000) * H;

    // Запас по вертикали больше: строки бланка тесные, а ход в соседней
    // строке помогает понять, что за почерк перед глазами
    const лево = Math.max(0, (x0 / 1000) * W - ш * запас);
    const верх = Math.max(0, (y0 / 1000) * H - в * запас * 1.5);
    const право = Math.min(W, (x1 / 1000) * W + ш * запас);
    const низ = Math.min(H, (y1 / 1000) * H + в * запас * 1.5);

    const холст = document.createElement('canvas');
    холст.width = Math.max(1, Math.round(право - лево));
    холст.height = Math.max(1, Math.round(низ - верх));

    const к = холст.getContext('2d');
    к.drawImage(картинка, лево, верх, право - лево, низ - верх, 0, 0, холст.width, холст.height);

    // Сама клетка обведена: в вырезке с запасом видно три-четыре хода, и
    // глаз должен сразу найти тот, о котором спрашивают. Цвет — из темы,
    // своих цветов в коде нет
    const цвет = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'green';
    к.strokeStyle = цвет;
    к.lineWidth = Math.max(2, Math.round(холст.width / 120));
    к.strokeRect((x0 / 1000) * W - лево, (y0 / 1000) * H - верх, ш, в);

    return холст.toDataURL('image/jpeg', 0.9);
}
