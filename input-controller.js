export class InputController {
  constructor(element, handlers) {
    this.element = element;
    this.handlers = handlers;
    this.enabled = true;
    this.composing = false;
    this.mode = "desktop";
    this.sentinel = "\u200B";

    this.onBeforeInput = this.onBeforeInput.bind(this);
    this.onInput = this.onInput.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
    this.onCompositionStart = this.onCompositionStart.bind(this);
    this.onCompositionEnd = this.onCompositionEnd.bind(this);
  }

  attach() {
    this.element.addEventListener("beforeinput", this.onBeforeInput);
    this.element.addEventListener("input", this.onInput);
    this.element.addEventListener("keydown", this.onKeydown);
    this.element.addEventListener("compositionstart", this.onCompositionStart);
    this.element.addEventListener("compositionend", this.onCompositionEnd);
  }

  setMode(mode) {
    this.mode = mode === "mobile" ? "mobile" : "desktop";
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  focus() {
    try {
      this.element.focus({ preventScroll: true });
    } catch {
      this.element.focus();
    }
    this.ensureSentinel();
  }

  clear() {
    if (this.mode === "mobile") {
      this.ensureSentinel();
      return;
    }

    this.element.value = "";
  }

  onCompositionStart() {
    this.composing = true;
  }

  onCompositionEnd(event) {
    this.composing = false;
    if (!this.enabled) {
      this.clear();
      return;
    }

    const text = typeof event.data === "string" ? event.data : "";
    if (text.length === 1) {
      this.emitChars(text);
    }
    this.clear();
  }

  onBeforeInput(event) {
    if (!this.enabled || this.mode !== "mobile" || this.composing) {
      return;
    }

    const inputType = event.inputType || "";
    if (inputType === "deleteContentBackward") {
      event.preventDefault();
      this.handlers.onBackspace?.();
      this.ensureSentinel();
      return;
    }

    if (inputType === "insertLineBreak") {
      event.preventDefault();
      this.handlers.onEnter?.();
      this.ensureSentinel();
      return;
    }

    if (inputType === "insertText") {
      const char = typeof event.data === "string" ? event.data : "";
      if (char.length !== 1) {
        event.preventDefault();
        this.ensureSentinel();
        return;
      }

      event.preventDefault();
      this.handlers.onChar?.(char);
      this.ensureSentinel();
      return;
    }

    event.preventDefault();
    this.clear();
  }

  onKeydown(event) {
    if (!this.enabled) {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      this.handlers.onBackspace?.();
      this.clear();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.handlers.onTab?.();
      this.clear();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.handlers.onEnter?.();
      this.clear();
    }
  }

  onInput() {
    if (this.mode === "mobile") {
      this.ensureSentinel();
      return;
    }

    if (this.composing) {
      return;
    }

    if (!this.enabled) {
      this.clear();
      return;
    }

    const text = this.element.value;
    if (!text) {
      return;
    }

    if (text.length !== 1) {
      this.clear();
      return;
    }

    this.emitChars(text);
    this.clear();
  }

  emitChars(text) {
    for (const char of text) {
      this.handlers.onChar?.(char);
    }
  }

  ensureSentinel() {
    if (this.mode !== "mobile") {
      return;
    }

    if (this.element.value !== this.sentinel) {
      this.element.value = this.sentinel;
    }

    try {
      this.element.setSelectionRange(this.element.value.length, this.element.value.length);
    } catch {
      // ignore
    }
  }
}
