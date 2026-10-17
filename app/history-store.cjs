const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_HISTORY_ENTRIES = 1000;

class HistoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.entries = null;
    this.pendingOperations = Promise.resolve();
  }

  load() {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      return this.entries.map((entry) => ({ ...entry }));
    });
  }

  addVisit(entry) {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      this.entries.unshift(entry);
      this.entries = this.entries.slice(0, MAX_HISTORY_ENTRIES);
      await this.persist();
    });
  }

  updateTitle(id, title) {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      const entry = this.entries.find((item) => item.id === id);
      if (!entry || entry.title === title) return;
      entry.title = title;
      await this.persist();
    });
  }

  clear() {
    return this.enqueue(async () => {
      await this.ensureLoaded();
      this.entries = [];
      await this.persist();
    });
  }

  enqueue(operation) {
    const result = this.pendingOperations.then(operation);
    this.pendingOperations = result.then(() => undefined, () => undefined);
    return result;
  }

  async ensureLoaded() {
    if (this.entries) return;
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const entries = JSON.parse(content);
      if (!Array.isArray(entries)) throw new Error('Le fichier d’historique doit contenir une liste.');
      this.entries = entries.map((entry) => {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.title !== 'string' ||
          typeof entry.visitedAt !== 'string' ||
          Number.isNaN(Date.parse(entry.visitedAt)) ||
          typeof entry.url !== 'string' ||
          !['http:', 'https:'].includes(new URL(entry.url).protocol)
        ) {
          throw new Error('Une entrée de l’historique est invalide.');
        }
        return entry;
      }).slice(0, MAX_HISTORY_ENTRIES);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.entries = [];
        return;
      }
      throw error;
    }
  }

  async persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.entries), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }
}

module.exports = { HistoryStore, MAX_HISTORY_ENTRIES };
