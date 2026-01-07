// ui.js
// UI-слой приложения.
//
// Назначение:
// - отрисовывать состояние сессии
// - показывать статистику
// - показывать экран результата
//
// ВАЖНО:
// - UI НЕ меняет состояние
// - UI НЕ знает про ввод
// - UI НЕ знает про TaskSession как сущность
// - UI работает ТОЛЬКО с данными, которые ей передали
//
// UI = "глупый экран"

export class UI {
  constructor() {
    // ----------------------------
    // Основные DOM-элементы
    // ----------------------------
    this.codeArea = document.getElementById("codeArea");
    this.timerEl = document.getElementById("timer");
    this.progressEl = document.getElementById("progress");
    this.errorsEl = document.getElementById("errors");

    this.cpmEl = document.getElementById("cpm");
    this.accuracyEl = document.getElementById("accuracy");
    // ----------------------------
    // Панель результатов
    // ----------------------------

    this.resultsPanel = document.getElementById("resultsPanel");
    this.resTimeEl = document.getElementById("resTime");
    this.resCpmEl = document.getElementById("resCpm");
    this.resAccEl = document.getElementById("resAcc");
    this.resErrorsEl = document.getElementById("resErrors");

    this.retryBtn = document.getElementById("retryBtn");
    this.exportBtn = document.getElementById("exportBtn");
    this.closeResBtn = document.getElementById("closeResBtn");

    // Флаги состояния UI
    this.resultsVisible = false;
    this._lastCursor = -1;

    // Подписки (будут задаваться снаружи, из App)
    this.handlers = {
      onRetry: null,
      onCloseResults: null,
      onExport: null,
    };

    // Навешиваем события кнопок (один раз)
    this._bindControls();
  }

  // ---------------------------------------------------------------------------
  // ПУБЛИЧНЫЙ API
  // ---------------------------------------------------------------------------

  /**
   * Главный метод рендера.
   * App вызывает его после любого изменения состояния.
   *
   * @param {Object} session - объект с методами:
   *   - getRenderArray()
   *   - getStats()
   */
  render(session) {
    if (!session) return;

    const stats = session.getStats();

    // ВАЖНО: рендерим по session.symbols, чтобы получить correct/wrong
    this._renderCodeFromSymbols(session.symbols, stats.cursor);

    this._renderStats(stats);

    if (stats.finished) this._showResults(stats);
  }
  _renderCodeFromSymbols(symbols, cursor) {
    if (!this.codeArea) return;
    this.codeArea.innerHTML = "";

    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];

      const span = document.createElement("span");
      span.classList.add("token");
      if (i === cursor) span.classList.add("current");
      if (s.entered && s.correct === true) span.classList.add("correct");
      if (s.entered && s.correct === false) span.classList.add("wrong");
      if (s.expected === "\n") span.classList.add("newline");

      // текст: как в твоём renderSymbol (упрощённо)
      let text = s.expected;
      if (s.expected === "\t") text = "    ";
      if (s.expected === "\n") text = (i === cursor ? "↵" : "\u00A0");
      if (s.entered && s.correct === false && s.typed) text = s.typed === "\n" ? "\u00A0" : s.typed;

      span.textContent = text || "\u00A0";
      this.codeArea.appendChild(span);

      if (s.expected === "\n") this.codeArea.appendChild(document.createTextNode("\n"));
    }
    // автоскролл к текущему символу (только если курсор реально изменился)
    if (cursor !== this._lastCursor) {
      this._lastCursor = cursor;

      const cur = this.codeArea.querySelector(".token.current");
      if (cur) {
        requestAnimationFrame(() => {
          cur.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "smooth",
          });
        });
      }
    }
  }
  /**
   * Позволяет App подписаться на события UI
   */
  setHandlers(handlers = {}) {
    this.handlers = {
      ...this.handlers,
      ...handlers,
    };
  }

  /**
   * Скрыть панель результатов
   */
  hideResults() {
    if (!this.resultsPanel) return;
    this.resultsPanel.style.display = "none";
    this.resultsVisible = false;
  }

  // ---------------------------------------------------------------------------
  // РЕНДЕР КОДА
  // ---------------------------------------------------------------------------

  /**
   * Отрисовка области кода.
   * Получает уже ГОТОВЫЕ символы для отображения.
   */
  // _renderCode(chars, cursor) {
  //   if (!this.codeArea) return;

  //   this.codeArea.innerHTML = "";

  //   for (let i = 0; i < chars.length; i++) {
  //     const ch = chars[i];
  //     const span = document.createElement("span");
  //     span.className = "token" + (i === cursor ? " current" : "");
  //     span.textContent = ch === "" ? "\u00A0" : ch; // чтобы курсор был виден даже на "пустых" (например newline)
  //     this.codeArea.appendChild(span);

  //     // сохраняем переносы строк, чтобы white-space: pre работал ожидаемо
  //     if (ch === "\n") this.codeArea.appendChild(document.createTextNode("\n"));
  //   }
  // }

  // ---------------------------------------------------------------------------
  // РЕНДЕР СТАТИСТИКИ
  // ---------------------------------------------------------------------------

  _renderStats(stats) {
    if (!stats) return;

    // Прогресс — по твоей формуле entered/total
    if (this.progressEl) {
      this.progressEl.textContent = `${stats.entered} / ${stats.total}`;
    }

    // Ошибки — wrong
    if (this.errorsEl) {
      this.errorsEl.textContent = String(stats.wrong ?? 0);
    }

    // Время
    if (this.timerEl) {
      this.timerEl.textContent = this._formatTime(stats.timeMs);
    }
    // CPM (в реальном времени)
    if (this.cpmEl) {
      this.cpmEl.textContent = String(stats.cpm ?? 0);
    }

    // Accuracy (в реальном времени)
    if (this.accuracyEl) {
      const hasInput = (stats.entered ?? 0) > 0;
      this.accuracyEl.textContent = hasInput
        ? `${Math.round((stats.accuracy ?? 1) * 100)}%`
        : "—";
    }
  }

  // ---------------------------------------------------------------------------
  // ПАНЕЛЬ РЕЗУЛЬТАТОВ
  // ---------------------------------------------------------------------------

  _showResults(stats) {
    if (!this.resultsPanel || this.resultsVisible) return;

    this.resultsVisible = true;
    this.resultsPanel.style.display = "block";

    if (this.resTimeEl) {
      this.resTimeEl.textContent = this._formatTime(stats.timeMs);
    }

    if (this.resErrorsEl) {
      this.resErrorsEl.textContent = String(stats.wrong ?? 0);
    }

    // CPM
    if (this.resCpmEl) {
      this.resCpmEl.textContent = String(stats.cpm ?? 0);
    }
    // Accuracy в процентах
    if (this.resAccEl) {
      this.resAccEl.textContent = `${Math.round((stats.accuracy ?? 1) * 100)}%`;
    }


  }

  // ---------------------------------------------------------------------------
  // КНОПКИ И СОБЫТИЯ
  // ---------------------------------------------------------------------------

  _bindControls() {
    if (this.retryBtn) {
      this.retryBtn.addEventListener("click", () => {
        if (typeof this.handlers.onRetry === "function") {
          this.handlers.onRetry();
        }
      });
    }

    if (this.closeResBtn) {
      this.closeResBtn.addEventListener("click", () => {
        this.hideResults();
        if (typeof this.handlers.onCloseResults === "function") {
          this.handlers.onCloseResults();
        }
      });
    }

    if (this.exportBtn) {
      this.exportBtn.addEventListener("click", () => {
        if (typeof this.handlers.onExport === "function") {
          this.handlers.onExport();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // УТИЛИТЫ
  // ---------------------------------------------------------------------------

  _formatTime(ms = 0) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }
}