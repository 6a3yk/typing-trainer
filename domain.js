export class Task {
  constructor(typeId, code, options = {}) {
    const {
      subtypeId = "1",
      variantId = "1",
      title = "",
      description = "",
      tags = [],
      level = null,
    } = options;

    if (!typeId) throw new Error("Task: typeId is required");
    if (!code) throw new Error("Task: code is required");

    this.typeId = String(typeId);
    this.subtypeId = String(subtypeId);
    this.variantId = String(variantId);

    // стабильный id под будущее с вариациями
    this.id = `${this.typeId}:${this.subtypeId}:${this.variantId}`;

    this.title = title;
    this.code = code;

    this.description = description;
    this.tags = tags;
    this.level = level;
  }

  /**
   * Удобно для UI / логов
   */
  getMeta() {
    return {
      id: this.id,
      typeId: this.typeId,
      subtypeId: this.subtypeId,
      variantId: this.variantId,
      title: this.title,
      level: this.level,
      tags: this.tags,
    };
  }
}