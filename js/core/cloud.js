/**
 * Облако: вход через Google и Firestore — тот же проект, что у трекера.
 *
 * Свой проект Firebase здесь был бы хуже чужого в трёх вещах сразу (Р-19).
 * Его пришлось бы заводить и настраивать в консоли; правила доступа трекера
 * уже разрешают каждому всё внутри users/{его uid}/…, так что раздел
 * шахмат (users/{uid}/chessGames) работает без единой правки в консоли; и
 * вход у Firebase хранится в хранилище адреса igor-bond.github.io, общем
 * для обоих приложений, — вошедший в трекер в этом браузере входит и сюда.
 *
 * Значения конфигурации не секретны: Google встраивает их в клиентский код
 * по замыслу, данные защищают правила доступа.
 *
 * SDK (vendor/firebase, копия из трекера, Apache-2.0) весит почти мегабайт
 * и грузится только при включённом обмене — динамическим import. Кто
 * обменом не пользуется, не платит за него ни байтом.
 */

const КОНФИГ = {
    apiKey: 'AIzaSyCrJQ6IvI7b9dbW3PM0nsJSxYnMQj63An0',
    authDomain: 'workout-tracker-456fc.firebaseapp.com',
    projectId: 'workout-tracker-456fc',
    storageBucket: 'workout-tracker-456fc.firebasestorage.app',
    messagingSenderId: '517434245111',
    appId: '1:517434245111:web:72e1d6523f8b6e177578f2'
};

const КОЛЛЕКЦИЯ = 'chessGames';

/**
 * Сколько ждать сервер.
 *
 * Без сети Firestore не отказывает, а ждёт её появления: отправка висит,
 * пока связь не вернётся. Для экрана это неотличимо от поломки, поэтому
 * обмен сдаётся через полминуты и говорит «нет связи», а неотправленное
 * остаётся отмеченным до следующего раза.
 */
const СРОК = 30000;

let sdk = null;
let поднято = null;
let пользователь = null;
let ошибкаВхода = '';
const слушатели = new Set();

function известить() {
    for (const ф of слушатели) {
        try { ф(пользователь); } catch (e) { console.error('[Облако]', e); }
    }
}

function сроком(обещание, что) {
    let часы;
    return Promise.race([
        обещание,
        new Promise((_, отказ) => {
            часы = setTimeout(() => отказ(new Error(`Нет связи: ${что} не ответил за ${СРОК / 1000} с`)), СРОК);
        })
    ]).finally(() => clearTimeout(часы));
}

/** Поднять SDK и узнать, выполнен ли вход. Повторный вызов ничего не делает. */
function поднять() {
    if (поднято) return поднято;

    поднято = (async () => {
        const [app, authModule, fs] = await Promise.all([
            import('../../vendor/firebase/firebase-app.js'),
            import('../../vendor/firebase/firebase-auth.js'),
            import('../../vendor/firebase/firebase-firestore.js')
        ]);

        const приложение = app.getApps().length ? app.getApp() : app.initializeApp(КОНФИГ);
        const auth = authModule.getAuth(приложение);
        const db = fs.getFirestore(приложение);

        sdk = { authModule, fs, auth, db };

        // Вход переживает перезапуск: заходить заново при каждом открытии
        // приложения на телефоне никто не станет
        await authModule.setPersistence(auth, authModule.browserLocalPersistence)
            .catch((e) => console.warn('[Облако] Постоянная сессия не включилась:', e));

        // Возврат после входа переходом по адресу (если окно входа не открылось)
        // Ошибка возврата не глотается: вход переходом может не завершиться
        // (разделённое хранилище браузера), и человек должен увидеть почему
        await authModule.getRedirectResult(auth).catch((e) => {
            ошибкаВхода = e?.code || e?.message || String(e);
        });

        await new Promise((готово) => {
            const стоп = authModule.onAuthStateChanged(auth, (п) => {
                пользователь = п;
                стоп();
                готово();
            });
        });

        authModule.onAuthStateChanged(auth, (п) => {
            пользователь = п;
            известить();
        });

        return sdk;
    })().catch((e) => {
        поднято = null;
        throw e;
    });

    return поднято;
}

export const облако = {

    /** Кто вошёл: { uid, email, имя } или null. Поднимает SDK. */
    async кто() {
        await поднять();
        return пользователь ? { uid: пользователь.uid, email: пользователь.email || '', имя: пользователь.displayName || '' } : null;
    },

    /**
     * Войти через Google.
     *
     * Сначала всплывающим окном; если браузер его не пустил (так бывает в
     * установленном приложении на телефоне) — переходом по адресу, и тогда
     * приложение откроется заново уже с выполненным входом.
     */
    async войти() {
        const { authModule, auth } = await поднять();
        const провайдер = new authModule.GoogleAuthProvider();

        try {
            const итог = await authModule.signInWithPopup(auth, провайдер);
            пользователь = итог.user;
            известить();
            return облако.кто();
        } catch (e) {
            if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return null;

            console.warn('[Облако] Окно входа не открылось, входим переходом:', e?.code);
            await authModule.signInWithRedirect(auth, провайдер);
            return null;
        }
    },

    /** Чем кончился вход переходом по адресу, если не удался. */
    get ошибкаВхода() {
        return ошибкаВхода;
    },

    наВход(функция) {
        слушатели.add(функция);
        return () => слушатели.delete(функция);
    },

    /**
     * Адаптер для обмена (sync.js) — к разделу шахмат этого пользователя.
     *
     * Выхода из учётной записи здесь нет намеренно: вход общий с трекером,
     * и выход из него в шахматах выкинул бы человека и из трекера. Обмен
     * выключается в настройках, вход остаётся.
     */
    async адаптер() {
        const { fs, db } = await поднять();
        if (!пользователь) throw new Error('Вход не выполнен');

        const раздел = fs.collection(db, 'users', пользователь.uid, КОЛЛЕКЦИЯ);

        return {
            /**
             * Пачками по четыреста: Firestore берёт до пятисот операций за
             * раз, а поштучно сотня партий — сотня круговых задержек.
             * Время записи — серверное (syncedAt): по нему другое устройство
             * поймёт, что запись появилась, как бы ни расходились часы.
             */
            async отправить(записи) {
                for (let i = 0; i < записи.length; i += 400) {
                    const пачка = fs.writeBatch(db);
                    for (const з of записи.slice(i, i + 400)) {
                        пачка.set(fs.doc(раздел, з.id), { ...з, syncedAt: fs.serverTimestamp() });
                    }
                    await сроком(пачка.commit(), 'сервер');
                }
            },

            async получить(курсор) {
                const запрос = курсор > 0
                    ? fs.query(раздел, fs.where('syncedAt', '>', fs.Timestamp.fromMillis(курсор)))
                    : fs.query(раздел);

                // Именно с сервера: без сети getDocs молча отдаёт кэш — пустой, —
                // «приём» удаётся, не дойдя до сервера, и следом идёт отправка,
                // способная затереть более новую чужую правку
                const снимок = await сроком(fs.getDocsFromServer(запрос), 'сервер');
                let новый = курсор;

                const записи = снимок.docs.map((д) => {
                    const з = д.data();
                    const когда = з.syncedAt?.toMillis?.() || 0;
                    if (когда > новый) новый = когда;
                    return { ...з, id: з.id || д.id };
                });

                return { записи, курсор: новый };
            }
        };
    }
};
