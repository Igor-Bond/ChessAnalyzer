/**
 * Ключ Gemini из трекера тренировок — по нажатию, не сам.
 *
 * Трекер живёт на том же адресе (igor-bond.github.io), а хранилище браузера
 * делится по адресу, не по каталогу: его база этой странице доступна. Ключ
 * там уже лежит, и вписывать его второй раз с телефона — переписывать сорок
 * символов вслепую (Р-13).
 *
 * Только читаем и только по нажатию. Чужую базу нельзя создавать: открытие
 * несуществующей базы в IndexedDB создаёт её пустой, и трекер, впервые
 * поставленный на это устройство после, нашёл бы базу без таблиц. Поэтому
 * сначала спрашиваем список баз, а если базу пришлось бы создать —
 * отменяем.
 */

const БАЗА = 'WorkoutTrackerDB';
const ТАБЛИЦА = 'settings';
const КЛЮЧ = 'aiKey';

/** @returns {Promise<string>} ключ или пустая строка, если трекера здесь нет */
export async function ключИзТрекера() {
    if (!globalThis.indexedDB) return '';

    try {
        const базы = await indexedDB.databases?.();
        if (Array.isArray(базы) && !базы.some((б) => б.name === БАЗА)) return '';
    } catch {
        // Список баз умеют не все браузеры — тогда защищает onupgradeneeded ниже
    }

    return new Promise((готово) => {
        let запрос;

        try {
            запрос = indexedDB.open(БАЗА);
        } catch {
            готово('');
            return;
        }

        запрос.onupgradeneeded = () => {
            // Базы не было: отменяем, чтобы не оставить пустую
            запрос.transaction.abort();
            готово('');
        };

        запрос.onerror = () => готово('');

        запрос.onsuccess = () => {
            const база = запрос.result;

            try {
                if (!база.objectStoreNames.contains(ТАБЛИЦА)) {
                    база.close();
                    готово('');
                    return;
                }

                const чтение = база.transaction(ТАБЛИЦА, 'readonly').objectStore(ТАБЛИЦА).get(КЛЮЧ);
                чтение.onsuccess = () => {
                    база.close();
                    готово(String(чтение.result?.value || '').trim());
                };
                чтение.onerror = () => {
                    база.close();
                    готово('');
                };
            } catch {
                база.close();
                готово('');
            }
        };
    });
}
