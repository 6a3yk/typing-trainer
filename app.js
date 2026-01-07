// app.js
// Главный управляющий модуль приложения.
// Назначение: связать Domain (Task, TaskSession),
// Input (InputController), UI и Storage в единый поток.
//
// ВАЖНО:
// - App знает ВСЁ
// - Остальные модули знают ТОЛЬКО своё
// - UI не знает про ввод
// - Input не знает про задания
// - Session не знает про DOM
//
// App = дирижёр, не музыкант
import { TASKS as RAW_TASKS } from "./tasks.generated.js";
import { Task } from "./domain.js";
import { TaskSession } from "./session.js";
import { InputController } from "./input.js";
import { UI } from "./ui.js";
import {
  saveSession,
  loadSession,
  clearSession,
  saveActiveTaskId,
  loadActiveTaskId,
} from "./storage.js";

export class App {
  constructor() {
    // Текущее задание
    this.task = null;

    // Текущая сессия
    this.session = null;

    // UI-слой
    this.ui = null;

    // Контроллер ввода
    this.input = null;
    this._tickInterval = null;
    this.metricsPanel = document.getElementById("metricsPanel");
    this.metricsToggleBtn = document.getElementById("metricsToggleBtn");

    this._tickMs = 200; // как в старом trainer.js было норм

    // DOM
    this.inputEl = document.getElementById("hiddenInput");

    // Флаг инициализации
    this.initialized = false;
    this.startBtn = document.getElementById("startBtn");
    this.resetBtn = document.getElementById("resetBtn");
    this.tasks = [];
    this.sideMenu = document.getElementById("sideMenu");
    this.sideMenuList = document.getElementById("sideMenuList");
    this.openMenuBtn = document.getElementById("openMenuBtn");
  }

  /**
   * Точка входа приложения.
   * Вызывается ОДИН раз после загрузки DOM.
   */
  init() {
    if (this.initialized) return;
    this._startTicker();
    this.initialized = true;

    // 1. Загружаем список заданий
    this.tasks = this._buildTasks();

    // 2. Выбираем стартовое
    this.task = this._pickInitialTask(this.tasks);

    // 2. Загружаем или создаём сессию
    this.session = this._loadOrCreateSession(this.task);

    // 3. Инициализируем UI
    this.ui = new UI();

    this.ui.setHandlers({
      onRetry: () => {
        this.session.reset();
        this._onRetry()
        // localStorage.clear();      // грубо, но для быстрого релиза ок
        this.input?.setEnabled(true);
        this._render();

        this.input?.focus();
      },
      onCloseResults: () => {
        this._onCloseResults()
        this.input?.setEnabled(true);
        this.input?.focus();
      },
      onExport: () => this._onExport(),
    });
    this._initSideMenu();
    this._renderSideMenu();
    this._bindTopControls();
    this._bindMetricsToggle();

    // 4. Рендерим начальное состояние
    this._render();

    // 5. Подключаем ввод
    this._initInput();
    saveActiveTaskId(this.task.id);
    // 7. Клик по коду = вернуть фокус в hiddenInput
    const codeArea = document.getElementById("codeArea");
    if (codeArea) {
      codeArea.addEventListener("mousedown", (e) => {
        // mousedown лучше чем click: фокус возвращается раньше
        e.preventDefault();
        this.input.focus();
      });
    }

    // 8. Если фокус ушёл — возвращаем (иначе "ввод не работает")
    window.addEventListener("blur", () => {
      // когда вернёшься в окно
      setTimeout(() => this.input?.focus(), 0);
    });

    // 6. Сохраняем активное задание
    saveActiveTaskId(this.task.id);
  }

  /**
   * Корректное уничтожение приложения
   * (на будущее: смена задания, hot reload и т.п.)
   */
  destroy() {
    if (this.input) {
      this.input.detach();
      this.input = null;
    }

    this.session = null;
    this.task = null;
    this.ui = null;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // ВНУТРЕННЯЯ ЛОГИКА (ПРИВАТНЫЕ МЕТОДЫ)
  // ---------------------------------------------------------------------------

  /**
   * Создание Task.
   * Сейчас — один источник (window.CODE_TO_TYPE),
   * позже здесь появится:
   * - меню заданий
   * - курсы
   * - режимы
   */
  _buildTasks() {
    // RAW_TASKS: [{typeId, subtypeId, variantId, code}, ...]
    const tasks = RAW_TASKS.map((t) => {
      return new Task(String(t.typeId), String(t.code), {
        subtypeId: String(t.subtypeId),
        variantId: String(t.variantId),
        title: `Задание ${t.typeId}`, // можно поменять потом
        tags: ["ege"],
      });
    });

    // сортируем по номеру задания (typeId) и варианту
    tasks.sort((a, b) => {
      const ai = Number(a.typeId), bi = Number(b.typeId);
      if (ai !== bi) return ai - bi;
      const as = Number(a.subtypeId), bs = Number(b.subtypeId);
      if (as !== bs) return as - bs;
      return Number(a.variantId) - Number(b.variantId);
    });

    return tasks;
  }

  _pickInitialTask(tasks) {
    const lastId = loadActiveTaskId();
    if (lastId) {
      const found = tasks.find((x) => x.id === lastId);
      if (found) return found;
    }
    // если нет сохранённого — рандомная (как ты хотел)
    return tasks[Math.floor(Math.random() * tasks.length)];
  }

  /**
   * Загружает сохранённую сессию или создаёт новую
   */
  _loadOrCreateSession(task) {
    const loaded = loadSession(task.id, TaskSession, task);
    if (loaded) return loaded;
    return new TaskSession(task);
  }

  /**
   * Инициализация контроллера ввода
   */
  _initInput() {
    this._startTicker(); // всегда запускаем
    this.input = new InputController(this.inputEl, {
      onChar: (ch) => this._handleChar(ch),
      onBackspace: () => this._handleBackspace(),
      onEnter: () => this._handleEnter(),
      onTab: () => this._handleTab(),
    });

    this.input.attach();
    this.input.focus();
    // Клик по области кода = вернуть фокус в hiddenInput
    const codeArea = document.getElementById("codeArea");
    if (codeArea) {
      codeArea.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.input.focus();
      });
    }
  }


  // ---------------------------------------------------------------------------
  // ОБРАБОТЧИКИ ВВОДА
  // ---------------------------------------------------------------------------

  _handleChar(ch) {
    if (!this.session || this.session.finished) return; // защита от “зомби-ввода”
    this.session.input(ch);
    this._afterSessionUpdate();
  }

  _handleBackspace() {
    if (!this.session || this.session.finished) return;
    this.session.backspace();
    this._afterSessionUpdate();
  }


  _handleEnter() {
    if (!this.session || this.session.finished) return;
    this.session.input("\n");
    this._afterSessionUpdate();
  }

  _handleTab() {
    if (!this.session || this.session.finished) return;
    this.session.input("\t");
    this._afterSessionUpdate();
  }

  // ---------------------------------------------------------------------------
  // ОБЩИЕ ШАГИ ПОСЛЕ ЛЮБОГО ИЗМЕНЕНИЯ СЕССИИ
  // ---------------------------------------------------------------------------

  /**
   * Вызывается после любого действия пользователя.
   * Единственное место, где:
   * - сохраняем
   * - рендерим
   * - проверяем завершение
   */
  _afterSessionUpdate() {
    this._save();
    this._render();

    // если началась попытка — запускаем тикер

    if (this.session.finished) {
      this._onFinished();
    }
  }


  /**
   * Рендер UI
   */
  _render() {
    if (!this.ui) return;
    this.ui.render(this.session);
  }

  /**
   * Сохранение состояния
   */
  _save() {
    if (!this.task || !this.session) return;
    saveSession(this.task.id, this.session);
  }

  /**
   * Обработка завершения задания
   */
  _onFinished() {
    if (this.input) this.input.setEnabled(false);
  }

  // UI сам решает, что показать
  // App только сообщает факт завершения


  _bindTopControls() {
    // Start: начать заново, но “память об ошибках” (fixed) оставляем
    if (this.startBtn) {
      this.startBtn.addEventListener("click", () => {
        this._restartAttemptKeepFixed();
      });
    }

    // Reset: полный сброс прогресса + удалить из localStorage
    if (this.resetBtn) {
      this.resetBtn.addEventListener("click", () => {
        this._hardResetAndClearStorage();
      });
    }

    // Клик по коду — фокус в скрытый инпут (удобство)
    if (this.ui?.codeArea) {
      this.ui.codeArea.addEventListener("click", () => {
        if (this.input) this.input.focus();
      });
    }
  }

  _restartAttemptKeepFixed() {
    if (!this.session) return;

    // Сбрасываем ввод, но fixed не трогаем — как в старой версии “Начать заново”
    for (const s of this.session.symbols) {
      s.entered = false;
      s.correct = null;
      s.typed = null;
      s.fixed = false;
    }

    this.session.cursor = 0;
    this.session.duration = 0;
    this.session.startedAt = null;
    this.session.endedAt = null;
    this.session.active = false;
    this.session.finished = false;
    this.session.atEnd = false;

    if (this.input) this.input.setEnabled(true);
    if (this.ui) this.ui.hideResults();

    this._save();
    this._render();
    if (this.input) this.input.focus();
  }

  _hardResetAndClearStorage() {
    if (!this.session || !this.task) return;

    // Полный reset (обнуляет fixed тоже)
    this.session.reset();

    // ВАЖНО: удаляем сохранёнку, иначе при перезагрузке “воскреснет старый прогресс”
    clearSession(this.task.id);

    if (this.input) this.input.setEnabled(true);
    if (this.ui) this.ui.hideResults();

    // Можно не saveSession после clearSession — но рендер нужен
    this._render();
    if (this.input) this.input.focus();
  }

  // -----------------------------
  // КНОПКИ результата (retry/close/export)
  // -----------------------------

  _onRetry() {
    // Retry логично делать как “начать заново” (fixed оставляем)
    this._restartAttemptKeepFixed();
  }

  _onCloseResults() {
    // Просто закрыть панель, ввод остаётся заблокированным если finished
    // (иначе ученик “допечатает” завершённое — это цирк)
    if (this.ui) this.ui.hideResults();
  }

  _onExport() {
    // Быстрый экспорт в JSON (для отладки/переноса прогресса)
    try {
      const payload = {
        taskId: this.task?.id,
        savedAt: Date.now(),
        session: this.session?.toJSON?.() ?? null,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "typing_session.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // молча, чтобы не ронять апп
      console.warn("Export failed:", e);
    }
  }
  _startTicker() {
    if (this._tickInterval) return;

    this._tickInterval = setInterval(() => {
      if (!this.session) return;

      // startedAt установлен = попытка реально началась
      if (this.session.startedAt && !this.session.finished) {
        this._render();
      }
    }, this._tickMs);
  }

  _stopTicker() {
    if (!this._tickInterval) return;
    clearInterval(this._tickInterval);
    this._tickInterval = null;
  }
  _initSideMenu() {
    if (this.openMenuBtn && this.sideMenu) {
      this.openMenuBtn.addEventListener("click", () => {
        this.sideMenu.classList.toggle("open");
      });
    }

    // клик вне меню — закрыть (опционально, но удобно)
    document.addEventListener("click", (e) => {
      if (!this.sideMenu || !this.openMenuBtn) return;
      const inside = this.sideMenu.contains(e.target) || this.openMenuBtn.contains(e.target);
      if (!inside) this.sideMenu.classList.remove("open");
    });
  }

  _renderSideMenu() {
    if (!this.sideMenuList) return;
    this.sideMenuList.innerHTML = "";

    for (const t of this.tasks) {
      const li = document.createElement("li");
      li.textContent = `Задание №${t.typeId}`;
      if (this.task && t.id === this.task.id) li.classList.add("selected");

      li.addEventListener("click", () => {
        this._switchTask(t.id);
      });

      this.sideMenuList.appendChild(li);
    }
  }

  _switchTask(taskId) {
    const next = this.tasks.find((x) => x.id === taskId);
    if (!next) return;
    if (this.task && next.id === this.task.id) {
      this.sideMenu?.classList.remove("open");
      return;
    }

    // закрыть меню + закрыть результаты (как ты хотел)
    this.sideMenu?.classList.remove("open");
    this.ui?.hideResults();

    // переключить task/session
    this.task = next;
    this.session = this._loadOrCreateSession(this.task);

    // сохранить активное
    saveActiveTaskId(this.task.id);

    // включить ввод и перерендерить
    this.input?.setEnabled(true);
    this._render();

    // обновить подсветку выбранного в меню
    this._renderSideMenu();

    this.input?.focus();
  }

  _bindMetricsToggle() {
    const key = "topCollapsed";
    const panelEl = document.querySelector(".panel");
    if (!panelEl || !this.metricsToggleBtn) return;

    const apply = (collapsed) => {
      panelEl.classList.toggle("panel--top-collapsed", collapsed);
      this.metricsToggleBtn.textContent = collapsed ? "▼" : "▲";
    };

    // по дефолту развёрнуто
    apply(localStorage.getItem(key) === "1");

    this.metricsToggleBtn.addEventListener("click", () => {
      const collapsed = !panelEl.classList.contains("panel--top-collapsed");
      localStorage.setItem(key, collapsed ? "1" : "0");
      apply(collapsed);
    });
  }
}

// ---------------------------------------------------------------------------
// АВТОЗАПУСК
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();

  // Для отладки (можно убрать позже)
  window.__APP__ = app;
});