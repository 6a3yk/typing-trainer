function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * @param {string} selector
 * @returns {HTMLElement}
 */
function requireElement(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

/**
 * @param {string} selector
 * @returns {HTMLInputElement}
 */
function requireInput(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Required input not found: ${selector}`);
  }
  return element;
}

/**
 * @param {string} selector
 * @returns {HTMLButtonElement}
 */
function requireButton(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Required button not found: ${selector}`);
  }
  return element;
}

/**
 * @param {string} selector
 * @returns {HTMLAudioElement}
 */
function requireAudio(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLAudioElement)) {
    throw new Error(`Required audio element not found: ${selector}`);
  }
  return element;
}

function groupTasks(tasks) {
  const groups = new Map();

  for (const task of tasks) {
    if (!groups.has(task.typeId)) {
      groups.set(task.typeId, new Map());
    }

    const subtypeMap = groups.get(task.typeId);
    if (!subtypeMap.has(task.subtypeId)) {
      subtypeMap.set(task.subtypeId, []);
    }

    subtypeMap.get(task.subtypeId).push(task);
  }

  return groups;
}

const EXPLANATION_SLIDES = new Map([
  ["5-1-1", {
    src: "./test_image_5-1-1.png",
    alt: "Слайд объяснения для задания 5-1-1"
  }]
]);
const PYTHON_KEYWORDS = new Set([
  "and", "as", "assert", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "False", "finally", "for", "from", "global", "if", "import",
  "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise",
  "return", "True", "try", "while", "with", "yield"
]);

const PYTHON_BUILTINS = new Set([
  "abs", "all", "any", "bin", "bool", "chr", "dict", "divmod", "enumerate",
  "eval", "filter", "float", "hex", "input", "int", "isinstance", "len", "list",
  "map", "max", "min", "oct", "open", "ord", "pow", "print", "range", "reversed",
  "round", "set", "sorted", "str", "sum", "tuple", "zip"
]);

const PYTHON_STDLIB_HELPERS = new Set([
  "bk", "cache", "ceil", "dist", "done", "dot", "down", "fd", "fnmatch", "ip_network",
  "log2", "lt", "product", "rt", "screensize", "setpos", "tracer", "up"
]);

const PYTHON_SPECIAL_NAMES = new Set([
  ...PYTHON_BUILTINS,
  ...PYTHON_STDLIB_HELPERS
]);

function findPythonCommentStart(line) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "#") {
      return index;
    }

    if (char === "'" || char === '"') {
      quote = char;
    }
  }

  return -1;
}
function markRange(map, start, end, tokenType) {
  for (let index = start; index < end; index += 1) {
    if (!map[index]) {
      map[index] = tokenType;
    }
  }
}

function buildSyntaxMap(code) {
  const map = new Array(code.length).fill("");
  const lines = code.split("\n");
  let offset = 0;

  for (const line of lines) {
    const lineStart = offset;
    const commentIndex = findPythonCommentStart(line);
    const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;

    if (commentIndex >= 0) {
      markRange(map, lineStart + commentIndex, lineStart + line.length, "syntax-comment");
    }

    const stringRegex = /([rubfRUBF]*)(['"])(?:(?!\2|\\).|\\.)*\2/g;
    let match;
    while ((match = stringRegex.exec(codePart)) !== null) {
      markRange(map, lineStart + match.index, lineStart + match.index + match[0].length, "syntax-string");
    }

    const decoratorMatch = codePart.match(/^\s*@[\w.]+/);
    if (decoratorMatch) {
      markRange(map, lineStart + decoratorMatch.index, lineStart + decoratorMatch.index + decoratorMatch[0].length, "syntax-decorator");
    }

    const numberRegex = /\b\d[\d_]*(?:\.\d+)?\b/g;
    while ((match = numberRegex.exec(codePart)) !== null) {
      markRange(map, lineStart + match.index, lineStart + match.index + match[0].length, "syntax-number");
    }

    const keywordRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    while ((match = keywordRegex.exec(codePart)) !== null) {
      const token = match[0];
      if (PYTHON_KEYWORDS.has(token)) {
        markRange(map, lineStart + match.index, lineStart + match.index + token.length, "syntax-keyword");
      } else if (PYTHON_SPECIAL_NAMES.has(token)) {
        markRange(map, lineStart + match.index, lineStart + match.index + token.length, "syntax-builtin");
      }
    }

    const defMatch = codePart.match(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (defMatch) {
      const nameStart = codePart.indexOf(defMatch[1], defMatch.index);
      markRange(map, lineStart + nameStart, lineStart + nameStart + defMatch[1].length, "syntax-function");
    }

    const classMatch = codePart.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      const nameStart = codePart.indexOf(classMatch[1], classMatch.index);
      markRange(map, lineStart + nameStart, lineStart + nameStart + classMatch[1].length, "syntax-class");
    }

    offset += line.length + 1;
  }

  return map;
}

const RANK_COLUMN_TITLES = ["Junior", "Middle", "Senior"];

function createRankRule({ label, accuracy, speed, sortAccuracy, sortSpeed, when }) {
  return {
    label,
    hint: `Точность: ${accuracy}\nСкорость: ${speed}`,
    sortAccuracy,
    sortSpeed,
    when
  };
}

const RANK_RULES = [
  createRankRule({ label: "Бот", accuracy: "0%-20%", speed: "0+", sortAccuracy: 0, sortSpeed: 0, when: ({ accPct }) => accPct < 20 }),
  createRankRule({ label: "Печатал ногами", accuracy: "20%-50%", speed: "0+", sortAccuracy: 20, sortSpeed: 0, when: ({ accPct }) => accPct < 50 }),
  createRankRule({ label: "Новичок", accuracy: "50%-70%", speed: "0+", sortAccuracy: 50, sortSpeed: 0, when: ({ accPct }) => accPct < 70 }),
  createRankRule({ label: "Пальцем в небо", accuracy: "70%-80%", speed: "0-100", sortAccuracy: 70, sortSpeed: 0, when: ({ accPct }) => accPct < 80 }),
  createRankRule({ label: "Рерайтер", accuracy: "80%-90%", speed: "0-100", sortAccuracy: 80, sortSpeed: 0, when: ({ accPct }) => accPct < 90 }),
  createRankRule({ label: "Снайпер", accuracy: "90%-100%", speed: "0-100", sortAccuracy: 90, sortSpeed: 0, when: ({ accPct, cpm }) => accPct < 100 && cpm < 100 }),
  createRankRule({ label: "ТурбоЛяп", accuracy: "70%-80%", speed: "100+", sortAccuracy: 70, sortSpeed: 100, when: ({ accPct, cpm }) => accPct < 80 && cpm >= 100 }),
  createRankRule({ label: "Печатная машинка", accuracy: "80%-90%", speed: "100+", sortAccuracy: 80, sortSpeed: 100, when: ({ accPct, cpm }) => accPct < 90 && cpm >= 100 }),
  createRankRule({ label: "Мастер", accuracy: "90%-100%", speed: "100-200", sortAccuracy: 90, sortSpeed: 100, when: ({ accPct, cpm }) => accPct < 100 && cpm < 200 }),
  createRankRule({ label: "Программист", accuracy: "90%-100%", speed: "200+", sortAccuracy: 90, sortSpeed: 200, when: ({ accPct }) => accPct < 100 }),
  createRankRule({ label: "Перфекционист", accuracy: "100%", speed: "0-120", sortAccuracy: 100, sortSpeed: 0, when: ({ cpm }) => cpm < 120 }),
  createRankRule({ label: "Клавиатурный самурай", accuracy: "100%", speed: "120-180", sortAccuracy: 100, sortSpeed: 120, when: ({ cpm }) => cpm < 180 }),
  createRankRule({ label: "Кодовый ниндзя", accuracy: "100%", speed: "180-260", sortAccuracy: 100, sortSpeed: 180, when: ({ cpm }) => cpm < 260 }),
  createRankRule({ label: "Разработчик этого проекта", accuracy: "100%", speed: "260-380", sortAccuracy: 100, sortSpeed: 260, when: ({ cpm }) => cpm < 380 }),
  createRankRule({ label: "Читер", accuracy: "100%", speed: "380+", sortAccuracy: 100, sortSpeed: 380, when: () => true })
];

function getRankMetrics(stats) {
  return {
    accPct: Math.round((stats.accuracy ?? 1) * 100),
    cpm: Number(stats.cpm ?? 0)
  };
}

function calculateRankLabel(stats) {
  const rankMetrics = getRankMetrics(stats);
  return RANK_RULES.find((rule) => rule.when(rankMetrics))?.label ?? "—";
}

function sortRankRulesForTooltip(rules = RANK_RULES) {
  return [...rules].sort((left, right) => left.sortSpeed - right.sortSpeed || left.sortAccuracy - right.sortAccuracy);
}

function buildRankTooltipHtml() {
  const sortedRules = sortRankRulesForTooltip();
  const rowsPerColumn = Math.ceil(sortedRules.length / RANK_COLUMN_TITLES.length);

  const columns = RANK_COLUMN_TITLES.map((title, index) => {
    const start = index * rowsPerColumn;
    const rules = sortedRules.slice(start, start + rowsPerColumn);
    const items = rules.map((rule) => `
      <li class="info-tip-rank-item">
        <strong class="info-tip-rank-name">${escapeHtml(rule.label)}</strong>
        <span class="info-tip-rank-hint">${escapeHtml(rule.hint)}</span>
      </li>
    `).join("");

    return `
      <section class="info-tip-rank-column">
        <h4 class="info-tip-rank-column-title">${title}</h4>
        <ul class="info-tip-list info-tip-list--rank-column">${items}</ul>
      </section>
    `;
  }).join("");

  return `<div class="info-tip-rank-columns">${columns}</div>`;
}

const EDITOR_HINTS = {
  loading: { text: "Загружаю задания...", tone: "muted" },
  idle: { text: "Кликни здесь, чтобы начать", tone: "muted" },
  focused: { text: "Печать активна. Печатай", tone: "info" },
  paused: { text: "Пауза. Начни печатать", tone: "warning" },
  finished: { text: "Задание завершено", tone: "success" },
  tab: { text: "Отступ: жми Tab", tone: "accent" },
  enter: { text: "Конец строки: жми Enter", tone: "accent" },
  error: { text: "Ошибка: жми BackSpace", tone: "danger" },
  almost: { text: "Финиш близко", tone: "success" }
};

const BOOT_TYPING_WEIGHTS = [
  0.52, 0.52, 0.52, 0.52, 0.52,
  1.65, 1.65,
  0.52, 0.52, 0.52, 0.52, 0.52, 0.52, 0.52,
  0.52,
  0.52, 0.52, 0.52, 0.52, 0.52, 0.52, 0.52, 0.52, 0.52,
  1.65, 1.65
];

const BOOT_TYPING_TOTAL_WEIGHT = BOOT_TYPING_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
const BOOT_PROGRESS_EPSILON = 0.0025;
const BOOT_PROGRESS_DELTA = 0.0085;
const BOOT_OVERLAY_HIDE_DELAY_MS = 280;

function mapBootTypingProgress(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) {
    return 0;
  }

  if (clamped >= 1) {
    return 1;
  }

  let remainingWeight = clamped * BOOT_TYPING_TOTAL_WEIGHT;
  let completedChars = 0;

  for (const weight of BOOT_TYPING_WEIGHTS) {
    if (remainingWeight + 1e-9 < weight) {
      break;
    }

    remainingWeight -= weight;
    completedChars += 1;
  }

  return completedChars / BOOT_TYPING_WEIGHTS.length;
}

function renderSymbol(symbol, isCurrent, syntaxType) {
  const classNames = ["code-char"];
  const expected = symbol.expected;

  if (isCurrent) {
    classNames.push("is-current");
  } else if (!symbol.entered) {
    classNames.push("is-pending");
  } else if (symbol.correct === true) {
    classNames.push("is-correct");
    if (syntaxType) {
      classNames.push(syntaxType);
    }
  } else {
    classNames.push("is-wrong");
  }

  if (expected === "\n") {
    if (isCurrent) {
      return `<span class="${classNames.join(" ")}">↵</span>\n`;
    }

    if (!symbol.entered || symbol.correct === true || symbol.typed === "\n") {
      return `<span class="${classNames.join(" ")}">&nbsp;</span>\n`;
    }

    return `<span class="${classNames.join(" ")}">${escapeHtml(symbol.typed ?? "")}</span>\n`;
  }

  if (expected === "\t") {
    let text = "    ";
    if (symbol.entered && symbol.correct !== true && symbol.typed) {
      const typed = symbol.typed === "\n" ? "↵" : symbol.typed === "\t" ? "    " : symbol.typed;
      text = typed === "    " ? typed : `${typed}   `;
    }
    return `<span class="${classNames.join(" ")}">${text.replaceAll(" ", "&nbsp;")}</span>`;
  }

  if (symbol.entered && symbol.correct !== true && symbol.typed) {
    if (symbol.typed === "\n") {
      return `<span class="${classNames.join(" ")}">↵</span>`;
    }
    if (symbol.typed === "\t") {
      return `<span class="${classNames.join(" ")}">→</span>`;
    }
    return `<span class="${classNames.join(" ")}">${escapeHtml(symbol.typed)}</span>`;
  }

  return `<span class="${classNames.join(" ")}">${escapeHtml(expected === " " ? "\u00A0" : expected)}</span>`;
}

export class UI {
  constructor() {
    this.elements = {
      bootOverlay: requireElement("#bootOverlay"),
      bootPercent: requireElement("#bootPercent"),
      bootOutput: requireElement("#bootOutput"),
      bootSound: requireAudio("#bootSound"),
      orderModeControl: requireElement("#orderModeControl"),
      treeToggleAllButton: requireButton("#treeToggleAllButton"),
      restartButton: requireButton("#restartButton"),
      pauseButton: requireButton("#pauseButton"),
      skipTaskButton: requireButton("#skipTaskButton"),
      helpGuideButton: requireButton("#helpGuideButton"),
      helpGuideOverlay: requireElement("#helpGuideOverlay"),
      taskList: requireElement("#taskList"),
      currentTaskName: requireElement("#currentTaskName"),
      currentTaskMeta: requireElement("#currentTaskMeta"),
      currentTaskCode: requireElement("#currentTaskCode"),
      timerValue: requireElement("#timerValue"),
      speedValue: requireElement("#speedValue"),
      accuracyValue: requireElement("#accuracyValue"),
      progressValue: requireElement("#progressValue"),
      errorsValue: requireElement("#errorsValue"),
      streakValue: requireElement("#streakValue"),
      bestResultBadge: requireElement("#bestResultBadge"),
      resultText: requireElement("#resultText"),
      resultsPanel: requireElement("#resultsPanel"),
      resTime: requireElement("#resTime"),
      resCpm: requireElement("#resCpm"),
      resAcc: requireElement("#resAcc"),
      resRank: requireElement("#resRank"),
      resRankTip: requireElement("#resRankTip"),
      resBestStreak: requireElement("#resBestStreak"),
      retryResultButton: requireButton("#retryResultButton"),
      nextTaskButton: requireButton("#nextTaskButton"),
      resultsToggleButton: requireButton("#resultsToggleButton"),
      autoAdvanceToggle: requireInput("#autoAdvanceToggle"),
      resultsOrderModeControl: requireElement("#resultsOrderModeControl"),
      musicPlayer: requireAudio("#musicPlayer"),
      musicPrevButton: requireButton("#musicPrevButton"),
      musicToggleButton: requireButton("#musicToggleButton"),
      musicNextButton: requireButton("#musicNextButton"),
      musicTrackLabel: requireElement("#musicTrackLabel"),
      musicTracksTip: requireElement("#musicTracksTip"),
      editorSurface: requireElement("#editorSurface"),
      editorTopline: requireElement(".editor-topline"),
      editorHint: requireElement("#editorHint"),
      codePreview: requireElement("#codePreview"),
      workspaceSplit: requireElement(".workspace-split"),
      metricsPanel: requireElement("#metricsPanel"),
      metricsToggleBtn: requireButton("#metricsToggleBtn"),
      explanationPanel: requireElement("#explanationPanel"),
      explanationSlideBlock: requireElement(".explanation-slide-block"),
      explanationSlideImage: requireElement("#explanationSlideImage"),
      explanationToggleBtn: requireButton("#explanationToggleBtn"),
      racePanel: requireElement("#racePanel"),
      raceVisibilityToggle: requireInput("#raceVisibilityToggle"),
      raceWrap: requireElement("#raceWrap"),
      raceTrack: requireElement("#raceTrack"),
      raceCar: requireElement("#raceCar"),
      taskDrawer: requireElement("#taskDrawer"),
      drawerBackdrop: requireElement("#drawerBackdrop"),
      menuToggleButton: requireButton("#menuToggleButton"),
      mobileFabKeys: requireElement("#mobileFabKeys"),
      mobileTabButton: requireButton("#mobileTabButton")
    };
    this.cards = {
      streak: this.elements.streakValue?.closest(".metric-card")
    };
    this.syntaxMap = [];
    this.previousStreak = 0;
    this.lastWrong = 0;
    this.bootProgress = 0;
    this.bootTargetProgress = 0;
    this.bootProgressFrame = 0;
    this.bootSoundPlaying = false;
    this.bootProgressWaiters = [];
    this.renderRankTooltip();
  }

  startBootSound() {
    if (this.bootSoundPlaying) {
      return;
    }

    this.bootSoundPlaying = true;
    this.elements.bootSound.loop = true;
    this.elements.bootSound.currentTime = 0;
    this.elements.bootSound.play().catch(() => {
      this.bootSoundPlaying = false;
    });
  }

  stopBootSound() {
    if (!this.bootSoundPlaying && this.elements.bootSound.paused) {
      return;
    }

    this.bootSoundPlaying = false;
    this.elements.bootSound.pause();
    this.elements.bootSound.currentTime = 0;
  }

  resolveBootProgressWaiters() {
    for (const resolve of this.bootProgressWaiters) {
      resolve();
    }
    this.bootProgressWaiters = [];
  }

  resetBootCompletion() {
    this.elements.bootOutput.hidden = true;
    this.elements.bootOutput.classList.remove("is-visible");
  }

  waitForBootTypingComplete() {
    if (!this.bootProgressFrame && Math.abs(this.bootTargetProgress - this.bootProgress) < BOOT_PROGRESS_EPSILON) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.bootProgressWaiters.push(resolve);
    });
  }

  showBootCompletion() {
    if (!this.elements.bootOutput.hidden) {
      return;
    }

    this.elements.bootOutput.hidden = false;
    requestAnimationFrame(() => {
      this.elements.bootOutput.classList.add("is-visible");
    });
  }

  syncBootProgress(progress) {
    const nextProgress = Math.max(0, Math.min(1, progress));
    const steppedProgress = mapBootTypingProgress(nextProgress);
    this.bootProgress = nextProgress;
    this.elements.bootOverlay.style.setProperty("--boot-progress", steppedProgress.toFixed(4));
    this.elements.bootOverlay.style.setProperty("--boot-progress-stepped", steppedProgress.toFixed(4));
    this.elements.bootPercent.textContent = `${Math.round(nextProgress * 100)}%`;
  }

  animateBootProgress() {
    if (this.bootProgressFrame) {
      return;
    }

    this.elements.bootOverlay.classList.add("is-typing");
    this.startBootSound();

    const step = () => {
      this.bootProgressFrame = 0;
      const diff = this.bootTargetProgress - this.bootProgress;

      if (Math.abs(diff) < BOOT_PROGRESS_EPSILON) {
        this.syncBootProgress(this.bootTargetProgress);
        this.elements.bootOverlay.classList.remove("is-typing");
        this.stopBootSound();
        if (this.bootTargetProgress >= 0.999) {
          this.showBootCompletion();
        }
        this.resolveBootProgressWaiters();
        return;
      }

      const delta = Math.sign(diff) * Math.min(Math.abs(diff), BOOT_PROGRESS_DELTA);

      this.syncBootProgress(this.bootProgress + delta);
      this.bootProgressFrame = window.requestAnimationFrame(step);
    };

    this.bootProgressFrame = window.requestAnimationFrame(step);
  }

  setBootProgress({ progress = 0 } = {}) {
    const nextProgress = Math.max(0, Math.min(1, progress));
    this.bootTargetProgress = nextProgress;

    if (this.elements.bootOverlay.hidden) {
      this.syncBootProgress(nextProgress);
    } else {
      this.animateBootProgress();
    }
  }

  showBootOverlay() {
    document.body.classList.add("is-booting");
    this.elements.bootOverlay.hidden = false;
    this.elements.bootOverlay.setAttribute("aria-hidden", "false");
    this.elements.bootOverlay.classList.remove("is-hiding");
    this.resetBootCompletion();

    requestAnimationFrame(() => {
      this.elements.bootOverlay.classList.add("is-visible");
    });
  }

  resetBootOverlay() {
    if (this.bootProgressFrame) {
      window.cancelAnimationFrame(this.bootProgressFrame);
      this.bootProgressFrame = 0;
    }

    this.bootTargetProgress = 0;
    document.body.classList.remove("is-booting");
    this.elements.bootOverlay.hidden = true;
    this.elements.bootOverlay.setAttribute("aria-hidden", "true");
    this.elements.bootOverlay.classList.remove("is-visible", "is-hiding", "is-typing");
    this.resetBootCompletion();
    this.stopBootSound();
    this.syncBootProgress(0);
    this.resolveBootProgressWaiters();
  }

  hideBootOverlay() {
    if (this.elements.bootOverlay.hidden) {
      this.resetBootOverlay();
      return Promise.resolve();
    }

    document.body.classList.remove("is-booting");
    this.elements.bootOverlay.classList.remove("is-visible");
    this.elements.bootOverlay.classList.add("is-hiding");

    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.resetBootOverlay();
        resolve();
      }, BOOT_OVERLAY_HIDE_DELAY_MS);
    });
  }

  renderTaskList(tasks, activeTaskId, taskSummaries = new Map()) {
    if (!tasks.length) {
      this.elements.taskList.innerHTML = `<div class="muted-pill">Ничего не найдено</div>`;
      return;
    }

    const expandedTypes = this.expandedTypes ?? new Set();
    const expandedSubtypes = this.expandedSubtypes ?? new Set();
    const grouped = groupTasks(tasks);
    let html = "";

    for (const [typeId, subtypeMap] of grouped.entries()) {
      const subtypes = [...subtypeMap.keys()].sort((left, right) => Number(left) - Number(right));
      const typeOpen = expandedTypes.has(typeId);
      const sampleTask = subtypeMap.get(subtypes[0])?.[0];
      if (!sampleTask) {
        continue;
      }

      html += `
        <div class="tree-block">
          <div class="tree-row tree-row-type">
            <button class="tree-arrow-button" type="button" data-tree-action="toggle-type" data-type-id="${typeId}" aria-label="Развернуть раздел">
              <span class="tree-arrow">${typeOpen ? "▼" : "▶"}</span>
            </button>
            <button class="tree-title-button" type="button" data-tree-action="pick-type" data-type-id="${typeId}">
              <span class="tree-title">${sampleTask.title}</span>
            </button>
          </div>
      `;

      if (typeOpen) {
        if (subtypes.length === 1) {
          const items = subtypeMap.get(subtypes[0]).slice().sort((left, right) => Number(left.variantId) - Number(right.variantId));
          html += items.map((task) => {
            const activeClass = task.id === activeTaskId ? "is-active" : "";
            const finishedClass = taskSummaries.get(task.id)?.finished ? "is-finished" : "";
            return `
              <button class="task-item task-item-leaf ${activeClass} ${finishedClass}" type="button" data-task-id="${task.id}">
                <span>${task.id}</span>
              </button>
            `;
          }).join("");
        } else {
          for (const subtypeId of subtypes) {
            const subtypeKey = `${typeId}:${subtypeId}`;
            const subtypeOpen = expandedSubtypes.has(subtypeKey);
            const items = (subtypeMap.get(subtypeId) ?? [])
              .slice()
              .sort((left, right) => Number(left.variantId) - Number(right.variantId));
            const subtypeTask = items[0];
            if (!subtypeTask) {
              continue;
            }
            const subtypeLabel = subtypeTask.subtypeTitle || `Подтип ${subtypeId}`;

            html += `
              <div class="tree-subblock">
                <div class="tree-row tree-row-subtype">
                  <button class="tree-arrow-button" type="button" data-tree-action="toggle-subtype" data-type-id="${typeId}" data-subtype-id="${subtypeId}" aria-label="Развернуть подтип">
                    <span class="tree-arrow">${subtypeOpen ? "▼" : "▶"}</span>
                  </button>
                  <button class="tree-title-button" type="button" data-tree-action="pick-subtype" data-type-id="${typeId}" data-subtype-id="${subtypeId}">
                    <span class="tree-title">${subtypeId}. ${subtypeLabel}</span>
                  </button>
                </div>
              `;

            if (subtypeOpen) {
              html += items.map((task) => {
                const activeClass = task.id === activeTaskId ? "is-active" : "";
                const finishedClass = taskSummaries.get(task.id)?.finished ? "is-finished" : "";
                return `
                  <button class="task-item task-item-leaf task-item-variant ${activeClass} ${finishedClass}" type="button" data-task-id="${task.id}">
                    <span>${task.id}</span>
                  </button>
                `;
              }).join("");
            }

            html += `</div>`;
          }
        }
      }

      html += `</div>`;
    }

    this.elements.taskList.innerHTML = html;
  }

  renderTaskMeta(task) {
    if (!task) {
      this.elements.currentTaskName.textContent = "Не выбрано";
      this.elements.currentTaskMeta.textContent = "Выбери задачу слева";
      this.elements.currentTaskCode.textContent = "-";
      this.renderExplanation(null);
      return;
    }

    this.elements.currentTaskName.textContent = task.title;
    this.elements.currentTaskMeta.textContent = task.subtypeTitle || "Основное";
    this.elements.currentTaskCode.textContent = task.id;
    this.syntaxMap = buildSyntaxMap(task.code);
    this.renderExplanation(task);
  }

  renderExplanation(task) {
    const slide = task ? EXPLANATION_SLIDES.get(task.id) : null;
    const image = this.elements.explanationSlideImage;

    this.elements.explanationSlideBlock.classList.toggle("has-slide-image", Boolean(slide));
    image.hidden = !slide;

    if (!slide) {
      image.alt = "";
      return;
    }

    image.src = slide.src;
    image.alt = slide.alt;
  }

  renderSession(session) {
    if (!session) {
      this.elements.codePreview.innerHTML = `<span class="code-char is-pending">Выбери задание, и здесь появится эталонный код.</span>`;
      return;
    }

    const stats = session.getStats();
    const html = session.symbols
      .map((symbol, index) => renderSymbol(symbol, index === stats.cursor, this.syntaxMap[index]))
      .join("");
    this.elements.codePreview.innerHTML = html;

    const current = this.elements.codePreview.querySelector(".is-current");
    if (current) {
      requestAnimationFrame(() => {
        current.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth"
        });
      });
    }
  }

  renderStats(session) {
    if (!session) {
      this.elements.timerValue.textContent = "00:00";
      this.elements.speedValue.textContent = "0 символов/мин";
      this.elements.accuracyValue.textContent = "—";
      this.elements.progressValue.textContent = "0 / 0";
      this.elements.errorsValue.textContent = "0";
      this.elements.streakValue.textContent = "0";
      this.updateRace({
        total: 0,
        correct: 0,
        wrong: 0,
        accuracy: 1
      });
      return;
    }

    const stats = session.getStats();

    this.elements.timerValue.textContent = formatTime(stats.timeMs);
    this.elements.speedValue.textContent = `${stats.cpm} символов/мин`;
    this.elements.accuracyValue.textContent = `${Math.round(stats.accuracy * 100)}%`;
    this.elements.progressValue.textContent = `${stats.entered} / ${stats.total}`;
    this.elements.errorsValue.textContent = String(stats.wrong);
    this.updateRace(stats);
  }

  renderBestResult(result) {
    if (!result) {
      this.elements.bestResultBadge.textContent = "-";
      return;
    }

    this.elements.bestResultBadge.textContent = `${result.accuracy}% · ${result.speed} символов/мин · ${formatTime(result.timeMs)}`;
  }

  renderResultText(text) {
    this.elements.resultText.textContent = text;
  }

  setOrderModeState(mode) {
    const controls = [
      this.elements.orderModeControl,
      this.elements.resultsOrderModeControl
    ];

    for (const control of controls) {
      const buttons = [...control.querySelectorAll("[data-order-mode]")];
      const activeIndex = Math.max(0, buttons.findIndex((button) => button.dataset.orderMode === mode));
      control.dataset.activeIndex = String(activeIndex);

      for (const button of buttons) {
        const isActive = button.dataset.orderMode === mode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      }
    }
  }

  setAutoAdvanceState({ enabled, secondsLeft = null } = {}) {
    this.elements.autoAdvanceToggle.checked = Boolean(enabled);
    this.elements.nextTaskButton.textContent = enabled && Number.isInteger(secondsLeft)
      ? `Следующее задание (${secondsLeft})`
      : "Следующее задание";
  }

  showResults(stats, bestStreak) {
    this.renderResultText("");
    this.renderResultStats({ stats, bestStreak, rankLabel: calculateRankLabel(stats) });
    this.openResultsPanel();
  }

  showPendingResults() {
    this.elements.resTime.textContent = "—";
    this.elements.resCpm.textContent = "—";
    this.elements.resAcc.textContent = "—";
    this.elements.resRank.textContent = "Пока не определён";
    this.elements.resBestStreak.textContent = "—";
    this.elements.resultsPanel.hidden = false;
    this.renderResultText("Результат появится после завершения задания.");
    this.openResultsPanel();
  }

  renderResultStats({ stats, bestStreak, rankLabel }) {
    this.elements.resTime.textContent = formatTime(stats?.timeMs ?? 0);
    this.elements.resCpm.textContent = `${stats?.cpm ?? 0} симв/мин`;
    this.elements.resAcc.textContent = `${Math.round((stats?.accuracy ?? 1) * 100)}%`;
    this.elements.resRank.textContent = rankLabel;
    this.elements.resBestStreak.textContent = String(bestStreak ?? 0);
    this.elements.resultsPanel.hidden = false;
  }

  openResultsPanel() {
    this.elements.resultsPanel.hidden = false;

    requestAnimationFrame(() => {
      this.setResultsOpen(true);
    });
  }

  renderRankTooltip() {
    if (!this.elements.resRankTip) {
      return;
    }

    this.elements.resRankTip.innerHTML = buildRankTooltipHtml();
  }

  renderMusicTooltip(tracks, activeIndex = 0) {
    const items = tracks.length
      ? tracks.map((track, index) => {
        const activeClass = index === activeIndex ? " is-active" : "";
        return `<li class="music-track-item${activeClass}">${escapeHtml(track.title)}</li>`;
      }).join("")
      : "<li>Треков пока нет</li>";
    this.elements.musicTracksTip.innerHTML = `<ul class="info-tip-list info-tip-list--music">${items}</ul>`;
  }

  getRankLabel(stats) {
    return calculateRankLabel(stats);
  }

  hideResults() {
    this.elements.resultsPanel.hidden = false;
    this.setResultsOpen(false);
  }

  setResultsOpen(isOpen) {
    const arrow = String.fromCharCode(isOpen ? 9660 : 9650);
    const label = isOpen
      ? "\u0421\u043a\u0440\u044b\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442"
      : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442";
    this.elements.resultsPanel.classList.toggle("is-visible", isOpen);
    this.setControlCopy(this.elements.resultsToggleButton, arrow, label);
  }

  updateRace(stats) {
    const track = this.elements.raceTrack;
    const car = this.elements.raceCar;

    if (!track || !car) {
      return;
    }

    const total = Math.max(stats.total ?? 0, 0);
    const correct = Math.max(stats.correct ?? 0, 0);
    const wrong = Math.max(stats.wrong ?? 0, 0);
    const pct = total > 0 ? Math.max(0, Math.min(1, correct / total)) : 0;

    const trackWidth = track.clientWidth;
    const carWidth = car.clientWidth || 28;
    const padding = 8;
    const maxX = Math.max(0, trackWidth - carWidth - padding * 2);
    const x = Math.round(pct * maxX);

    car.style.setProperty("--race-x", `${x}px`);
    car.style.transform = `translate(${x}px, -50%)`;

    const accuracy = stats.accuracy ?? 1;
    car.classList.toggle("car--smoke", accuracy < 0.97 && accuracy >= 0.9);
    car.classList.toggle("car--broken", accuracy < 0.9);

    if (wrong > this.lastWrong) {
      car.classList.remove("car--shake");
      void car.offsetWidth;
      car.classList.add("car--shake");
    }

    this.lastWrong = wrong;
  }

  renderEditorHint(state) {
    const nextState = typeof state === "string" ? (EDITOR_HINTS[state] || EDITOR_HINTS.idle) : { ...EDITOR_HINTS.idle, ...state };
    this.elements.editorHint.textContent = nextState.text;
    this.elements.editorHint.dataset.tone = nextState.tone || "muted";
    this.elements.editorTopline.dataset.tone = nextState.tone || "muted";
  }

  setFocused(isFocused) {
    this.elements.editorSurface.classList.toggle("is-focused", isFocused);
  }

  setTreeState(expandedTypes, expandedSubtypes) {
    this.expandedTypes = expandedTypes;
    this.expandedSubtypes = expandedSubtypes;
  }

  setTreeToggleAllState(isExpanded) {
    this.setControlCopy(
      this.elements.treeToggleAllButton,
      isExpanded ? "▼" : "▶",
      isExpanded ? "Свернуть всё дерево заданий" : "Развернуть всё дерево заданий"
    );
    this.elements.treeToggleAllButton.classList.toggle("is-expanded", isExpanded);
  }

  setStreak(current) {
    this.elements.streakValue.textContent = String(current);

    if (current > this.previousStreak) {
      this.triggerAnimation(this.elements.streakValue, "is-streak-bump");
      this.triggerAnimation(this.cards.streak, "is-streak-hot");
      this.spawnStreakBurst(this.cards.streak, current >= 5 && current % 5 === 0 ? `x${current}` : "+1");

      if (current >= 5 && current % 5 === 0) {
        this.triggerAnimation(this.cards.streak, "is-streak-milestone");
      }
    }

    this.previousStreak = current;
  }

  triggerAnimation(element, className) {
    if (!element) {
      return;
    }

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => {
      element.classList.remove(className);
    }, 950);
  }

  spawnStreakBurst(container, text) {
    if (!container) {
      return;
    }

    const burst = document.createElement("span");
    burst.className = "streak-burst";
    burst.textContent = text;
    container.appendChild(burst);

    window.setTimeout(() => {
      burst.remove();
    }, 900);
  }

  setMetricsCollapsed(isCollapsed) {
    this.elements.workspaceSplit?.classList.toggle("is-metrics-collapsed", isCollapsed);
    this.elements.metricsPanel.classList.toggle("is-collapsed", isCollapsed);
    this.setControlCopy(
      this.elements.metricsToggleBtn,
      isCollapsed ? "←" : "→",
      isCollapsed ? "Показать метрики" : "Скрыть метрики"
    );
  }


  setExplanationOpen(isOpen, { smoothClose = false } = {}) {
    const split = this.elements.workspaceSplit;
    if (this.explanationCloseTimer) {
      window.clearTimeout(this.explanationCloseTimer);
      this.explanationCloseTimer = null;
    }

    if (isOpen) {
      split?.classList.remove("is-explanation-closing");
      split?.classList.add("is-explanation-open");
      this.elements.explanationPanel.classList.add("is-open");
    } else if (smoothClose && split?.classList.contains("is-explanation-open")) {
      split.classList.add("is-explanation-closing");
      this.elements.explanationPanel.classList.remove("is-open");
      this.explanationCloseTimer = window.setTimeout(() => {
        split.classList.remove("is-explanation-open", "is-explanation-closing");
        this.explanationCloseTimer = null;
      }, 260);
    } else {
      split?.classList.remove("is-explanation-open", "is-explanation-closing");
      this.elements.explanationPanel.classList.remove("is-open");
    }

    this.elements.explanationPanel.setAttribute("aria-hidden", String(!isOpen));
    this.setControlCopy(
      this.elements.explanationToggleBtn,
      isOpen ? "▲" : "▼",
      isOpen ? "Скрыть разбор задания" : "Открыть разбор задания"
    );
  }

  setRaceVisible(isVisible) {
    const visible = Boolean(isVisible);
    this.elements.racePanel?.classList.toggle("is-hidden", !visible);
    this.elements.raceWrap.setAttribute("aria-hidden", String(!visible));

    if (this.elements.raceVisibilityToggle) {
      this.elements.raceVisibilityToggle.checked = visible;
    }
  }

  setPaused(isPaused) {
    this.elements.pauseButton.classList.toggle("is-paused", isPaused);
    this.setControlCopy(
      this.elements.pauseButton,
      isPaused ? "▶" : "❚❚",
      isPaused ? "Продолжить" : "Пауза"
    );
  }

  setMusicState({ playing, title, playlist = null, activeIndex = 0 }) {
    this.elements.musicToggleButton.classList.toggle("is-playing", playing);
    this.setControlCopy(
      this.elements.musicToggleButton,
      playing ? "❚❚" : "▶",
      playing ? "Остановить музыку" : "Включить музыку"
    );
    this.elements.musicTrackLabel.textContent = title;

    if (playlist) {
      this.renderMusicTooltip(playlist, activeIndex);
    }
  }

  setDrawerOpen(isOpen) {
    this.elements.taskDrawer.classList.toggle("is-open", isOpen);
    this.elements.drawerBackdrop.hidden = !isOpen;
    this.elements.menuToggleButton.classList.toggle("is-open", isOpen);
    this.setControlCopy(
      this.elements.menuToggleButton,
      isOpen ? "◀" : "▶",
      isOpen ? "Скрыть задания" : "Открыть задания"
    );
  }

  setControlCopy(element, text, label) {
    if (!element) {
      return;
    }

    element.textContent = text;
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
  }
}
