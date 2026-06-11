const STORAGE_VERSION = 1;
const KEY_PREFIX = `ege_trainer_v${STORAGE_VERSION}_task_`;
const KEY_ACTIVE_TASK = `ege_trainer_v${STORAGE_VERSION}_active_task`;
const KEY_RESULTS = `ege_trainer_v${STORAGE_VERSION}_results`;
const KEY_AUTO_ADVANCE = `ege_trainer_v${STORAGE_VERSION}_auto_advance`;
const KEY_MUSIC_ENABLED = `ege_trainer_v${STORAGE_VERSION}_music_enabled`;
const KEY_SHUFFLE = `ege_trainer_v${STORAGE_VERSION}_shuffle`;
const KEY_ORDER_MODE = `ege_trainer_v${STORAGE_VERSION}_order_mode`;
const KEY_RACE_VISIBLE = `ege_trainer_v${STORAGE_VERSION}_race_visible`;
const ORDER_MODES = new Set(["sequential", "random", "each-type"]);
let storageAvailable;

function canUseStorage() {
  if (typeof storageAvailable === "boolean") {
    return storageAvailable;
  }

  try {
    const testKey = `__ege_test__${Date.now()}`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }

  return storageAvailable;
}

function makeTaskKey(taskId) {
  return `${KEY_PREFIX}${taskId}`;
}


function readJson(key, fallbackValue) {
  if (!canUseStorage()) {
    return fallbackValue;
  }

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

function readString(key, fallbackValue = null) {
  if (!canUseStorage()) {
    return fallbackValue;
  }

  const value = localStorage.getItem(key);
  return value ?? fallbackValue;
}

function writeString(key, value) {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(key, value);
}

function readBoolean(key) {
  if (!canUseStorage()) {
    return false;
  }

  return localStorage.getItem(key) === "1";
}

function writeBoolean(key, value) {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(key, value ? "1" : "0");
}

export function saveSession(taskId, session) {
  const envelope = {
    savedAt: Date.now(),
    payload: session.toJSON()
  };

  writeJson(makeTaskKey(taskId), envelope);
}

export function loadSession(task, SessionClass) {
  try {
    const envelope = readJson(makeTaskKey(task.id), null);
    if (!envelope?.payload) {
      return null;
    }
    return SessionClass.fromJSON(task, envelope.payload);
  } catch {
    return null;
  }
}

export function loadTaskSummary(taskId) {
  try {
    const envelope = readJson(makeTaskKey(taskId), null);
    if (!envelope?.payload) {
      return null;
    }

    const payload = envelope.payload;
    return {
      finished: Boolean(payload.finished),
      cursor: Number(payload.cursor ?? 0),
      duration: Number(payload.duration ?? 0),
      savedAt: Number(envelope.savedAt ?? 0)
    };
  } catch {
    return null;
  }
}

export function saveActiveTaskId(taskId) {
  writeString(KEY_ACTIVE_TASK, taskId);
}

export function loadActiveTaskId() {
  return readString(KEY_ACTIVE_TASK);
}

export function loadBestResults() {
  return readJson(KEY_RESULTS, {});
}

export function saveBestResults(results) {
  writeJson(KEY_RESULTS, results);
}

export function loadAutoAdvancePreference() {
  return readBoolean(KEY_AUTO_ADVANCE);
}

export function saveAutoAdvancePreference(enabled) {
  writeBoolean(KEY_AUTO_ADVANCE, enabled);
}


export function loadMusicEnabledPreference() {
  return readBoolean(KEY_MUSIC_ENABLED);
}

export function saveMusicEnabledPreference(enabled) {
  writeBoolean(KEY_MUSIC_ENABLED, enabled);
}

export function loadRaceVisiblePreference(defaultValue = true) {
  if (!canUseStorage()) {
    return Boolean(defaultValue);
  }

  const value = localStorage.getItem(KEY_RACE_VISIBLE);
  return value === null ? Boolean(defaultValue) : value === "1";
}

export function saveRaceVisiblePreference(visible) {
  writeBoolean(KEY_RACE_VISIBLE, visible);
}

export function loadShufflePreference() {
  return readBoolean(KEY_SHUFFLE);
}

export function saveShufflePreference(enabled) {
  writeBoolean(KEY_SHUFFLE, enabled);
}

export function loadOrderModePreference() {
  const savedMode = readString(KEY_ORDER_MODE);
  if (ORDER_MODES.has(savedMode)) {
    return savedMode;
  }

  return loadShufflePreference() ? "random" : "sequential";
}

export function saveOrderModePreference(mode) {
  const nextMode = ORDER_MODES.has(mode) ? mode : "sequential";
  writeString(KEY_ORDER_MODE, nextMode);
  saveShufflePreference(nextMode === "random");
}
