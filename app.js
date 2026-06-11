import { loadTasks } from "./tasks.js";
import { TaskSession } from "./session.js";
import { InputController } from "./input-controller.js";
import { UI } from "./ui.js";
import {
  loadSession,
  saveSession,
  loadActiveTaskId,
  saveActiveTaskId,
  loadBestResults,
  saveBestResults,
  loadAutoAdvancePreference,
  saveAutoAdvancePreference,
  loadMusicEnabledPreference,
  saveMusicEnabledPreference,
  loadOrderModePreference,
  saveOrderModePreference,
  loadRaceVisiblePreference,
  saveRaceVisiblePreference,
  loadTaskSummary
} from "./storage.js";

const RESULT_PLACEHOLDER = "";
const RESTART_MESSAGE = "Попытка перезапущена. Исправленные ранее ошибки всё равно будут учитываться заново только в новой попытке.";
const PAUSE_MESSAGE = "Тренировка на паузе. Нажми кнопку продолжения или просто начни печатать.";
const RESUME_MESSAGE = "Тренировка продолжена.";
const AUTO_ADVANCE_DELAY_MS = 5000;
const AUTO_ADVANCE_START_SECONDS = AUTO_ADVANCE_DELAY_MS / 1000;
const BOOT_OVERLAY_MIN_VISIBLE_MS = 3000;
const BOOT_OVERLAY_SKIP_WINDOW_MS = 5000;
const BOOT_OVERLAY_COMPLETION_HOLD_MS = 450;
const BOOT_OVERLAY_SESSION_KEY = "typing-trainer:last-boot-overlay-at";
const MUSIC_DIRECTORY = "./Music/";
const ORDER_MODES = {
  sequential: "sequential",
  random: "random",
  eachType: "each-type"
};
const FALLBACK_MUSIC_FILES = [
  "1. Marconi Union - Weightless Part 2.mp3",
  "2. Marconi Union - Weightless Part 5.mp3"
];

function getTrackTitleFromFileName(fileName) {
  return fileName.replace(/\.mp3$/i, "");
}

function createMusicPlaylist(fileNames, basePath = "./") {
  return fileNames.map((fileName) => ({
    title: getTrackTitleFromFileName(fileName),
    src: `${basePath}${fileName}`
  }));
}

const FALLBACK_MUSIC_PLAYLIST = createMusicPlaylist(FALLBACK_MUSIC_FILES, MUSIC_DIRECTORY);

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}


function loadLastBootOverlayAt() {
  try {
    const value = Number(sessionStorage.getItem(BOOT_OVERLAY_SESSION_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveLastBootOverlayAt(timestamp = Date.now()) {
  try {
    sessionStorage.setItem(BOOT_OVERLAY_SESSION_KEY, String(timestamp));
  } catch {
    // Ignore storage failures: the loader still works without persistence.
  }
}

function parseMusicFileNamesFromListing(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fileNames = [...doc.querySelectorAll("a[href]")]
    .map((link) => link.getAttribute("href") ?? "")
    .map((href) => href.split("/").pop()?.split("?")[0] ?? "")
    .filter((fileName) => fileName.toLowerCase().endsWith(".mp3"))
    .map((fileName) => {
      try {
        return decodeURIComponent(fileName);
      } catch {
        return fileName;
      }
    });

  return [...new Set(fileNames)].sort((left, right) => left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" }));
}

async function loadMusicPlaylist() {
  try {
    const response = await fetch(MUSIC_DIRECTORY);
    if (!response.ok) {
      throw new Error(`Не удалось открыть каталог ${MUSIC_DIRECTORY}`);
    }

    const fileNames = parseMusicFileNamesFromListing(await response.text());
    return fileNames.length
      ? createMusicPlaylist(fileNames, MUSIC_DIRECTORY)
      : FALLBACK_MUSIC_PLAYLIST;
  } catch (error) {
    console.warn("Music playlist discovery failed:", error);
    return FALLBACK_MUSIC_PLAYLIST;
  }
}

class App {
  constructor() {
    this.ui = new UI();
    this.tasks = [];
    this.tasksById = new Map();
    this.taskSummaries = new Map();
    this.currentTask = null;
    this.session = null;
    this.bestResults = loadBestResults();
    this.typingInput = document.querySelector("#typingInput");
    this.input = null;
    this.tickInterval = null;
    this.drawerOpen = false;
    this.expandedTypes = new Set();
    this.expandedSubtypes = new Set();
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.metricsCollapsed = false;
    this.explanationOpen = false;
    this.raceVisible = loadRaceVisiblePreference(true);
    this.autoAdvanceEnabled = loadAutoAdvancePreference();
    this.autoAdvanceTimeout = null;
    this.autoAdvanceCountdownInterval = null;
    this.isPaused = false;
    this.musicTrackIndex = 0;
    this.musicEnabled = loadMusicEnabledPreference();
    this.musicRestoreHandler = null;
    this.orderMode = loadOrderModePreference();
    this.musicPlaylist = FALLBACK_MUSIC_PLAYLIST;
    this.ignoreNextInputBlur = false;
    this.typingStarted = false;
    this.isMobileLike = false;
  }

  shouldSkipBootOverlay() {
    const lastBootOverlayAt = loadLastBootOverlayAt();
    return lastBootOverlayAt > 0 && Date.now() - lastBootOverlayAt < BOOT_OVERLAY_SKIP_WINDOW_MS;
  }

  createBootOverlayController() {
    const state = {
      visible: false,
      shownAt: 0,
      progress: 0
    };

    this.ui.resetBootOverlay();

    if (!this.shouldSkipBootOverlay()) {
      state.visible = true;
      state.shownAt = performance.now();
      this.ui.showBootOverlay();
    }

    const syncProgress = (progress = state.progress) => {
      state.progress = Math.max(state.progress, progress);
      this.ui.setBootProgress({ progress: state.progress });
    };

    return {
      update: ({ progress = state.progress } = {}) => {
        syncProgress(progress);
      },
      finish: async () => {
        syncProgress(1);

        if (state.visible) {
          await this.ui.waitForBootTypingComplete();
          const remaining = Math.max(0, BOOT_OVERLAY_MIN_VISIBLE_MS - (performance.now() - state.shownAt));
          if (remaining > 0) {
            await wait(remaining);
          }
          await wait(BOOT_OVERLAY_COMPLETION_HOLD_MS);
          await this.ui.hideBootOverlay();
        } else {
          this.ui.resetBootOverlay();
        }

      }
    };
  }

  async init() {
    this.ui.renderEditorHint("loading");
    const bootOverlay = this.createBootOverlayController();
    try {
      const tasks = await loadTasks(({ progress = 0 } = {}) => {
        bootOverlay.update({ progress: progress * 0.88 });
      });
      this.setTasks(tasks);

      if (!this.tasks.length) {
        throw new Error("Не найдено ни одного задания.");
      }

      bootOverlay.update({ progress: 0.9 });
      this.bindEvents();
      this.initInput();
      bootOverlay.update({ progress: 0.96 });
      await this.initMusicPlayer();
      this.applyUiPreferences();
      this.restoreInitialTask();
      this.startTicker();
      saveLastBootOverlayAt();
    } finally {
      await bootOverlay.finish();
    }
  }

  bindEvents() {
    const {
      restartButton,
      pauseButton,
      skipTaskButton,
      helpGuideButton,
      retryResultButton,
      nextTaskButton,
      resultsToggleButton,
      autoAdvanceToggle,
      orderModeControl,
      resultsOrderModeControl,
      treeToggleAllButton,
      musicPlayer,
      musicPrevButton,
      musicToggleButton,
      musicNextButton,
      taskList,
      editorSurface,
      menuToggleButton,
      drawerBackdrop,
      taskDrawer,
      metricsToggleBtn,
      explanationToggleBtn,
      raceVisibilityToggle,
      mobileTabButton
    } = this.ui.elements;

    restartButton.addEventListener("click", () => this.restartTask());
    pauseButton.addEventListener("pointerdown", () => {
      this.ignoreNextInputBlur = true;
    });
    pauseButton.addEventListener("pointercancel", () => {
      this.ignoreNextInputBlur = false;
    });
    pauseButton.addEventListener("click", () => {
      this.togglePause();
      this.ignoreNextInputBlur = false;
    });
    skipTaskButton.addEventListener("click", () => this.switchToNextTask());
    retryResultButton.addEventListener("click", () => this.restartTask());
    nextTaskButton.addEventListener("click", () => this.switchToNextTask());
    resultsToggleButton.addEventListener("click", () => this.toggleResultsPanel());
    helpGuideButton.addEventListener("mouseenter", () => this.showHelpGuide());
    helpGuideButton.addEventListener("focus", () => this.showHelpGuide());
    helpGuideButton.addEventListener("mouseleave", () => this.hideHelpGuide());
    helpGuideButton.addEventListener("blur", () => this.hideHelpGuide());
    window.addEventListener("resize", () => {
      if (this.ui.elements.helpGuideOverlay.classList.contains("is-visible")) {
        this.renderHelpGuide();
      }
    });
    autoAdvanceToggle.addEventListener("change", () => {
      this.setAutoAdvanceEnabled(autoAdvanceToggle.checked);
    });

    orderModeControl.addEventListener("click", (event) => this.handleOrderModeClick(event));
    resultsOrderModeControl.addEventListener("click", (event) => this.handleOrderModeClick(event));
    treeToggleAllButton.addEventListener("click", () => this.toggleWholeTaskTree());
    musicPrevButton.addEventListener("click", () => this.playPreviousTrack({ autoplay: !musicPlayer.paused }));
    musicToggleButton.addEventListener("click", () => this.toggleMusicPlayback());
    musicNextButton.addEventListener("click", () => this.playNextTrack({ autoplay: !musicPlayer.paused }));
    musicPlayer.addEventListener("ended", () => this.playNextTrack({ autoplay: true }));
    musicPlayer.addEventListener("play", () => this.syncMusicUi());
    musicPlayer.addEventListener("pause", () => this.syncMusicUi());
    window.addEventListener("pageshow", () => this.tryRestoreMusicPlayback());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.pauseForInactiveTyping();
      } else {
        this.tryRestoreMusicPlayback();
      }
    });

    metricsToggleBtn.addEventListener("click", () => this.toggleMetricsPanel());
    explanationToggleBtn.addEventListener("click", () => this.toggleExplanationPanel());

    raceVisibilityToggle.addEventListener("change", () => {
      this.raceVisible = raceVisibilityToggle.checked;
      saveRaceVisiblePreference(this.raceVisible);
      this.ui.setRaceVisible(this.raceVisible);
    });

    mobileTabButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handleChar("\t");
      this.focusInput();
    });

    taskList.addEventListener("click", (event) => this.handleTaskListClick(event));

    editorSurface.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.focusInput();
    });

    menuToggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setDrawerOpen(!this.drawerOpen);
    });

    taskDrawer.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    drawerBackdrop.addEventListener("click", () => {
      this.setDrawerOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (!this.drawerOpen) {
        return;
      }

      const insideDrawer = taskDrawer.contains(event.target);
      const onButton = menuToggleButton.contains(event.target);
      if (!insideDrawer && !onButton) {
        this.setDrawerOpen(false);
      }
    });

    window.addEventListener("blur", () => this.pauseForInactiveTyping());
  }

  initInput() {
    const isMobileLike = (navigator.maxTouchPoints ?? 0) > 0 && window.matchMedia("(pointer: coarse)").matches;
    this.isMobileLike = isMobileLike;
    this.raceVisible = loadRaceVisiblePreference(!isMobileLike);

    this.input = new InputController(this.typingInput, {
      onChar: (char) => this.handleChar(char),
      onBackspace: () => this.handleBackspace(),
      onEnter: () => this.handleChar("\n"),
      onTab: () => this.handleChar("\t")
    });

    this.input.setMode(isMobileLike ? "mobile" : "desktop");
    this.input.attach();

    this.typingInput.addEventListener("focus", () => this.updateEditorHint());
    this.typingInput.addEventListener("blur", () => this.handleTypingBlur());
    this.bindMobileFabPositioning();
  }

  bindMobileFabPositioning() {
    const box = this.ui.elements.mobileFabKeys;
    if (!box || !this.isMobileLike) {
      return;
    }

    const viewport = window.visualViewport;
    const updatePosition = () => {
      const marginLeft = 14;
      const marginBottom = 14;
      const viewportOffsetLeft = viewport?.offsetLeft || 0;
      const viewportOffsetTop = viewport?.offsetTop || 0;
      const keyboardLift = viewport
        ? Math.max(0, window.innerHeight - (viewport.height + viewportOffsetTop))
        : 0;

      box.style.left = `calc(${marginLeft}px + env(safe-area-inset-left, 0px))`;
      box.style.bottom = `calc(${marginBottom + keyboardLift}px + env(safe-area-inset-bottom, 0px))`;
      box.style.transform = `translate3d(${viewportOffsetLeft}px, ${viewportOffsetTop}px, 0)`;
    };

    updatePosition();
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);
  }

  async initMusicPlayer() {
    this.musicPlaylist = await loadMusicPlaylist();
    if (this.musicTrackIndex >= this.musicPlaylist.length) {
      this.musicTrackIndex = 0;
    }

    this.applyMusicTrack(this.musicTrackIndex);
    this.musicPlayer.loop = false;
    this.musicPlayer.autoplay = this.musicEnabled;
    this.syncMusicUi();

    if (this.musicEnabled) {
      this.tryRestoreMusicPlayback();
    }
  }

  setTasks(tasks) {
    this.tasks = tasks;
    this.tasksById = new Map(tasks.map((task) => [task.id, task]));
    this.refreshTaskSummaries();
  }

  applyUiPreferences() {
    this.ui.setMetricsCollapsed(this.metricsCollapsed);
    this.ui.setExplanationOpen(this.explanationOpen);
    this.ui.setRaceVisible(this.raceVisible);
    this.ui.setOrderModeState(this.orderMode);
    this.ui.setAutoAdvanceState({ enabled: this.autoAdvanceEnabled });
  }

  restoreInitialTask() {
    const initialTask = this.getInitialTask();
    if (!initialTask) {
      return;
    }

    this.renderTaskList();
    this.switchTask(initialTask.id);
  }

  getInitialTask() {
    const savedTaskId = loadActiveTaskId();
    const savedTask = this.findTaskById(savedTaskId);
    if (savedTask) {
      return savedTask;
    }

    if (this.isRandomOrder()) {
      return this.pickRandomTask(this.tasks);
    }

    if (this.isEachTypeOrder()) {
      return this.pickRandomTaskFromBranch(this.getTaskBranches()[0]);
    }

    return this.tasks[0];
  }

  renderTaskList() {
    this.ui.setTreeState(this.expandedTypes, this.expandedSubtypes);
    this.ui.setTreeToggleAllState(this.isWholeTaskTreeExpanded());
    this.ui.renderTaskList(this.tasks, this.currentTask?.id, this.taskSummaries);
  }

  refreshTaskSummaries() {
    this.taskSummaries = new Map();
    for (const task of this.tasks) {
      const summary = loadTaskSummary(task.id);
      if (summary) {
        this.taskSummaries.set(task.id, summary);
      }
    }
  }

  updateTaskSummaryFromSession(taskId, session) {
    if (!taskId || !session) {
      return;
    }

    this.taskSummaries.set(taskId, {
      finished: Boolean(session.finished),
      cursor: Number(session.cursor ?? 0),
      duration: Number(session.getTimeMs?.() ?? session.duration ?? 0),
      savedAt: Date.now()
    });
  }

  persistSession() {
    if (this.currentTask && this.session) {
      saveSession(this.currentTask.id, this.session);
      this.updateTaskSummaryFromSession(this.currentTask.id, this.session);
    }
  }

  showHelpGuide() {
    const { helpGuideOverlay } = this.ui.elements;
    helpGuideOverlay.classList.add("is-visible");
    helpGuideOverlay.setAttribute("aria-hidden", "false");
    this.renderHelpGuide();
  }

  hideHelpGuide() {
    const { helpGuideOverlay } = this.ui.elements;
    helpGuideOverlay.classList.remove("is-visible");
    helpGuideOverlay.setAttribute("aria-hidden", "true");
    helpGuideOverlay.innerHTML = "";
  }

  renderHelpGuide() {
    const { helpGuideOverlay } = this.ui.elements;
    const targets = this.getHelpGuideTargets();
    const viewportWidth = Math.max(1, Math.round(window.innerWidth));
    const viewportHeight = Math.max(1, Math.round(window.innerHeight));
    helpGuideOverlay.innerHTML = this.renderHelpGuideDimmer(targets, viewportWidth, viewportHeight) + '<svg class="help-guide-lines" aria-hidden="true" width="' + viewportWidth + '" height="' + viewportHeight + '" viewBox="0 0 ' + viewportWidth + ' ' + viewportHeight + '"></svg>' + targets
      .map((target, index) => this.renderHelpCallout(target, index))
      .join("");

    requestAnimationFrame(() => this.renderHelpGuideLines(targets));
  }

  getHelpGuideTargets() {
    const {
      menuToggleButton,
      metricsToggleBtn,
      explanationToggleBtn,
      resultsToggleButton,
      restartButton,
      pauseButton,
      skipTaskButton
    } = this.ui.elements;

    return [
      { element: menuToggleButton, label: "\u0417\u0430\u0434\u0430\u043d\u0438\u044f", placement: "button-bottom", offset: 0 },
      { element: metricsToggleBtn, label: "\u041c\u0435\u0442\u0440\u0438\u043a\u0438", placement: "left" },
      { element: explanationToggleBtn, label: "\u041e\u0431\u044a\u044f\u0441\u043d\u0435\u043d\u0438\u0435", placement: "down" },
      { element: resultsToggleButton, label: "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442", placement: "up", fallback: this.getResultToggleFallbackRect() },
      { element: restartButton, label: "\u041d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e", placement: "button-bottom", offset: 28 },
      { element: pauseButton, label: this.isPaused ? "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c" : "\u041f\u0430\u0443\u0437\u0430", placement: "button-bottom", offset: 56 },
      { element: skipTaskButton, label: "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u0435", placement: "button-bottom", offset: 84 }
    ];
  }

  getResultToggleFallbackRect() {
    const width = 42;
    const height = 34;
    const viewportWidth = window.innerWidth;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const panelWidth = Math.min(360, viewportWidth - (isMobile ? 20 : 24));
    const sidePanelWidth = Math.min(440, Math.max(320, viewportWidth * 0.34));
    const pageInlineGutter = Math.max(12, (viewportWidth - 1440) / 2);
    const pageShellWidth = Math.min(1440, viewportWidth - 24);
    const resultToggleLeft = pageInlineGutter + pageShellWidth - sidePanelWidth - 63 - 32;
    const panelRight = isMobile ? 10 : viewportWidth - resultToggleLeft - 16 - panelWidth;
    const left = viewportWidth - panelRight - panelWidth + 16;
    return {
      left,
      right: left + width,
      top: window.innerHeight - height,
      bottom: window.innerHeight,
      width,
      height
    };
  }

  getHelpTargetRect(target) {
    const rect = target.element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect;
    }

    return target.fallback ?? rect;
  }

  renderHelpGuideDimmer(targets, viewportWidth, viewportHeight) {
    const maskId = "help-guide-mask";
    const holes = targets
      .map((target) => this.renderHelpGuideMaskHole(target))
      .join("");

    return '<svg class="help-guide-dimmer" aria-hidden="true" width="' + viewportWidth + '" height="' + viewportHeight + '" viewBox="0 0 ' + viewportWidth + ' ' + viewportHeight + '">' +
      '<defs><mask id="' + maskId + '"><rect x="0" y="0" width="' + viewportWidth + '" height="' + viewportHeight + '" fill="white" />' + holes + '</mask></defs>' +
      '<rect class="help-guide-dim-fill" x="0" y="0" width="' + viewportWidth + '" height="' + viewportHeight + '" mask="url(#' + maskId + ')" />' +
    '</svg>';
  }

  renderHelpGuideMaskHole(target) {
    const rect = this.getHelpTargetRect(target);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return "";
    }

    const pad = 8;
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const width = Math.min(window.innerWidth - x, rect.width + pad * 2);
    const height = Math.min(window.innerHeight - y, rect.height + pad * 2);
    return '<rect class="help-guide-mask-hole" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" rx="14" ry="14" fill="black" />';
  }

  renderHelpCallout(target, index) {
    const rect = this.getHelpTargetRect(target);
    const gap = 10;
    let left = rect.left + rect.width / 2;
    let top = rect.top + rect.height / 2;

    if (target.placement === "right") {
      left = rect.right + gap;
    } else if (target.placement === "left") {
      left = rect.left - gap;
    } else if (target.placement === "down") {
      top = rect.bottom + gap;
    } else if (target.placement === "up") {
      top = rect.top - gap;
    } else if (target.placement === "button-bottom") {
      top = rect.bottom + 9 + (target.offset ?? 0);
    }

    const safeLeft = Math.max(8, Math.min(window.innerWidth - 8, left));
    const safeTop = Math.max(8, Math.min(window.innerHeight - 8, top));
    return '<span class="help-callout help-callout--' + target.placement + '" data-help-index="' + index + '" style="left: ' + safeLeft + 'px; top: ' + safeTop + 'px;">' + target.label + '</span>';
  }

  renderHelpGuideLines(targets) {
    const { helpGuideOverlay } = this.ui.elements;
    if (!helpGuideOverlay.classList.contains("is-visible")) {
      return;
    }

    const linesLayer = helpGuideOverlay.querySelector(".help-guide-lines");
    if (!linesLayer) {
      return;
    }

    const pointValue = (value) => (Math.round(value * 10) / 10).toFixed(1);
    linesLayer.innerHTML = targets
      .map((target, index) => {
        const callout = helpGuideOverlay.querySelector('[data-help-index="' + index + '"]');
        if (!callout) {
          return "";
        }

        const targetRect = this.getHelpTargetRect(target);
        const calloutRect = callout.getBoundingClientRect();
        const start = this.getHelpTargetAnchor(targetRect, target.placement);
        const end = this.getHelpCalloutAnchor(calloutRect, target.placement);
        return '<line class="help-guide-line" x1="' + pointValue(start.x) + '" y1="' + pointValue(start.y) + '" x2="' + pointValue(end.x) + '" y2="' + pointValue(end.y) + '" />';
      })
      .join("");
  }

  getHelpTargetAnchor(rect, placement) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (placement === "right") {
      return { x: rect.right, y: centerY };
    }
    if (placement === "left") {
      return { x: rect.left, y: centerY };
    }
    if (placement === "down" || placement === "button-bottom") {
      return { x: centerX, y: rect.bottom };
    }
    if (placement === "up") {
      return { x: centerX, y: rect.top };
    }

    return { x: centerX, y: centerY };
  }

  getHelpCalloutAnchor(rect, placement) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (placement === "right") {
      return { x: rect.left, y: centerY };
    }
    if (placement === "left") {
      return { x: rect.right, y: centerY };
    }
    if (placement === "down" || placement === "button-bottom") {
      return { x: centerX, y: rect.top };
    }
    if (placement === "up") {
      return { x: centerX, y: rect.bottom };
    }

    return { x: centerX, y: centerY };
  }


  toggleResultsPanel() {
    const isOpen = this.ui.elements.resultsPanel.classList.contains("is-visible");
    if (isOpen) {
      this.cancelAutoAdvance();
      this.ui.hideResults();
      return;
    }

    const stats = this.getCurrentStats();
    if (!stats) {
      return;
    }

    if (this.session?.finished) {
      this.ui.showResults(stats, this.bestStreak);
      this.syncAutoAdvanceForResults();
      return;
    }

    this.cancelAutoAdvance();
    this.ui.showPendingResults();
  }
  persistMusicPreference(enabled) {
    this.musicEnabled = Boolean(enabled);
    saveMusicEnabledPreference(this.musicEnabled);
  }

  get musicPlayer() {
    return this.ui.elements.musicPlayer;
  }

  applyMusicTrack(index) {
    const track = this.musicPlaylist[index];
    if (!track) {
      return;
    }

    this.musicTrackIndex = index;
    this.musicPlayer.src = encodeURI(track.src);
    this.syncMusicUi();
  }

  syncMusicUi() {
    const track = this.musicPlaylist[this.musicTrackIndex];
    this.ui.setMusicState({
      playing: !this.musicPlayer.paused,
      title: track?.title ?? "—",
      playlist: this.musicPlaylist,
      activeIndex: this.musicTrackIndex
    });
  }

  armMusicRestoreOnInteraction() {
    if (this.musicRestoreHandler || !this.musicEnabled) {
      return;
    }

    this.musicRestoreHandler = () => {
      this.tryRestoreMusicPlayback();
    };

    document.addEventListener("pointerdown", this.musicRestoreHandler, { once: true, capture: true });
    document.addEventListener("keydown", this.musicRestoreHandler, { once: true, capture: true });
  }

  disarmMusicRestoreOnInteraction() {
    if (!this.musicRestoreHandler) {
      return;
    }

    document.removeEventListener("pointerdown", this.musicRestoreHandler, { capture: true });
    document.removeEventListener("keydown", this.musicRestoreHandler, { capture: true });
    this.musicRestoreHandler = null;
  }

  async tryRestoreMusicPlayback() {
    if (!this.musicEnabled || !this.musicPlayer.paused) {
      return;
    }

    await this.playMusic({ autoplay: true, persistPreference: false });
  }

  async playMusic({ autoplay, persistPreference = true }) {
    if (!this.musicPlayer.src) {
      this.applyMusicTrack(this.musicTrackIndex);
    }

    try {
      if (autoplay) {
        if (persistPreference) {
          this.persistMusicPreference(true);
        }

        await this.musicPlayer.play();
        this.disarmMusicRestoreOnInteraction();
      } else {
        this.musicPlayer.pause();
        this.disarmMusicRestoreOnInteraction();

        if (persistPreference) {
          this.persistMusicPreference(false);
        }
      }
    } catch (error) {
      if (autoplay) {
        this.armMusicRestoreOnInteraction();
      }
      console.warn("Music playback failed:", error);
    }

    this.syncMusicUi();
  }

  async toggleMusicPlayback() {
    await this.playMusic({ autoplay: this.musicPlayer.paused });
  }

  async playTrackByOffset(offset, { autoplay = true } = {}) {
    if (!this.musicPlaylist.length) {
      return;
    }

    const nextIndex = (this.musicTrackIndex + offset + this.musicPlaylist.length) % this.musicPlaylist.length;
    this.applyMusicTrack(nextIndex);

    if (!autoplay) {
      this.musicPlayer.pause();
      this.musicPlayer.currentTime = 0;
      this.syncMusicUi();
      return;
    }

    await this.playMusic({ autoplay: true });
  }

  async playNextTrack(options) {
    await this.playTrackByOffset(1, options);
  }

  async playPreviousTrack(options) {
    await this.playTrackByOffset(-1, options);
  }

  setDrawerOpen(isOpen) {
    this.drawerOpen = Boolean(isOpen);
    this.ui.setDrawerOpen(this.drawerOpen);
  }

  setMetricsPanelOpen(isOpen) {
    this.metricsCollapsed = !isOpen;
    if (isOpen) {
      this.explanationOpen = false;
    }

    this.ui.setMetricsCollapsed(this.metricsCollapsed);
    this.ui.setExplanationOpen(this.explanationOpen);
    this.hideHelpGuide();
  }

  toggleMetricsPanel() {
    this.setMetricsPanelOpen(this.metricsCollapsed);
  }

  setExplanationPanelOpen(isOpen, { smoothClose = false } = {}) {
    this.explanationOpen = Boolean(isOpen);
    if (this.explanationOpen) {
      this.metricsCollapsed = true;
    }

    this.ui.setMetricsCollapsed(this.metricsCollapsed);
    this.ui.setExplanationOpen(this.explanationOpen, { smoothClose });
    this.hideHelpGuide();
  }

  toggleExplanationPanel() {
    this.setExplanationPanelOpen(!this.explanationOpen, { smoothClose: this.explanationOpen });
  }

  findTaskById(taskId) {
    return this.tasksById.get(taskId) ?? null;
  }

  pickFromTasks(tasks, predicate) {
    if (!tasks.length) {
      return null;
    }

    return tasks.find(predicate) || tasks[0];
  }

  pickTaskFromType(typeId) {
    return this.pickTaskFromBranch(
      this.tasks.filter((task) => task.typeId === typeId)
    );
  }

  pickTaskFromSubtype(typeId, subtypeId) {
    return this.pickTaskFromBranch(
      this.tasks.filter((task) => task.typeId === typeId && task.subtypeId === subtypeId)
    );
  }

  pickTaskFromBranch(tasks) {
    const pool = this.getUnfinishedTasks(tasks);

    if (this.isRandomOrder() || this.isEachTypeOrder()) {
      return this.pickRandomTask(pool.length ? pool : tasks, this.currentTask?.id);
    }

    return pool[0] ?? this.pickFromTasks(tasks, (task) => task.id === this.currentTask?.id);
  }

  getUnfinishedTasks(tasks) {
    return tasks.filter((task) => !this.taskSummaries.get(task.id)?.finished);
  }

  getTaskBranchKey(task) {
    return `${task.typeId}:${task.subtypeId}`;
  }

  getTaskBranches() {
    const seen = new Set();
    const branches = [];

    for (const task of this.tasks) {
      const key = this.getTaskBranchKey(task);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      branches.push({
        typeId: task.typeId,
        subtypeId: task.subtypeId
      });
    }

    return branches;
  }

  getTaskTreeKeys() {
    const typeIds = new Set();
    const subtypeKeys = new Set();

    for (const task of this.tasks) {
      typeIds.add(task.typeId);
      subtypeKeys.add(this.getTaskBranchKey(task));
    }

    return { typeIds, subtypeKeys };
  }

  isWholeTaskTreeExpanded() {
    const { typeIds, subtypeKeys } = this.getTaskTreeKeys();

    if (!typeIds.size) {
      return false;
    }

    for (const typeId of typeIds) {
      if (!this.expandedTypes.has(typeId)) {
        return false;
      }
    }

    for (const subtypeKey of subtypeKeys) {
      if (!this.expandedSubtypes.has(subtypeKey)) {
        return false;
      }
    }

    return true;
  }

  setWholeTaskTreeExpanded(isExpanded) {
    const { typeIds, subtypeKeys } = this.getTaskTreeKeys();

    this.expandedTypes = isExpanded ? new Set(typeIds) : new Set();
    this.expandedSubtypes = isExpanded ? new Set(subtypeKeys) : new Set();
    this.renderTaskList();
  }

  toggleWholeTaskTree() {
    this.setWholeTaskTreeExpanded(!this.isWholeTaskTreeExpanded());
  }

  getTasksFromBranch(branch) {
    if (!branch) {
      return [];
    }

    return this.tasks.filter((task) => task.typeId === branch.typeId && task.subtypeId === branch.subtypeId);
  }

  pickRandomTaskFromBranch(branch, excludedTaskId = null) {
    return this.pickRandomTask(this.getTasksFromBranch(branch), excludedTaskId);
  }

  pickRandomTask(tasks, excludedTaskId = null) {
    if (!tasks.length) {
      return null;
    }

    const pool = tasks.length > 1 && excludedTaskId
      ? tasks.filter((task) => task.id !== excludedTaskId)
      : tasks;

    return pool[Math.floor(Math.random() * pool.length)] ?? tasks[0];
  }

  resolveNextTask() {
    if (!this.tasks.length) {
      return null;
    }

    if (this.isRandomOrder()) {
      return this.pickRandomTask(this.tasks, this.currentTask?.id);
    }

    if (this.isEachTypeOrder()) {
      return this.resolveNextEachTypeTask();
    }

    const currentIndex = this.tasks.findIndex((task) => task.id === this.currentTask?.id);
    if (currentIndex < 0) {
      return this.tasks[0];
    }

    return this.tasks[(currentIndex + 1) % this.tasks.length];
  }

  resolveNextEachTypeTask() {
    const branches = this.getTaskBranches();
    if (!branches.length) {
      return null;
    }

    const currentBranchKey = this.currentTask ? this.getTaskBranchKey(this.currentTask) : null;
    const currentBranchIndex = branches.findIndex((branch) => `${branch.typeId}:${branch.subtypeId}` === currentBranchKey);
    const nextBranch = branches[(currentBranchIndex + 1) % branches.length] ?? branches[0];
    return this.pickRandomTaskFromBranch(nextBranch, this.currentTask?.id);
  }

  handleOrderModeClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("[data-order-mode]");
    if (!button) {
      return;
    }

    this.setOrderMode(button.dataset.orderMode);
  }

  handleTaskListClick(event) {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const taskButton = target.closest("[data-task-id]");
    if (taskButton) {
      this.switchTask(taskButton.dataset.taskId);
      this.setDrawerOpen(false);
      return;
    }

    const actionButton = target.closest("[data-tree-action]");
    if (!actionButton) {
      return;
    }

    const { typeId, subtypeId, treeAction: action } = actionButton.dataset;

    if (action === "toggle-type") {
      this.toggleExpanded(this.expandedTypes, typeId);
      this.renderTaskList();
      return;
    }

    if (action === "toggle-subtype") {
      this.toggleExpanded(this.expandedSubtypes, `${typeId}:${subtypeId}`);
      this.renderTaskList();
      return;
    }

    const task = action === "pick-type"
      ? this.pickTaskFromType(typeId)
      : this.pickTaskFromSubtype(typeId, subtypeId);

    if (task) {
      this.switchTask(task.id);
      this.setDrawerOpen(false);
    }
  }

  toggleExpanded(collection, key) {
    if (collection.has(key)) {
      collection.delete(key);
      return;
    }

    collection.add(key);
  }

  resetSessionUi({
    resultText = RESULT_PLACEHOLDER,
    keepInputEnabled = true,
    resetStreaks = true
  } = {}) {
    // Эти поля живут отдельно от TaskSession, поэтому сбрасываем их централизованно.
    if (resetStreaks) {
      this.currentStreak = 0;
      this.bestStreak = 0;
    }

    this.isPaused = false;
    this.cancelAutoAdvance();
    this.ui.hideResults();
    this.syncStreakUi();
    this.ui.setPaused(false);
    this.ui.setAutoAdvanceState({ enabled: this.autoAdvanceEnabled });
    this.ui.renderResultText(resultText);

    if (this.input) {
      this.input.setEnabled(keepInputEnabled);
    }
  }

  renderActiveSession() {
    this.renderTaskList();
    this.ui.renderSession(this.session);
    this.ui.renderStats(this.session);
  }

  setAutoAdvanceEnabled(enabled) {
    this.autoAdvanceEnabled = Boolean(enabled);
    saveAutoAdvancePreference(this.autoAdvanceEnabled);
    this.ui.setAutoAdvanceState({ enabled: this.autoAdvanceEnabled });

    if (this.session?.finished) {
      this.syncAutoAdvanceForResults();
    }
  }

  isRandomOrder() {
    return this.orderMode === ORDER_MODES.random;
  }

  isEachTypeOrder() {
    return this.orderMode === ORDER_MODES.eachType;
  }

  normalizeOrderMode(mode) {
    return Object.values(ORDER_MODES).includes(mode) ? mode : ORDER_MODES.sequential;
  }

  setOrderMode(mode) {
    const nextMode = this.normalizeOrderMode(mode);
    const changed = nextMode !== this.orderMode;
    this.orderMode = nextMode;
    saveOrderModePreference(this.orderMode);
    this.ui.setOrderModeState(this.orderMode);

    if (changed) {
      track("order_mode_change", { order_mode: this.orderMode });
    }
  }

  recalculateStreaks() {
    if (!this.session) {
      this.currentStreak = 0;
      this.bestStreak = 0;
      return;
    }

    let current = 0;
    let best = 0;

    for (const symbol of this.session.symbols) {
      if (!symbol.entered) {
        break;
      }

      if (symbol.correct === true && symbol.fixed === false) {
        current += 1;
        best = Math.max(best, current);
        continue;
      }

      current = 0;
    }

    this.currentStreak = current;
    this.bestStreak = best;
  }

  syncStreakUi() {
    this.ui.setStreak(this.currentStreak);
  }

  getCurrentStats() {
    return this.session?.getStats() ?? null;
  }

  getTaskAnalyticsPayload(task = this.currentTask) {
    if (!task) {
      return {};
    }

    return {
      task_id: task.id,
      task_type: task.typeId,
      subtype_id: task.subtypeId,
      variant_id: task.variantId
    };
  }

  isTypingFocused() {
    return document.activeElement === this.typingInput;
  }

  isBetterResult(candidateResult, currentBestResult) {
    return !currentBestResult
      || candidateResult.accuracy > currentBestResult.accuracy
      || (candidateResult.accuracy === currentBestResult.accuracy && candidateResult.speed > currentBestResult.speed);
  }

  switchTask(taskId) {
    const task = this.findTaskById(taskId);
    if (!task) {
      return;
    }

    this.currentTask = task;
    this.session = loadSession(task, TaskSession) || new TaskSession(task);
    this.typingStarted = false;
    this.expandTaskBranch(task);
    saveActiveTaskId(task.id);
    this.recalculateStreaks();

    const shouldShowResults = this.session.finished;

    this.ui.renderTaskMeta(task);
    this.resetSessionUi({
      resultText: RESULT_PLACEHOLDER,
      keepInputEnabled: !this.session.finished,
      resetStreaks: false
    });
    this.renderActiveSession();
    this.ui.renderBestResult(this.bestResults[task.id]);

    if (shouldShowResults) {
      const stats = this.getCurrentStats();
      this.ui.showResults(stats, this.bestStreak);
      this.syncAutoAdvanceForResults();
    }

    this.updateEditorHint();
    this.focusInput();
    track("task_open", this.getTaskAnalyticsPayload(task));
  }

  expandTaskBranch(task) {
    this.expandedTypes.add(task.typeId);
    this.expandedSubtypes.add(`${task.typeId}:${task.subtypeId}`);
  }

  restartTask() {
    if (!this.session) {
      return;
    }

    this.session.restartAttempt();
    this.typingStarted = false;
    this.persistSession();
    this.renderActiveSession();
    this.resetSessionUi({ resultText: RESTART_MESSAGE });
    this.updateEditorHint();
    this.focusInput();
    track("retry_task", this.getTaskAnalyticsPayload());
  }

  submitChar(char) {
    this.session.input(char);
    this.afterSessionUpdate();
  }

  handleChar(char) {
    if (!this.session || this.session.finished) {
      return;
    }

    this.resumeTypingIfPaused();
    if (!this.typingStarted) {
      this.typingStarted = true;
      track("typing_start", this.getTaskAnalyticsPayload());
    }
    this.submitChar(char);
  }

  handleBackspace() {
    if (!this.session || this.session.finished) {
      return;
    }

    this.resumeTypingIfPaused();
    this.session.backspace();
    this.afterSessionUpdate();
  }

  afterSessionUpdate() {
    this.recalculateStreaks();
    this.persistSession();
    this.renderActiveSession();
    this.syncStreakUi();
    this.updateEditorHint();

    if (this.session.finished) {
      this.onFinished();
    }
  }

  onFinished() {
    const stats = this.getCurrentStats();
    if (!stats || !this.currentTask) {
      return;
    }

    const accuracy = Math.round(stats.accuracy * 100);
    const bestResult = this.bestResults[this.currentTask.id];
    const nextResult = {
      accuracy,
      speed: stats.cpm,
      timeMs: stats.timeMs
    };

    this.isPaused = false;
    this.input?.setEnabled(false);
    this.ui.setPaused(false);

    if (this.isBetterResult(nextResult, bestResult)) {
      this.bestResults[this.currentTask.id] = nextResult;
      saveBestResults(this.bestResults);
    }

    this.ui.renderBestResult(this.bestResults[this.currentTask.id]);
    this.ui.showResults(stats, this.bestStreak);
    track("task_finish", {
      ...this.getTaskAnalyticsPayload(),
      duration_sec: Math.round(stats.timeMs / 1000),
      accuracy: Math.round((stats.accuracy ?? 0) * 100),
      cpm: Math.round(stats.cpm ?? 0),
      rank: this.ui.getRankLabel(stats),
      best_streak: this.bestStreak ?? 0,
      order_mode: this.orderMode
    });
    this.syncAutoAdvanceForResults();
    this.updateEditorHint();
  }

  switchToNextTask() {
    this.cancelAutoAdvance();
    const nextTask = this.resolveNextTask();
    if (!nextTask) {
      return;
    }

    track("next_task", {
      ...this.getTaskAnalyticsPayload(this.currentTask),
      next_task_id: nextTask.id,
      order_mode: this.orderMode
    });
    this.switchTask(nextTask.id);
  }

  cancelAutoAdvance() {
    if (this.autoAdvanceTimeout) {
      window.clearTimeout(this.autoAdvanceTimeout);
      this.autoAdvanceTimeout = null;
    }

    if (this.autoAdvanceCountdownInterval) {
      window.clearInterval(this.autoAdvanceCountdownInterval);
      this.autoAdvanceCountdownInterval = null;
    }

    this.ui.setAutoAdvanceState({ enabled: this.autoAdvanceEnabled });
  }

  syncAutoAdvanceForResults() {
    this.cancelAutoAdvance();

    if (!this.autoAdvanceEnabled) {
      return;
    }

    let secondsLeft = AUTO_ADVANCE_START_SECONDS;
    this.ui.setAutoAdvanceState({ enabled: true, secondsLeft });

    this.autoAdvanceCountdownInterval = window.setInterval(() => {
      secondsLeft -= 1;

      if (secondsLeft <= 0) {
        window.clearInterval(this.autoAdvanceCountdownInterval);
        this.autoAdvanceCountdownInterval = null;
        return;
      }

      this.ui.setAutoAdvanceState({ enabled: true, secondsLeft });
    }, 1000);

    this.autoAdvanceTimeout = window.setTimeout(() => {
      this.autoAdvanceTimeout = null;
      this.switchToNextTask();
    }, AUTO_ADVANCE_DELAY_MS);
  }

  startTicker() {
    if (this.tickInterval) {
      return;
    }

    this.tickInterval = window.setInterval(() => {
      if (!this.session?.startedAt || this.session.finished) {
        return;
      }

      this.ui.renderStats(this.session);
      this.syncStreakUi();
    }, 200);
  }

  setSessionActive(isActive) {
    if (!this.session || this.session.finished) {
      return;
    }

    if (isActive) {
      if (!this.session.active && (this.session.duration > 0 || this.session.cursor > 0)) {
        this.session.active = true;
        this.session.startedAt = Date.now();
      }
      return;
    }

    if (this.session.active && this.session.startedAt) {
      this.session.duration += Date.now() - this.session.startedAt;
      this.session.startedAt = null;
    }

    this.session.active = false;
  }

  togglePause() {
    if (!this.session || this.session.finished) {
      return;
    }

    if (this.isPaused) {
      this.resumeFromPause();
      return;
    }

    this.pauseSession();
  }

  pauseSession() {
    if (!this.session || this.session.finished || this.isPaused) {
      return;
    }

    this.setSessionActive(false);
    this.isPaused = true;
    this.persistSession();
    this.ui.setPaused(true);
    this.ui.renderStats(this.session);
    this.ui.renderResultText(PAUSE_MESSAGE);
    this.updateEditorHint();
  }

  pauseForInactiveTyping() {
    if (!this.session?.active) {
      return;
    }

    this.pauseSession();
  }

  resumeFromPause() {
    if (!this.session || this.session.finished || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.setSessionActive(true);
    this.input?.setEnabled(true);
    this.ui.setPaused(false);
    this.ui.renderResultText(RESUME_MESSAGE);
    this.updateEditorHint();
    this.focusInput();
  }

  resumeTypingIfPaused() {
    if (this.isPaused) {
      this.resumeFromPause();
    }
  }

  handleTypingBlur() {
    // Pointerdown on the pause button happens before it steals focus from the typing input.
    if (this.ignoreNextInputBlur) {
      this.ignoreNextInputBlur = false;
      this.updateEditorHint();
      return;
    }

    window.setTimeout(() => {
      if (document.activeElement === this.typingInput) {
        return;
      }

      this.pauseForInactiveTyping();
      this.updateEditorHint();
    }, 0);
  }

  buildActiveHint(stats) {
    // Подсказка собирается из текущего символа и состояния сессии,
    // чтобы весь "язык интерфейса" менялся в одном месте.
    const currentSymbol = this.session.symbols[this.session.cursor];
    const previousSymbol = this.session.symbols[this.session.cursor - 1];
    const expected = currentSymbol?.expected;
    const remaining = Math.max(stats.total - stats.cursor, 0);
    const isFocused = this.isTypingFocused();

    if (previousSymbol?.entered && previousSymbol.correct === false) {
      return {
        focused: isFocused,
        hint: {
          text: "Нажми Backspace и исправь ошибку",
          tone: "danger"
        }
      };
    }

    if (expected === "\t" && isFocused) {
      return { focused: true, hint: "tab" };
    }

    if (expected === "\n" && isFocused) {
      return {
        focused: true,
        hint: {
          text: "Конец строки: жми Enter",
          tone: "accent"
        }
      };
    }

    if (isFocused && remaining > 0 && remaining <= 8) {
      return {
        focused: true,
        hint: {
          text: `Финиш близко: осталось ${remaining} симв.`,
          tone: "success"
        }
      };
    }

    if (isFocused) {
      return {
        focused: true,
        hint: {
          text: remaining <= 8 ? "Финиш близко" : "Печать активна",
          tone: "info"
        }
      };
    }

    return {
      focused: false,
      hint: stats.entered > 0
        ? {
          text: "Кликни здесь, чтобы продолжить",
          tone: "warning"
        }
        : "idle"
    };
  }

  updateEditorHint() {
    if (!this.session) {
      this.ui.setFocused(false);
      this.ui.renderEditorHint("loading");
      return;
    }

    if (this.session.finished) {
      this.ui.setFocused(false);
      this.ui.renderEditorHint("finished");
      return;
    }

    if (this.isPaused) {
      this.ui.setFocused(false);
      this.ui.renderEditorHint("paused");
      return;
    }

    const nextState = this.buildActiveHint(this.getCurrentStats());
    this.ui.setFocused(nextState.focused);
    this.ui.renderEditorHint(nextState.hint);
  }

  focusInput() {
    if (!this.input) {
      return;
    }

    this.input.setEnabled(!this.session?.finished);
    this.input.focus();
    this.updateEditorHint();
  }
}

function track(event, params = {}) {
  if (typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", event, params);
}

document.addEventListener("DOMContentLoaded", async () => {
  const app = new App();

  try {
    await app.init();
  } catch (error) {
    console.error(error);
    app.ui.elements.codePreview.innerHTML = `<span class="code-char is-wrong">${error.message}</span>`;
    app.ui.elements.resultText.textContent = "Не удалось загрузить задания. Проверь, что проект открыт через Live Server.";
  }
});





