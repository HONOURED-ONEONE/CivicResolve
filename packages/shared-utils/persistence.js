const fs = require('fs');
const path = require('path');

class JSONStore {
  constructor(namespace) {
    this.namespace = namespace;
    this.isTest = process.env.NODE_ENV === 'test';
    
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
      console.warn(`[${namespace}] Postgres URL detected but pg driver omitted for pragmatic MVP. Falling back to file/memory.`);
    }

    this.fileDir = process.env.STORAGE_DIR || path.join(process.cwd(), '.data');
    this.filePath = path.join(this.fileDir, `${this.namespace}.json`);
    
    if (this.isTest && !process.env.STORAGE_DIR) {
      this.data = {};
    } else {
      this._load();
    }
  }

  _load() {
    if (!fs.existsSync(this.fileDir)) {
      fs.mkdirSync(this.fileDir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      } catch (e) {
        this.data = {};
      }
    } else {
      this.data = {};
    }
  }

  _save() {
    if (this.isTest && !process.env.STORAGE_DIR) return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }

  get(key) {
    return this.data[key];
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  push(listKey, item) {
    if (!this.data[listKey] || !Array.isArray(this.data[listKey])) {
      this.data[listKey] = [];
    }
    this.data[listKey].push(item);
    this._save();
  }

  getList(listKey) {
    return this.data[listKey] || [];
  }
  
  clear() {
    this.data = {};
    this._save();
  }
}

module.exports = { JSONStore };
