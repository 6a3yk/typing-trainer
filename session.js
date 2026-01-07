export class Symbol {
    constructor(expected, index) {
        this.expected = expected;
        this.index = index;

        this.entered = false;
        this.correct = null; // true / false / null
        this.fixed = false;
        this.typed = null;

        this.isWhitespace =
            expected === " " || expected === "\n" || expected === "\t";
    }

    input(char, prevcorrect) {
        this.entered = true;
        this.typed = char;
        this.correct = char === this.expected && prevcorrect;
    }

    backspace() {

        // по твоей логике: любое стирание = fixed
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

    getState() {
        if (!this.entered) return "pending";
        if (this.correct === true) return "correct";
        return "wrong";
    }
}

/**
 * ЧИСТАЯ функция рендера (без состояния внутри Symbol)
 */
export function renderSymbol(symbol, cursor) {
    const active = cursor === symbol.index;
    const expected = symbol.expected;

    // newline
    if (expected === "\n") {
        if (active) return "↵";
        if (!symbol.entered) return "";
        if (symbol.correct === true) return "\u00A0";
        if (symbol.typed === "\n") return "\u00A0";
        return symbol.typed ?? "";
    }

    // tab
    if (expected === "\t") {
        if (!symbol.entered) return "    ";
        if (symbol.correct === true || symbol.typed === "\n") return "    ";
        return symbol.typed + "   ";
    }

    // обычные символы
    if (!symbol.entered) return expected;
    if (symbol.correct === true) return expected;
    if (symbol.typed === "\n" || symbol.typed === "\t") return "\u00A0"
    return symbol.typed ?? "";
}

export class TaskSession {
    constructor(task) {
        if (!task) throw new Error("TaskSession: task is required");

        this.task = task;
        this.symbols = this._buildSymbols(task.code);
        this.cursor = 0;    //положение курсора

        this.duration = 0;   //время, потраченное до "загрузки"
        this.startedAt = null; //время начала текущей сессии
        this.endedAt = null;   //время конца текущей сессии


        this.active = false; //задание активно
        this.finished = false; //задание завершено (всё было выполнено верно)
        this.atEnd = false;    //курсор в конце
    }

    _buildSymbols(code) {
        return Array.from(code).map((ch, i) => new Symbol(ch, i));
    }

    start() {
        if (!this.active && this.startedAt === null) {
            this.active = true;
            this.startedAt = Date.now();
        }
    }

    updateState() {
        const n = this.symbols.length;
        this.atEnd = this.cursor >= n
        // пустое задание - сразу завершённое
        if (n === 0) {
            this.startedAt = null
            this.endedAt = null
            this.duration = 0
            this.finishThis()
            return;
        }

        //ранее завершённое - это конец!
        if (this.finished) {
            this.finishThis()
            return;
        }

        //сейчас завершённое - замеряем время
        if (this.atEnd && this.isPassed()) {
            this.endedAt = Date.now();
            this.finishThis()
            return;
        }

        //дошли до конца, но задание не завершено (верно) - но вводить уже нельзя
        if (this.atEnd) {
            this.cursor = n;
            return;
        }

    }

    input(char) {
        this.updateState();

        if (this.finished) return;
        if (this.atEnd) return;
        this.start();
        const s = this.symbols[this.cursor];
        const prevcorrect = (this.symbols[this.cursor - 1]) ? this.symbols[this.cursor - 1].correct : true;

        s.input(char, prevcorrect);
        this.cursor += 1;
        this.updateState()
    }

    finishThis() {
        this.finished = true;
        this.active = false;
        this.atEnd = true;
        this.cursor = this.symbols.length;
    }

    backspace() {
        this.updateState()
        if (this.cursor <= 0) return;
        if (this.finished) return;
        this.start();

        // если курсор был "за концом" (n), сначала возвращаемся на последний символ
        const n = this.symbols.length
        if (this.atEnd) {
            this.cursor = n;
        }

        this.cursor -= 1;
        this.symbols[this.cursor].backspace();
        this.updateState()
    }

    isPassed() {
        for (const s of this.symbols) {
            if (s.correct !== true || s.entered !== true) return false;
        }
        return true;
    }


    reset() {
        this.symbols.forEach((s) => s.reset());
        this.cursor = 0;

        this.duration = 0;   //время, потраченное до "загрузки"
        this.startedAt = null; //время начала текущей сессии
        this.endedAt = null;   //время конца текущей сессии


        this.active = false; //задание активно
        this.finished = false; //задание завершено (всё было выполнено верно)
        this.atEnd = false;    //курсор в конце
    }

    /**
     * Готовая модель для UI
     */
    getRenderArray() {
        return this.symbols.map((s) => renderSymbol(s, this.cursor));
    }

    /**
     * Для статистики / сохранения
     */
    getStats() {
        let correctNotFixed = 0;
        let entered = 0;
        let correct = 0;
        for (const s of this.symbols) {
            if (s.correct === true && s.fixed === false) correctNotFixed++;
            if (s.entered) entered++;
            if (s.correct === true) correct++;
        }
        // прогресс entered/total. CPM - correct. Acc - correctNotFixed/entered.
        const timeMs = this.getMs(); // как ты хочешь
        const minutes = Math.max(timeMs / 60000, 3 / 60);
        const cpm = Math.round(correct / minutes);

        const wrong = entered - correct
        console.log(entered, correctNotFixed)
        // “строгая” точность: штраф за исправленные
        const accuracy = entered > 0 ? (correctNotFixed / entered) : 1;
        return {
            total: this.symbols.length, // всего
            correct, //введено верно
            entered,  // введено всего
            correctNotFixed,    // верно (не было ошибок)
            wrong, //ошибки
            cpm,
            accuracy,

            finished: this.finished,     //выполнено
            cursor: this.cursor,        //положение курсора
            timeMs
        };
    }
    getMs() {
        let ms = 0;
        if (this.finished && this.endedAt && this.startedAt) {
            ms = this.duration + this.endedAt - this.startedAt;
        } else if (this.active && this.startedAt) {
            ms = this.duration + Date.now() - this.startedAt;
        } else if (this.duration) {
            ms = this.duration;
        } else {
            ms = 0;
        }
        return ms;
    }

    /**
     * Сериализация (для localStorage)
     */
    toJSON() {
        return {
            taskId: this.task.id,
            cursor: this.cursor,
            duration: this.getMs(),

            finished: this.finished,
            active: this.active,
            atEnd: this.atEnd,

            symbols: this.symbols.map((s) => ({
                entered: s.entered,
                correct: s.correct,
                fixed: s.fixed,
                typed: s.typed,
            })),
        };
    }

    /**
     * Восстановление состояния
     */
    static fromJSON(task, data) {
        const session = new TaskSession(task);

        session.cursor = data.cursor ?? 0;
        session.finished = data.finished ?? false;
        session.duration = data.duration ?? 0;   //время, потраченное до "загрузки"

        session.active = false; //задание активно
        session.finished = data.finished ?? false; //задание завершено (всё было выполнено верно)
        session.atEnd = data.atEnd ?? false;    //курсор в конце

        data.symbols?.forEach((sd, i) => {
            const s = session.symbols[i];
            if (!s) return;

            s.entered = sd.entered;
            s.correct = sd.correct;
            s.fixed = sd.fixed;
            s.typed = sd.typed;
        });
        session.updateState()
        return session;
    }
    // session.js
    getView() {
        return {
            cursor: this.cursor,
            symbols: this.symbols.map(s => ({
                expected: s.expected,
                typed: s.typed,
                entered: s.entered,
                correct: s.correct,
                fixed: s.fixed,
                isNewline: s.expected === "\n",
                isTab: s.expected === "\t",
            })),
            stats: this.getStats(),
        };
    }
}