// input.js
// Назначение: один раз навесить обработчики на hidden textarea
// и переводить ввод пользователя в "события" для App.
//
// ВАЖНО:
// - input.js НЕ знает, что такое TaskSession, задания, finished, storage и т.п.
// - input.js НЕ трогает DOM (кроме focus и очистки textarea).
// - input.js ничего "не решает" — он только вызывает handlers.*
//
// Почему textarea (hiddenInput), а не keydown на body?
// - На мобилках/IME keydown не всегда даёт реальный ввод.
// - Событие "input" даёт фактические символы, которые появились в поле.
// - compositionstart/end нужен для IME (китайский, автодоп, некоторые раскладки).

export class InputController {
  /**
   * @param {HTMLTextAreaElement} el - textarea, куда браузер будет "печать" ввод.
   * @param {Object} handlers - набор коллбеков (куда отправлять события).
   *
   * Минимально ожидаемые handlers:
   *  - onChar(ch: string)
   *  - onBackspace()
   *  - onTab()
   *  - onEnter()
   *
   * Можно вместо отдельных методов передать handlers.dispatch(event),
   * но сейчас делаем проще и понятнее.
   */
  constructor(el, handlers) {
    this.el = el;
    this.handlers = handlers;

    // Флаг: идёт ли IME-композиция (ввод "пачкой", например через подсказки/кандидаты)
    this.composing = false;

    // Можно выключать контроллер (например после finished),
    // чтобы он просто игнорировал ввод.
    this.enabled = true;

    // Чтобы detach() мог снять обработчики, нужны те же ссылки на функции.
    // Поэтому заранее биндим методы.
    this._onKeydown = this._onKeydown.bind(this);
    this._onInput = this._onInput.bind(this);
    this._onCompositionStart = this._onCompositionStart.bind(this);
    this._onCompositionEnd = this._onCompositionEnd.bind(this);
    this._onBeforeInput = this._onBeforeInput.bind(this);
  }

  /**
   * Навесить обработчики. ДОЛЖНО быть вызвано один раз за жизнь страницы
   * (это обеспечит app.js).
   */
  attach() {
    if (!this.el) throw new Error("InputController: textarea element is missing");

    // compositionstart/end — чтобы не ловить "двойной ввод" при IME
    this.el.addEventListener("compositionstart", this._onCompositionStart);
    this.el.addEventListener("compositionend", this._onCompositionEnd);

    // keydown — чтобы перехватывать Backspace/Tab/Enter и не давать браузеру
    // делать "свои" действия (Tab — смена фокуса, Enter — перевод строки в textarea)
    this.el.addEventListener("keydown", this._onKeydown);

    // input — для обычных символов (и для вставки, авто-ввода и т.п.)
    this.el.addEventListener("input", this._onInput);

    this.el.addEventListener("beforeinput", this._onBeforeInput);
  }

  /**
   * Снять обработчики (редко нужно, но полезно для чистоты).
   */
  detach() {
    if (!this.el) return;

    this.el.removeEventListener("compositionstart", this._onCompositionStart);
    this.el.removeEventListener("compositionend", this._onCompositionEnd);
    this.el.removeEventListener("keydown", this._onKeydown);
    this.el.removeEventListener("input", this._onInput);
    this.el.removeEventListener("beforeinput", this._onBeforeInput);
  }

  /**
   * Включить/выключить обработку.
   * Например: после finish можно setEnabled(false),
   * чтобы любые события игнорировались.
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  /**
   * Сфокусировать textarea, чтобы ввод шёл туда.
   */
  focus() {
  if (!this.el) return;

  // preventScroll поддерживается современными браузерами
  try {
    this.el.focus({ preventScroll: true });
  } catch {
    this.el.focus();
  }
}

  /**
   * Очистить поле ввода (чтобы input не содержал "хвостов")
   */
  clear() {
    if (!this.el) return;
    this.el.value = "";
  }

  // ----------------------------
  // Внутренние обработчики
  // ----------------------------

  _onCompositionStart() {
    // Пока composing=true — мы НЕ обрабатываем event "input",
    // потому что IME может дергать input несколько раз промежуточно.
    this.composing = true;
  }
  _onCompositionEnd(e) {
    // IME завершил композицию и "зафиксировал" текст.
    // Часто e.data содержит итоговую строку.
    this.composing = false;

    // Если контроллер выключен — ничего не делаем.
    if (!this.enabled) {
      this.clear();
      return;
    }

    // Важно: иногда итоговый текст приходит сюда, а иногда придёт ещё и input-событие.
    // Поэтому делаем так:
    // - если e.data есть — обрабатываем её здесь
    // - а в _onInput всё равно стоит guard "if (composing) return;"
    //   что уменьшает шанс дубля.
    const text = e && typeof e.data === "string" ? e.data : "";
    if (text) {
      if (text.length > 1) {
        this.clear();
        return;
      }
      this._emitChars(text);
    }

    // Всегда очищаем поле после обработки.
    this.clear();
  }

  _onKeydown(e) {
    if (!this.enabled) return;

    // Backspace: браузер по умолчанию удалит символ в textarea.
    // Нам это не надо — мы управляем состоянием сами.
    if (e.key === "Backspace") {
      e.preventDefault();
      this.clear(); // чтобы textarea не накапливала мусор
      if (this.handlers && typeof this.handlers.onBackspace === "function") {
        this.handlers.onBackspace();
      }
      return;
    }

    // Tab: по умолчанию браузер переводит фокус на следующий элемент.
    // Нам нужно воспринимать Tab как символ табуляции.
    if (e.key === "Tab") {
      e.preventDefault();
      this.clear();
      if (this.handlers && typeof this.handlers.onTab === "function") {
        this.handlers.onTab();
      } else if (this.handlers && typeof this.handlers.onChar === "function") {
        // Если нет отдельного onTab — можно трактовать как символ '\t'
        this.handlers.onChar("\t");
      }
      return;
    }

    // Enter: по умолчанию в textarea добавит '\n'.
    // Мы хотим контролировать это сами.
    if (e.key === "Enter") {
      e.preventDefault();
      this.clear();
      if (this.handlers && typeof this.handlers.onEnter === "function") {
        this.handlers.onEnter();
      } else if (this.handlers && typeof this.handlers.onChar === "function") {
        this.handlers.onChar("\n");
      }
      return;
    }

    // Остальные клавиши НЕ обрабатываем здесь.
    // Пусть они попадут в textarea и придут через событие "input".
    // Это важно для:
    // - мобильных клавиатур
    // - вставки текста
    // - авто-дополнения
  }

  _onInput() {
    // Во время IME-композиции игнорируем input, чтобы не ловить промежуточные состояния.
    if (this.composing) return;

    if (!this.enabled) {
      this.clear();
      return;
    }

    // В textarea может прилететь:
    // - один символ
    // - несколько символов (вставка Ctrl+V, автоподстановка)
    // - пробелы
    // - даже '\n' (в некоторых случаях)
    const text = this.el.value;
    // анти-чит: если прилетело больше 1 символа за событие — игнор
    if (text.length > 1) {
      this.clear();
      return;
    }
    if (!text) return;

    // Отправляем по символам.
    // Если вставили "abc" — будет три onChar('a'), onChar('b'), onChar('c').
    this._emitChars(text);

    // И обязательно чистим textarea, чтобы следующий input был "чистым".
    this.clear();
  }

  /**
   * Отправить строку посимвольно в handlers.onChar()
   * (и только туда — Tab/Enter мы обычно ловим в keydown, но на всякий случай
   * input может принести любые символы, включая '\n').
   */
  _emitChars(text) {
    if (!this.handlers || typeof this.handlers.onChar !== "function") return;

    // В JS строка итерируется по юникод-символам корректнее через for..of,
    // чем через index (особенно для эмодзи/суррогатных пар).
    for (const ch of text) {
      this.handlers.onChar(ch);
    }
  }
  _onBeforeInput(e) {
  if (!this.enabled) return;

  // Это как раз то, что делает моб. автодоп/автозамена:
  // заменяет слово/часть слова "умно", а нам это не нужно.
  const t = e.inputType || "";

  // Жёстко режем всё, что НЕ "обычный ввод одного символа"
  // (replacements, history undo/redo, автозамены и т.п.)
  if (
    t === "insertReplacementText" ||
    t === "insertFromPaste" ||
    t === "insertFromDrop" ||
    t === "insertFromYank" ||
    t === "insertFromComposition" ||   // иногда IME присылает так
    t === "insertCompositionText" ||   // промежуточный текст
    t === "deleteByCut" ||
    t === "historyUndo" ||
    t === "historyRedo"
  ) {
    e.preventDefault();
    this.clear();
    return;
  }

  // Доп. правило: если браузер собирается вставить строку > 1 символа — режем
  // (на некоторых клавиатурах data уже тут есть)
  if (typeof e.data === "string" && e.data.length > 1) {
    e.preventDefault();
    this.clear();
    return;
  }
}
}