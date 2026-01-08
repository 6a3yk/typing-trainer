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
    // Гонка (race)
    // ----------------------------
    this.raceWrap = document.getElementById("raceWrap");
    this.raceTrack = document.getElementById("raceTrack");
    this.raceCar = document.getElementById("raceCar");
    this.raceToggle = document.getElementById("raceToggle");

    this.raceEnabled = false; // App выставит
    this._lastWrong = 0;

    this.btnNextTask = document.getElementById("btnNextTask");
    this.autoNextToggle = document.getElementById("autoNextToggle");
    this.streakEl = document.getElementById("streak");
    this.resBestStreakEl = document.getElementById("resBestStreak");
    // ----------------------------
    // Панель результатов
    // ----------------------------

    this.resultsPanel = document.getElementById("resultsPanel");
    this.resTimeEl = document.getElementById("resTime");
    this.resCpmEl = document.getElementById("resCpm");
    this.resAccEl = document.getElementById("resAcc");
    this.resRankEl = document.getElementById("resRank");

    this.retryBtn = document.getElementById("retryBtn");
    this.exportBtn = document.getElementById("exportBtn");
    this.closeResBtn = document.getElementById("closeResBtn");

    // Флаги состояния UI
    this.resultsVisible = false;
    this._lastCursor = -1;

    // Подписки (будут задаваться снаружи, из App)
    this.handlers = {
      onNextTask: null,
      onAutoNextToggle: null,
      onRaceToggle: null,
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

      if (s.entered && s.correct === false && s.typed) {
        // если ожидался TAB, но ввели что-то другое — "растягиваем" до 4 позиций
        if (s.expected === "\t") {
          const ch = (s.typed === "\n") ? "↵" : (s.typed === "\t" ? " " : s.typed);
          text = ch + "   "; // 1 символ + 3 пробела = ширина таба (4)
        } else {
          // обычная ошибка: если ввели TAB/ENTER "ложно" — показываем стрелку, 1 символ
          if (s.typed === "\t") text = "→";      // ложный Tab
          else if (s.typed === "\n") text = "↵"; // ложный Enter
          else text = s.typed;
        }
      }
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

  setRaceEnabled(enabled) {
    this.raceEnabled = !!enabled;

    if (this.raceWrap) {
      this.raceWrap.style.display = this.raceEnabled ? "block" : "none";
      this.raceWrap.setAttribute("aria-hidden", this.raceEnabled ? "false" : "true");
    }
    if (this.raceToggle) {
      this.raceToggle.checked = this.raceEnabled;
    }
  }

  _updateRace(stats) {
    if (!this.raceEnabled) return;
    if (!stats || !this.raceTrack || !this.raceCar) return;

    const total = stats.total ?? 0;
    const correct = stats.correct ?? 0; // <-- важно: только правильные двигают
    const pct = total > 0 ? Math.max(0, Math.min(1, correct / total)) : 0;

    const trackW = this.raceTrack.clientWidth;
    const carW = this.raceCar.clientWidth || 28;
    const padding = 8; // совпадает с left у стартовой зоны
    const maxX = Math.max(0, trackW - carW - padding * 2);
    const x = Math.round(pct * maxX);

    // Важно: для shake-анимации сохраняем X в CSS-переменную
    this.raceCar.style.setProperty("--race-x", `${x}px`);
    this.raceCar.style.transform = `translate(${x}px, -50%)`;

    // Состояние по точности
    const acc = stats.accuracy ?? 1;
    this.raceCar.classList.toggle("car--smoke", acc < 0.97 && acc >= 0.90);
    this.raceCar.classList.toggle("car--broken", acc < 0.90);

    // "Занос" на ошибке (wrong увеличился)
    const wrong = stats.wrong ?? 0;
    if (wrong > this._lastWrong) {
      this.raceCar.classList.remove("car--shake");
      // reflow чтобы анимация сработала повторно
      void this.raceCar.offsetWidth;
      this.raceCar.classList.add("car--shake");
    }
    this._lastWrong = wrong;
  }



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


    this._updateRace(stats);
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

    // CPM
    if (this.resCpmEl) {
      this.resCpmEl.textContent = String(stats.cpm ?? 0);
    }
    // Accuracy в процентах
    if (this.resAccEl) {
      this.resAccEl.textContent = `${Math.round((stats.accuracy ?? 1) * 100)}%`;
    }


    if (this.resRankEl) {
      this.resRankEl.textContent = this._calcRank(stats);
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
    if (this.raceToggle) {
      this.raceToggle.addEventListener("change", () => {
        const enabled = !!this.raceToggle.checked;
        this.setRaceEnabled(enabled);

        if (typeof this.handlers.onRaceToggle === "function") {
          this.handlers.onRaceToggle(enabled);
        }
      });
    }

    if (this.btnNextTask) {
      this.btnNextTask.addEventListener("click", () => {
        if (typeof this.handlers.onNextTask === "function") {
          this.handlers.onNextTask();
        }
      });
    }

    if (this.autoNextToggle) {
      this.autoNextToggle.addEventListener("change", () => {
        const enabled = !!this.autoNextToggle.checked;
        if (typeof this.handlers.onAutoNextToggle === "function") {
          this.handlers.onAutoNextToggle(enabled);
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


  _calcRank(stats) {
    const accPct = Math.round((stats.accuracy ?? 1) * 100); // 0..100
    const cpm = Number(stats.cpm ?? 0);

    if (accPct < 20) return "Бот";
    if (accPct < 50) return "Печатал ногами";
    if (accPct < 70) return "Новичок";

    if (accPct < 80) {
      return cpm > 100 ? "ТурбоЛяп" : "Пальцем в небо";
    }

    if (accPct < 90) {
      return cpm > 100 ? "Печатная машинка" : "Рерайтер";
    }

    if (accPct < 100) {
      if (cpm < 100) return "Снайпер";
      if (cpm < 200) return "Мастер";
      return "Программист";
    }

    // accPct === 100
    if (cpm < 150) return "Перфекционист";
    if (cpm < 300) return "Разработчик этого проекта";
    return "ЧИТЕР";
  }

  setAutoNextEnabled(enabled) {
    if (this.autoNextToggle) this.autoNextToggle.checked = !!enabled;
  }
  setStreak(current) {
    if (this.streakEl) {
      this.streakEl.textContent = String(current);
    }
  }

  setBestStreak(best) {
    if (this.resBestStreakEl) {
      this.resBestStreakEl.textContent = String(best);
    }
  }
}