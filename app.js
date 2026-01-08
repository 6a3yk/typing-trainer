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
  saveAutoNextEnabled,
  loadAutoNextEnabled,
  saveRaceEnabled,
  loadRaceEnabled,
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
    this.inputElDesktop = document.getElementById("hiddenInput");
    this.inputElMobile = document.getElementById("hiddenInputPwd");
    this.inputEl = null;

    // Флаг инициализации
    this.initialized = false;
    this.startBtn = document.getElementById("startBtn");
    this.resetBtn = document.getElementById("resetBtn");
    this.tasks = [];
    this.sideMenu = document.getElementById("sideMenu");
    this.sideMenuList = document.getElementById("sideMenuList");
    this.openMenuBtn = document.getElementById("openMenuBtn");


    this.isMobile = false;
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

    this.currentStreak = 0;
    this.bestStreak = 0;


    this.ui.setHandlers({
      onRaceToggle: (enabled) => {
        saveRaceEnabled(enabled);
        // UI уже сам спрятал/показал, но можно подстраховаться
        this.ui.setRaceEnabled(enabled);
        this.input?.focus();
      },
      onRetry: () => {
        this.session.reset();
        this._onRetry()
        // localStorage.clear();      // грубо, но для быстрого релиза ок
        this.input?.setEnabled(true);
        this._render();

        this.input?.focus();
        track("retry_task", {
          task_id: this.task.id,
        });
      },
      onCloseResults: () => {
        this._onCloseResults()
        this.input?.setEnabled(true);
        this.input?.focus();
      },
      onExport: () => this._onExport(),
      onNextTask: () => {
        this._cancelAutoNext();
        this._switchToNextTask();
        track("next_task", {
          task_id: this.task.id,
        });

      },

      onAutoNextToggle: (enabled) => {
        this.autoNextEnabled = !!enabled;
        saveAutoNextEnabled(this.autoNextEnabled);
        this.ui.setAutoNextEnabled(this.autoNextEnabled);

        // если юзер включил уже на экране результата — можно сразу запланировать
        if (this.session?.finished && this.autoNextEnabled) {
          this._scheduleAutoNext();
        } else {
          this._cancelAutoNext();
        }
      },
    });
    this._initSideMenu();
    this._renderSideMenu();
    this._bindTopControls();
    this._bindMetricsToggle();
    // 5. Подключаем ввод
    const isMobileLike =
      (navigator.maxTouchPoints ?? 0) > 0 && matchMedia("(pointer: coarse)").matches;

    this.isMobile = isMobileLike;

    const defaultAutoNext = false; // безопасный дефолт
    this.autoNextEnabled = loadAutoNextEnabled(defaultAutoNext);
    this.autoNextDelayMs = 7000; // 5-10 сек, выбрал 7
    this._autoNextTimer = null;

    this.ui.setAutoNextEnabled(this.autoNextEnabled);

    // Настройка "Гонка": desktop ON, mobile OFF
    const defaultRaceEnabled = !isMobileLike;
    const raceEnabled = loadRaceEnabled(defaultRaceEnabled);
    this.ui.setRaceEnabled(raceEnabled);


    // 4. Рендерим начальное состояние
    this._render();

    this.inputEl = isMobileLike ? this.inputElMobile : this.inputElDesktop;
    this._initInput();
    this._bindFabKeys();
    saveActiveTaskId(this.task.id);
    // 7. Клик по коду = вернуть фокус в hiddenInput
    const codeArea = document.getElementById("codeArea");
    if (codeArea) {
      codeArea.addEventListener("mousedown", (e) => {
        // mousedown лучше чем click: фокус возвращается раньше
        e.preventDefault();
        this.input.focus();
      });
      codeArea.addEventListener("pointerdown", (e) => {
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
    // this._startTicker(); // всегда запускаем
    this.input = new InputController(this.inputEl, {
      onChar: (ch) => this._handleChar(ch),
      onBackspace: () => this._handleBackspace(),
      onEnter: () => this._handleEnter(),
      onTab: () => this._handleTab(),
    });
    this.input.setMode(this.isMobile ? "mobile" : "desktop");

    this.input.attach();
    this.input.focus();
  }


  // ---------------------------------------------------------------------------
  // ОБРАБОТЧИКИ ВВОДА
  // ---------------------------------------------------------------------------

  _handleChar(ch) {
    if (!this.session || this.session.finished) return; // защита от “зомби-ввода”
    this.session.input(ch);
    if (!this._typingStarted) {
      this._typingStarted = true;
      track("typing_start", {
        task_id: this.task.id,
      });
    }
    const i = this.session.cursor - 1;
    const s = this.session.symbols[i];

    if (s && s.correct === true) {
      this.currentStreak += 1;
      if (this.currentStreak > this.bestStreak) {
        this.bestStreak = this.currentStreak;
      }
    } else {
      this.currentStreak = 0;
    }

    this.ui.setStreak(this.currentStreak);
    // мини-бонус: пульс на значимых стриках
    if (
      this.currentStreak === 25 ||
      this.currentStreak === 50 ||
      this.currentStreak === 100
    ) {
      const el = this.ui.streakEl;
      if (el) {
        el.classList.remove("pulse"); // на случай повторного срабатывания
        void el.offsetWidth;          // форсируем reflow
        el.classList.add("pulse");
        setTimeout(() => el.classList.remove("pulse"), 160);
      }
    }
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
    if (this.autoNextEnabled) {
      this._scheduleAutoNext();
    }
    this.ui.setBestStreak(this.bestStreak);
    track("task_finish", {
      task_id: this.task.id,
      duration_sec: Math.round(stats.timeMs / 1000),
      accuracy: Math.round((stats.accuracy ?? 0) * 100),
      cpm: Math.round(stats.cpm ?? 0),
      rank: this.ui._calcRank(stats), // или сохранённый текст ранга
      best_streak: this.bestStreak ?? 0,
    });
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
    this._cancelAutoNext();
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.ui.setStreak(0);
    this._typingStarted = false;
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
    this._cancelAutoNext();
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.ui.setStreak(0);
    this._typingStarted = false;

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

    track("task_open", {
      task_id: this.task.id,
      task_type: this.task.typeId,
      subtype_id: this.task.subtypeId,
      variant_id: this.task.variantId,
    });
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

  _bindFabKeys() {
    const btn = document.getElementById("fabTab");
    const box = document.getElementById("fabKeys");
    if (!btn || !box) return;

    // страховка: если это не тач — не работаем вообще
    const isTouch = (navigator.maxTouchPoints ?? 0) > 0 && matchMedia("(pointer: coarse)").matches;
    if (!isTouch) {
      box.style.display = "none";
      return;
    }

    // pointerdown, чтобы не терять фокус и не получать "клик с задержкой"
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // не уводим фокус с hiddenInput
      e.stopPropagation();

      this._handleTab();  // вставит '\t' в сессию
      this.input?.focus(); // клавиатура остаётся открытой
    });
    const vv = window.visualViewport;

    const updatePos = () => {
      // Базовые отступы
      const marginLeft = 14;
      const marginBottom = 14;

      // Safe-area (iOS/Android может быть 0, но ок)
      const safeLeft = Number.parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--safe-left")) || 0;
      const safeBottom = Number.parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--safe-bottom")) || 0;

      // Подъём над клавиатурой (Android Chrome)
      let keyboardLift = 0;
      let offX = 0;
      let offY = 0;

      if (vv) {
        offX = vv.offsetLeft || 0;
        offY = vv.offsetTop || 0;

        // если клавиатура открылась, visualViewport.height меньше
        keyboardLift = Math.max(
          0,
          window.innerHeight - (vv.height + offY)
        );
      }

      // Фиксируем слева и над клавиатурой
      box.style.left = `${marginLeft + safeLeft}px`;
      box.style.bottom = `${marginBottom + safeBottom + keyboardLift}px`;

      // КЛЮЧЕВОЕ: при зуме/панорамировании "прибиваем" к visual viewport
      // иначе fixed уедет относительно видимой области
      box.style.transform = `translate3d(${offX}px, ${offY}px, 0)`;
    };

    // Инициализация и подписки
    updatePos();

    if (vv) {
      vv.addEventListener("resize", updatePos);
      vv.addEventListener("scroll", updatePos); // важнее всего при перетаскивании/зуме
    }
    window.addEventListener("resize", updatePos);
  }
  _switchToNextTask() {
    const idx = this.tasks.findIndex((t) => t.id === this.task?.id);
    if (idx < 0) return;

    const next = this.tasks[(idx + 1) % this.tasks.length];
    this._switchTask(next.id);
  }

  _cancelAutoNext() {
    if (this._autoNextTimer) {
      clearTimeout(this._autoNextTimer);
      this._autoNextTimer = null;
    }
  }

  _scheduleAutoNext() {
    this._cancelAutoNext();
    this._autoNextTimer = setTimeout(() => {
      this._autoNextTimer = null;
      // если всё ещё на завершённой задаче и автосмена включена
      if (this.autoNextEnabled && this.session?.finished) {
        this._switchToNextTask();
      }
    }, this.autoNextDelayMs);
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



function track(event, params = {}) {
  if (!window.gtag) return;
  window.gtag("event", event, params);
}