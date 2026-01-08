// storage.js
// Назначение: сохранять/загружать прогресс ПО taskId через localStorage.
// Важно: модуль не знает про DOM, UI, ввод и т.п. Он просто "память".

// Версия формата хранения. Если потом изменишь структуру JSON — увеличишь версию.
// Тогда старые записи можно будет игнорировать или мигрировать.
const STORAGE_VERSION = 2;

// Префиксы ключей в localStorage.
// Делим ключи: отдельно прогресс задач, отдельно "последнее активное задание".
const KEY_PREFIX_TASK = `typing_trainer_v${STORAGE_VERSION}_task_`;
const KEY_ACTIVE_TASK = `typing_trainer_v${STORAGE_VERSION}_active_task_id`;
const KEY_RACE_ENABLED = `typing_trainer_v${STORAGE_VERSION}_ui_race_enabled`;
const KEY_AUTO_NEXT = `typing_trainer_v${STORAGE_VERSION}_ui_auto_next`;
/**
 * Собирает ключ localStorage для конкретного задания.
 * taskId — строка (например "ege:loops:01")
 */
export function makeTaskKey(taskId) {
  // Простейшая защита: если taskId вдруг пустой — ключ станет "…task_"
  // Это плохо, но лучше, чем падать. App всё равно должен давать корректный taskId.
  return `${KEY_PREFIX_TASK}${String(taskId)}`;
}

/**
 * Проверка: доступен ли localStorage и не падает ли он (иногда в приватных режимах/iframe).
 * Возвращает true/false.
 */
function canUseLocalStorage() {
  try {
    const testKey = `__tt_test__${Date.now()}`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Сохраняет TaskSession для taskId.
 *
 * session — это твой объект TaskSession (из session.js),
 * у которого обязателен метод toJSON() (ты его уже сделал).
 *
 * Никаких решений "когда сохранять" здесь нет: App сам решит.
 */
export function saveSession(taskId, session) {
  if (!canUseLocalStorage()) return;

  try {
    const key = makeTaskKey(taskId);

    // Мы храним "конверт" (envelope): версия + дата сохранения + payload.
    // Это удобно, если потом захочешь миграции или отладку.
    const envelope = {
      v: STORAGE_VERSION,
      savedAt: Date.now(),
      payload: session.toJSON(), // <-- тут вся твоя сессия в JSON-формате
    };

    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Молча игнорируем ошибки записи:
    // - переполнен localStorage
    // - запрещён доступ
    // - битая сериализация
    // App живёт дальше, просто без сохранений.
  }
}

/**
 * Загружает TaskSession по taskId.
 *
 * TaskSessionClass — класс TaskSession (из session.js), нужен для fromJSON().
 * task — объект Task (из domain.js), потому что сессии обычно надо знать исходный код/мету.
 *
 * Возвращает:
 * - TaskSession (готовую к работе)
 * - или null, если ничего нет / данные битые / версия не совпала
 */
export function loadSession(taskId, TaskSessionClass, task) {
  if (!canUseLocalStorage()) return null;

  try {
    const key = makeTaskKey(taskId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const envelope = JSON.parse(raw);

    // Если формат странный — считаем, что данных нет.
    if (!envelope || typeof envelope !== "object") return null;

    // Если версия отличается — пока просто игнорируем (без миграций).
    // Позже можно сделать: if (envelope.v === 1) migrateV1toV2(...)
    if (envelope.v !== STORAGE_VERSION) return null;

    // payload — то, что вернул session.toJSON()
    const payload = envelope.payload;

    // Восстановление через fromJSON.
    // ВАЖНО: точная сигнатура fromJSON зависит от твоей реализации.
    // Я закладываюсь на самый частый вариант:
    // TaskSession.fromJSON(task, payload)
    //
    // Если у тебя иначе (например fromJSON(payload, task)) — поменяешь местами.
    return TaskSessionClass.fromJSON(task, payload);
  } catch {
    // Битый JSON, ошибка парсинга, ошибка fromJSON — считаем, что сохранения нет.
    return null;
  }
}

/**
 * Удаляет сохранённый прогресс по taskId.
 */
export function clearSession(taskId) {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.removeItem(makeTaskKey(taskId));
  } catch {
    // ignore
  }
}

/**
 * Запоминает последнее активное задание (чтобы после перезагрузки открыть его).
 */
export function saveActiveTaskId(taskId) {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(KEY_ACTIVE_TASK, String(taskId));
  } catch {
    // ignore
  }
}

/**
 * Возвращает последнее активное задание или null.
 */
export function loadActiveTaskId() {
  if (!canUseLocalStorage()) return null;

  try {
    const val = localStorage.getItem(KEY_ACTIVE_TASK);
    return val ? String(val) : null;
  } catch {
    return null;
  }
}


export function saveRaceEnabled(enabled) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(KEY_RACE_ENABLED, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadRaceEnabled(defaultValue) {
  if (!canUseLocalStorage()) return !!defaultValue;
  try {
    const v = localStorage.getItem(KEY_RACE_ENABLED);
    if (v === null) return !!defaultValue;
    return v === "1";
  } catch {
    return !!defaultValue;
  }
}

export function saveAutoNextEnabled(enabled) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(KEY_AUTO_NEXT, enabled ? "1" : "0");
  } catch { }
}

export function loadAutoNextEnabled(defaultValue) {
  if (!canUseLocalStorage()) return !!defaultValue;
  try {
    const v = localStorage.getItem(KEY_AUTO_NEXT);
    if (v === null) return !!defaultValue;
    return v === "1";
  } catch {
    return !!defaultValue;
  }
}