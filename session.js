export class TaskSymbol {
  constructor(expected, index) {
    this.expected = expected;
    this.index = index;
    this.entered = false;
    this.correct = null;
    this.fixed = false;
    this.typed = null;
  }

  input(char, previousCorrect) {
    this.entered = true;
    this.typed = char;
    this.correct = char === this.expected && previousCorrect;
  }

  backspace() {
    this.fixed = true;
    this.entered = false;
    this.correct = null;
    this.typed = null;
  }

  reset() {
    this.entered = false;
    this.correct = null;
    this.fixed = false;
    this.typed = null;
  }
}

export class TaskSession {
  constructor(task) {
    this.task = task;
    this.symbols = Array.from(task.code).map((char, index) => new TaskSymbol(char, index));
    this.resetRuntimeState();
  }

  resetRuntimeState() {
    this.cursor = 0;
    this.duration = 0;
    this.startedAt = null;
    this.endedAt = null;
    this.active = false;
    this.finished = false;
    this.atEnd = false;
  }

  resetSymbols() {
    this.symbols.forEach((symbol) => symbol.reset());
  }

  start() {
    if (!this.active && this.startedAt === null) {
      this.active = true;
      this.startedAt = Date.now();
    }
  }

  input(char) {
    this.updateState();
    if (this.finished || this.atEnd) {
      return;
    }

    this.start();
    const previous = this.symbols[this.cursor - 1];
    const previousCorrect = previous ? previous.correct === true : true;
    this.symbols[this.cursor].input(char, previousCorrect);
    this.cursor += 1;
    this.updateState();
  }

  backspace() {
    this.updateState();
    if (this.finished || this.cursor <= 0) {
      return;
    }

    this.start();
    if (this.atEnd) {
      this.cursor = this.symbols.length;
    }

    this.cursor -= 1;
    this.symbols[this.cursor].backspace();
    this.updateState();
  }

  reset() {
    this.restartAttempt();
  }

  restartAttempt() {
    this.resetSymbols();
    this.resetRuntimeState();
  }

  updateState() {
    const total = this.symbols.length;
    this.atEnd = this.cursor >= total;

    if (total === 0) {
      this.finish();
      return;
    }

    if (this.finished) {
      this.finish();
      return;
    }

    if (this.atEnd && this.isPassed()) {
      this.endedAt = Date.now();
      this.finish();
      return;
    }

    if (this.atEnd) {
      this.cursor = total;
    }
  }

  finish() {
    this.finished = true;
    this.active = false;
    this.atEnd = true;
    this.cursor = this.symbols.length;
  }

  isPassed() {
    return this.symbols.every((symbol) => symbol.entered === true && symbol.correct === true);
  }

  getTimeMs() {
    if (this.finished && this.endedAt && this.startedAt) {
      return this.duration + this.endedAt - this.startedAt;
    }

    if (this.active && this.startedAt) {
      return this.duration + Date.now() - this.startedAt;
    }

    return this.duration || 0;
  }

  getStats() {
    let entered = 0;
    let correct = 0;
    let correctNotFixed = 0;

    for (const symbol of this.symbols) {
      if (symbol.entered) {
        entered += 1;
      }
      if (symbol.correct === true) {
        correct += 1;
      }
      if (symbol.correct === true && symbol.fixed === false) {
        correctNotFixed += 1;
      }
    }

    const timeMs = this.getTimeMs();
    const minutes = Math.max(timeMs / 60000, 3 / 60);
    const wrong = entered - correct;

    return {
      total: this.symbols.length,
      entered,
      correct,
      correctNotFixed,
      wrong,
      cursor: this.cursor,
      finished: this.finished,
      accuracy: entered > 0 ? correctNotFixed / entered : 1,
      cpm: Math.round(correct / minutes),
      timeMs
    };
  }

  toJSON() {
    return {
      cursor: this.cursor,
      duration: this.getTimeMs(),
      finished: this.finished,
      atEnd: this.atEnd,
      symbols: this.symbols.map((symbol) => ({
        entered: symbol.entered,
        correct: symbol.correct,
        fixed: symbol.fixed,
        typed: symbol.typed
      }))
    };
  }

  static fromJSON(task, data) {
    const session = new TaskSession(task);
    session.cursor = data.cursor ?? 0;
    session.duration = data.duration ?? 0;
    session.finished = data.finished ?? false;
    session.atEnd = data.atEnd ?? false;

    data.symbols?.forEach((savedSymbol, index) => {
      const symbol = session.symbols[index];
      if (!symbol) {
        return;
      }

      TaskSession.restoreSymbolState(symbol, savedSymbol);
    });

    session.updateState();
    return session;
  }

  static restoreSymbolState(symbol, savedSymbol) {
    symbol.entered = savedSymbol.entered ?? false;
    symbol.correct = savedSymbol.correct ?? null;
    symbol.fixed = savedSymbol.fixed ?? false;
    symbol.typed = savedSymbol.typed ?? null;
  }
}
