(function(exports){
    // Примеры заданий (1-27), 2-3 строчные
    const PYTHON_TASKS = [
      { num: 1, code: 'a = 5\nb = 7\nprint(a + b)' },
      { num: 2, code: 'for i in range(3):\n    print(i)' },
      { num: 3, code: 'def greet(name):\n    print("Hello,", name)' },
      { num: 4, code: 'lst = [1,2,3]\nprint(sum(lst))' },
      { num: 5, code: 's = "abc"\nprint(s.upper())' },
      { num: 6, code: 'x = 10\nif x > 5:\n    print("big")' },
      { num: 7, code: 'def square(x):\n    return x*x\nprint(square(4))' },
      { num: 8, code: 'for c in "abc":\n    print(c)' },
      { num: 9, code: 'd = {"a":1}\nprint(d["a"])' },
      { num: 10, code: 'import math\nprint(math.sqrt(16))' },
      { num: 11, code: 'nums = [1,2,3]\nfor n in nums:\n    print(n)' },
      { num: 12, code: 'def f(x):\n    return x+1\nprint(f(2))' },
      { num: 13, code: 'print("Hello, world!")' },
      { num: 14, code: 'a = [i for i in range(3)]\nprint(a)' },
      { num: 15, code: 's = input()\nprint(s[::-1])' },
      { num: 16, code: 'def fact(n):\n    return 1 if n==0 else n*fact(n-1)\nprint(fact(3))' },
      { num: 17, code: 'x = 2\ny = 3\nprint(x*y)' },
      { num: 18, code: 'for i in range(5):\n    if i%2==0:\n        print(i)' },
      { num: 19, code: 'print(len("python"))' },
      { num: 20, code: 'def add(a,b):\n    return a+b\nprint(add(1,2))' },
      { num: 21, code: 'lst = [1,2]\nlst.append(3)\nprint(lst)' },
      { num: 22, code: 'print([x**2 for x in range(4)])' },
      { num: 23, code: 's = "hello"\nfor ch in s:\n    print(ch)' },
      { num: 24, code: 'a = 3\nb = 4\nprint(a*b)' },
      { num: 25, code: 'def even(x):\n    return x%2==0\nprint(even(4))' },
      { num: 26, code: 'print(sum([1,2,3]))' },
      { num: 27, code: 'for i in range(2):\n    print(i*2)' }
    ];
    function normalizeDisplay(ch){
    // Символы для вывода
    if (ch === '\t') return '    ';
    if (ch === '\n') return '\n';
    return ch;
  }
  function normalizedTargetForCompare(ch){
    // Символы для сравнения
    return ch === '\t' ? '    ' : ch;
  }
  function isMatch(targetChar, inputChar){
    // Собственно сравнение
    const normT = normalizedTargetForCompare(targetChar);
    return inputChar === normT;
  }

  function computeCPM(charsTyped, elapsedMs){
    // Расчёт CPM: символов в минуту
  if (!elapsedMs || elapsedMs <= 0) return 0;
  const minutes = elapsedMs / 60000;
  return Math.round(charsTyped / minutes);
}

function computeAccuracy(state){
  // Точность: процент символов, которые были сразу введены верно и не были стёрты, среди всех верно введённых символов
  let maxPos = (typeof window !== 'undefined' && typeof window.maxCursorPos === 'number') ? window.maxCursorPos : state.length;
  let correctFirstTry = 0;
  let correctTotal = 0;
  for (let i = 0; i < maxPos; i++) {
    // Числитель: верно введённые и не стёртые
    if (state[i].entered && state[i].correct === true && state[i].fixed === false) {
      correctFirstTry++;
    }
    // Знаменатель: все верно введённые
    // if (state[i].entered && state[i].correct === true) {
    //   correctTotal++;
    // }
  }
  if (typeof maxPos !== 'undefined') correctTotal = maxPos;
  if (correctTotal === 0) return 0;
  return Math.round((correctFirstTry / correctTotal) * 100);
}
  // UI initializer — использует глобальные id, похож на оригинальную реализацию.
  function initTrainer(options = {}){
        // Инициализация выпадающего меню и смены задания
        if (typeof window !== 'undefined') {
          window.PYTHON_TASKS = PYTHON_TASKS;
          // const select = document.getElementById('taskSelect');
          // if (select && select.children.length === 0) {
          //   PYTHON_TASKS.forEach(task => {
          //     const opt = document.createElement('option');
          //     opt.value = task.num;
          //     opt.textContent = `Задание ${task.num}`;
          //     select.appendChild(opt);
          //   });
          // }
          // При смене задания — обновить код
          // if (select) {
          //   console.log('в переменной select находится:',select)
          //   // select.addEventListener('change', function() {
          //   //   const val = Number(select.value);
          //   //   const found = PYTHON_TASKS.find(t => t.num === val);
          //   //   if (found) {
          //   //     window.CODE_TO_TYPE = found.code;
          //   //     if (window.Trainer && typeof window.Trainer.initTrainer === 'function') {
          //   //       window.Trainer.initTrainer();
          //   //     }
          //   //   }
          //   // });
          //   // По умолчанию — первое задание
          //   if (select.value === '' || select.value === undefined) select.value = '1';
          //   const found = PYTHON_TASKS.find(t => t.num === Number(select.value));
          //   if (found) window.CODE_TO_TYPE = found.code;
          // }
        }
    const codeArea = document.getElementById(options.codeAreaId || 'codeArea');
    const startBtn = document.getElementById(options.startBtnId || 'startBtn');
    const timerEl = document.getElementById(options.timerId || 'timer');
    const progressEl = document.getElementById(options.progressId || 'progress');
    const hintEl = document.getElementById(options.hintId || 'hint');
    const resetBtn = document.getElementById(options.resetBtnId || 'resetBtn');

    const CODE = typeof window !== 'undefined' && window.CODE_TO_TYPE ? window.CODE_TO_TYPE : (options.code || '');
    const chars = CODE.split('');
    // Diagnostic log: report that initTrainer started and show a snippet of code
    // try{ console.log('Trainer.initTrainer start', { codeSnippet: String(CODE).slice(0,120), codeLength: chars.length }); }catch(e){}

    const state = chars.map(() => ({ entered: false, correct: null, fixed: false, typed: null }));
    let cursor = 0;
    let maxCursorPos = 0;
    let started = false;
    let startedAt = null;
    let timerInterval = null;
    let finished = false;
    const STORAGE_KEY = 'typing_trainer_v1_len_' + chars.length;

    const resultsPanel = document.getElementById(options.resultsPanelId || 'resultsPanel');
    const resTimeEl = document.getElementById(options.resTimeId || 'resTime');
    const resWpmEl = document.getElementById(options.resWpmId || 'resWpm');
    const resAccEl = document.getElementById(options.resAccId || 'resAcc');
    const retryBtn = document.getElementById(options.retryBtnId || 'retryBtn');
    const exportBtn = document.getElementById(options.exportBtnId || 'exportBtn');
    const closeResBtn = document.getElementById(options.closeResBtnId || 'closeResBtn');

    function renderCode(){
      if (!codeArea) return;
      codeArea.innerHTML = '';
      chars.forEach((ch, idx) => {
        if (ch === '\n'){
          const marker = document.createElement('span');
          marker.className = 'token newline';
          marker.textContent = (idx === cursor ? '↵' : (state[idx].entered ? ((state[idx].correct || state[idx].typed==='\n') ? '\u00A0': state[idx].typed):''));
          if (state[idx].entered === true) {
            if (idx === cursor) marker.classList.add('current');
            if (state[idx].correct === true) marker.classList.add('correct');
            if (state[idx].correct === false) marker.classList.add('wrong');
          } else {
            // Только token и current (если курсор)
            marker.className = 'token newline' + (idx === cursor ? ' current' : '');
          }
          codeArea.appendChild(marker);
          const tn = document.createTextNode('\n');
          codeArea.appendChild(tn);
          return;
        }
        // Для обычных символов
        let span;
        if (state[idx].entered === true) {
          span = document.createElement('span');
          span.textContent = normalizeDisplay(!state[idx].typed ? ch : (state[idx].typed==='\n' ? '\u00A0' :state[idx].typed));
          span.className = 'token';
          if (idx === cursor) span.classList.add('current');

          if (state[idx].correct === true) {
            span.classList.add('correct');
          }
            // Частный случай для последнего символа
          else {
            if (idx === chars.length - 1) {
              // Красим в красный только если курсор на последнем символе
              if (idx === cursor) span.classList.add('wrong');
            } else {
              span.classList.add('wrong');
            }
          }
          
        } else {
          span = document.createElement('span');
          span.textContent = normalizeDisplay(ch);
          span.className = 'token' + (idx === cursor ? ' current' : '');
        }
        codeArea.appendChild(span);
      });
      // try{ console.log('Trainer.renderCode', { childNodes: codeArea.childNodes.length, preview: codeArea.textContent.slice(0,120) }); }catch(e){}
    }

    const wpmEl = document.getElementById(options.wpmId || 'wpm');
    const accuracyEl = document.getElementById(options.accuracyId || 'accuracy');

    function updateProgress(){
      if (!progressEl) return;
      const total = chars.length;
      const entered = state.slice(0, maxCursorPos).filter(s => s.entered && s.correct === true).length;
      progressEl.textContent = `${entered} / ${total}`;

      // Обновляем CPM и точность
      const elapsed = started && startedAt ? (Date.now() - startedAt) : 0;
      const cpm = computeCPM(entered, elapsed);
      const acc = computeAccuracy(state);
      const errors = state.filter(s => s.entered && s.correct === false).length;
      if (wpmEl) wpmEl.textContent = String(cpm);
      if (accuracyEl) accuracyEl.textContent = `${acc}%`;
      const errorsEl = document.getElementById('errors');
      if (errorsEl) errorsEl.textContent = String(errors);
    }

    function formatTime(ms){
      const totalSec = Math.floor(ms / 1000);
      const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const s = String(totalSec % 60).padStart(2, '0');
      return `${m}:${s}`;
    }

    function startTimer(){
      if (timerInterval) return;
      startedAt = Date.now();
      timerInterval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        if (timerEl) timerEl.textContent = formatTime(elapsed);
      }, 200);
    }

    function stopTimer(){
      if (timerInterval){
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    function saveProgress(){
      try{
        const payload = { state, cursor, started, startedAt: startedAt || null, savedAt: Date.now(), codeLength: chars.length };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }catch(e){ /* ignore */ }
    }

    function clearSavedProgress(){
      try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    }

    function loadProgress(){
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const p = JSON.parse(raw);
        if (!p || p.codeLength !== chars.length) return false;
        for (let i = 0; i < Math.min(state.length, p.state.length); i++){
          state[i].entered = !!p.state[i].entered;
          state[i].correct = p.state[i].correct === true ? true : (p.state[i].correct === false ? false : null);
          state[i].fixed= !!p.state[i].fixed;
          state[i].typed= p.state[i].typed ?? null;
        }
        cursor = typeof p.cursor === 'number' ? p.cursor : 0;
        started = !!p.started;
        startedAt = p.startedAt || null;
        if (started && startedAt) startTimer();
        return true;
      }catch(e){ return false; }
    }

    // Используем скрытый textarea для надёжного приёма ввода (IME, мобильные клавиатуры)
    const inputEl = document.getElementById(options.inputId || 'hiddenInput');
    let composing = false;

    function handleBackspace(){
      if (finished) return;
      if (cursor > 0){
        const idx = cursor - 1;
        state[idx].entered = false;
        state[idx].correct = null;
        state[idx].fixed = true;
        state[idx].typed = null
        // Если курсор был на последнем символе и он был ошибочным — сбрасываем цвет
        if (cursor === state.length-1 && state[cursor].entered && state[cursor].correct === false) {
          state[cursor].entered = false;
          state[cursor].correct = null;
          state[cursor].fixed = true;
          state[cursor].typed = null;
        }
        cursor = idx;
        renderCode(); updateProgress(); saveProgress();
      }
    }

    function handleCharInput(ch){
      if (finished) return;
      if (!started){ started = true; startTimer(); }
      const targetChar = chars[cursor];
      // Normalize input for comparison: treat Tab as 4 spaces (displayed form)
      const inputForCompare = ch === '\t' ? '    ' : (ch === '\n' ? '\n' : ch);
      const match = isMatch(targetChar, inputForCompare);
      

      state[cursor].entered = true;
      state[cursor].typed = ch
      if (cursor === 0 || state[cursor-1].correct === true) state[cursor].correct = match;
      else state[cursor].correct = false;

      // Если курсор на последнем символе
      if (cursor === chars.length - 1) {
        // Можно уйти только если все символы введены верно
        if (state.every(s => s.entered && s.correct === true)) {
          cursor = cursor + 1;
          if (cursor > maxCursorPos) maxCursorPos = cursor;
          window.maxCursorPos = maxCursorPos;
        } else {
          // Остаёмся на последнем символе
        }
      } else {
        cursor = cursor + 1;
        if (cursor > maxCursorPos) maxCursorPos = cursor;
        window.maxCursorPos = maxCursorPos;
      }
      renderCode(); updateProgress(); saveProgress();

      if (cursor >= chars.length && state.every(elem => elem.correct === true)){
        finished = true;
        stopTimer();
        const elapsed = startedAt ? (Date.now() - startedAt) : 0;
        // show final results
        try{
          const entered = state.slice(0, maxCursorPos).filter(s=>s.entered && s.correct === true).length;
          const cpm = computeCPM(entered, elapsed);
          const acc = computeAccuracy(state);
          const errors = state.filter(s => s.entered && s.correct === false).length;
          if (resTimeEl) resTimeEl.textContent = formatTime(elapsed);
          if (resWpmEl) resWpmEl.textContent = String(cpm);
          if (resAccEl) resAccEl.textContent = `${acc}%`;
          const resErrorsEl = document.getElementById('resErrors');
          if (resErrorsEl) resErrorsEl.textContent = String(errors);
          if (resultsPanel) resultsPanel.style.display = 'block';
        }catch(e){}
        clearSavedProgress();
      }
    }

    if (inputEl){
      // composition events for IME
      inputEl.addEventListener('compositionstart', () => { composing = true; });
      inputEl.addEventListener('compositionend', (e) => { composing = false; if (e.data) handleCharInput(e.data); inputEl.value = ''; });

      // keydown for Backspace/Tab/Enter handling
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace'){
          e.preventDefault(); handleBackspace(); return;
        }
        if (e.key === 'Tab'){
          e.preventDefault(); handleCharInput('\t'); return;
        }
        if (e.key === 'Enter'){
          e.preventDefault(); handleCharInput('\n'); return;
        }
      });

      // input event for normal characters
      inputEl.addEventListener('input', (e) => {
        if (composing) return;
        const val = inputEl.value;
        if (!val) return;
        for (const ch of val){
          handleCharInput(ch);
        }
        inputEl.value = '';
      });

      // focus the hidden input when user clicks code area
      if (codeArea){
        codeArea.addEventListener('click', () => { inputEl.focus(); });
      }
      // autofocus
      inputEl.focus();
    }
    
    // wire results panel buttons
    if (retryBtn) retryBtn.addEventListener('click', () => {
      for (let i = 0; i < state.length; i++){ state[i].entered = false; state[i].correct = null; }
      cursor = 0; started = false; startedAt = null; finished = false; stopTimer(); if (timerEl) timerEl.textContent = '00:00'; renderCode(); updateProgress(); if (resultsPanel) resultsPanel.style.display = 'none'; clearSavedProgress(); if (inputEl) inputEl.focus();
    });
    if (exportBtn) exportBtn.addEventListener('click', () => {
      try{
        const payload = { state, cursor, started, startedAt, code: CODE, exportedAt: Date.now() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'typing_session.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }catch(e){ }
    });
    if (closeResBtn) closeResBtn.addEventListener('click', () => { if (resultsPanel) resultsPanel.style.display = 'none'; });

    if (startBtn){
      startBtn.addEventListener('click', () => {
        for (let i = 0; i < state.length; i++){ state[i].entered = false; state[i].correct = null; }
        cursor = 0; started = false; startedAt = null; stopTimer(); if (timerEl) timerEl.textContent = '00:00'; renderCode(); updateProgress(); if (hintEl) hintEl.textContent = 'Подсказка: начните печатать. Используйте пробел, Tab(4 пробела) и Enter как в коде.'; window.focus();
      });
    }

    if (resetBtn){
      resetBtn.addEventListener('click', () => {
        for (let i = 0; i < state.length; i++){
          state[i].entered = false;
          state[i].correct = null;
          state[i].fixed = false;
        }
        cursor = 0;
        maxCursorPos = 0;
        window.maxCursorPos = 0;
        started = false;
        startedAt = null;
        stopTimer();
        if (timerEl) timerEl.textContent = '00:00';
        renderCode(); updateProgress();
        if (hintEl) hintEl.textContent = 'Прогресс сброшен. Можно начать заново.';
      });
    }

    // Попытка загрузить сохранённого прогресса, затем инициализация UI
    loadProgress();
    renderCode(); updateProgress();

    // Добавляем небольшую API для получения статистики
    return {
      computeCPM: (charsTyped, elapsedMs) => computeCPM(charsTyped, elapsedMs),
      computeAccuracy: (st) => computeAccuracy(st),
      state, chars
    };
  }

  exports.normalizeDisplay = normalizeDisplay;
  exports.normalizedTargetForCompare = normalizedTargetForCompare;
  exports.isMatch = isMatch;
  exports.computeCPM = computeCPM;
  exports.computeAccuracy = computeAccuracy;
  exports.initTrainer = initTrainer;

  // UMD export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  } else {
    window.Trainer = exports;
  }

})(typeof exports === 'undefined' ? {} : exports);
