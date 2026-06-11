import { getSubtypeTitle, makeTaskTitle } from "./catalog.js";

const PYTHON_FILES = [
  "11-1-1.py",
  "11-2-1.py",
  "13-1-1.py",
  "13-2-1.py",
  "14-1-1.py",
  "14-3-1.py",
  "15-3-1.py",
  "15-4-1.py",
  "16-1-1.py",
  "16-1-2.py",
  "17-1-1.py",
  "17-2-1.py",
  "19-1-1.py",
  "19-2-1.py",
  "2-1-1.py",
  "2-1-2.py",
  "23-4-1.py",
  "23-4-2.py",
  "24-2-1.py",
  "24-3-1.py",
  "25-1-1.py",
  "25-3-1.py",
  "26-1-1.py",
  "26-2-1.py",
  "27-1-1.py",
  "5-1-1.py",
  "5-2-1.py",
  "6-1-1.py",
  "6-2-1.py",
  "8-1-1.py",
  "8-2-1.py",
  "9-1-1.py",
  "9-2-1.py"
];

function parseTaskFileName(file) {
  const [typeId, subtypeId, variantWithExtension] = file.split("-");
  return {
    typeId,
    subtypeId,
    variantId: variantWithExtension.replace(".py", "")
  };
}

export class Task {
  constructor(file, code) {
    const { typeId, subtypeId, variantId } = parseTaskFileName(file);
    const subtypeTitle = getSubtypeTitle(typeId, subtypeId, { showDefault: true });

    this.id = file.replace(".py", "");
    this.file = file;
    this.exam = Number(typeId);
    this.variant = Number(subtypeId);
    this.level = Number(variantId);
    this.typeId = String(typeId);
    this.subtypeId = String(subtypeId);
    this.variantId = String(variantId);
    this.title = makeTaskTitle(this.typeId);
    this.subtypeTitle = subtypeTitle;
    this.code = normalizePythonIndentation(sanitizeLoadedCode(code));
  }
}

function sanitizeLoadedCode(code) {
  return code
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function normalizePythonIndentation(code) {
  return code
    .split("\n")
    .map((line) => {
      const match = line.match(/^( +)/);
      if (!match) {
        return line;
      }

      const leadingSpaces = match[1].length;
      const tabsCount = Math.floor(leadingSpaces / 4);
      const restSpaces = leadingSpaces % 4;
      return `${"\t".repeat(tabsCount)}${" ".repeat(restSpaces)}${line.slice(leadingSpaces)}`;
    })
    .join("\n");
}

function compareTasks(left, right) {
  return left.exam - right.exam || left.variant - right.variant || left.level - right.level;
}

export async function loadTasks(onProgress = () => {}) {
  const total = PYTHON_FILES.length;
  let loaded = 0;

  onProgress({ loaded, total, progress: total > 0 ? 0 : 1 });

  const requests = PYTHON_FILES.map(async (file) => {
    const response = await fetch(`./progs/${file}`);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить ${file}`);
    }

    const task = new Task(file, await response.text());
    loaded += 1;
    onProgress({ loaded, total, progress: loaded / total, file });
    return task;
  });

  const tasks = await Promise.all(requests);
  tasks.sort(compareTasks);
  return tasks;
}
