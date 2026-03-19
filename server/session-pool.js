import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

function nowMs() {
  return Date.now();
}

function safeParseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export default class SessionPool {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = {
      version: 1,
      cursor: 0,
      items: [], // { id, sessionId, remark, isActive, cooledUntil, createdAt, lastUsedAt, useCount, errorCount }
    };
    this._loaded = false;
    this._writePending = null;
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const txt = await fs.readFile(this.filePath, 'utf-8');
      const data = safeParseJson(txt, null);
      if (data && Array.isArray(data.items)) {
        this.state = {
          version: 1,
          cursor: Number.isFinite(data.cursor) ? data.cursor : 0,
          items: data.items.map((x) => ({
            id: x.id || crypto.randomUUID(),
            sessionId: x.sessionId || '',
            remark: x.remark || '',
            isActive: x.isActive !== false,
            cooledUntil: x.cooledUntil ? Number(x.cooledUntil) : 0,
            createdAt: x.createdAt ? Number(x.createdAt) : nowMs(),
            lastUsedAt: x.lastUsedAt ? Number(x.lastUsedAt) : 0,
            useCount: x.useCount ? Number(x.useCount) : 0,
            errorCount: x.errorCount ? Number(x.errorCount) : 0,
          })),
        };
      }
    } catch {
      // file not exist: ok
    }

    this._loaded = true;
    await this._flush();
  }

  _maskSessionId(sessionId) {
    if (!sessionId) return '';
    if (sessionId.length <= 10) return '***';
    return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
  }

  snapshot({ includeSecrets = false } = {}) {
    const items = this.state.items.map((x) => ({
      id: x.id,
      remark: x.remark,
      isActive: x.isActive,
      cooledUntil: x.cooledUntil || 0,
      createdAt: x.createdAt,
      lastUsedAt: x.lastUsedAt || 0,
      useCount: x.useCount || 0,
      errorCount: x.errorCount || 0,
      ...(includeSecrets
        ? { sessionId: x.sessionId }
        : { sessionIdMasked: this._maskSessionId(x.sessionId) }),
    }));

    const total = items.length;
    const active = items.filter((x) => x.isActive).length;
    const cooled = items.filter((x) => x.cooledUntil && x.cooledUntil > nowMs()).length;

    return { total, active, cooled, cursor: this.state.cursor, items };
  }

  async replaceAll({ sessionIds, remark = '' }) {
    if (!Array.isArray(sessionIds)) throw new Error('sessionIds must be an array');
    const uniq = Array.from(new Set(sessionIds.map((s) => String(s || '').trim()).filter(Boolean)));

    const ts = nowMs();
    this.state.items = uniq.map((sid, i) => ({
      id: crypto.randomUUID(),
      sessionId: sid,
      remark: remark ? `${remark}#${i + 1}` : `import#${i + 1}`,
      isActive: true,
      cooledUntil: 0,
      createdAt: ts,
      lastUsedAt: 0,
      useCount: 0,
      errorCount: 0,
    }));
    this.state.cursor = 0;
    await this._flush();
  }

  async add({ sessionId, remark = '' }) {
    const sid = String(sessionId || '').trim();
    if (!sid) throw new Error('sessionId is required');

    const exists = this.state.items.find((x) => x.sessionId === sid);
    if (exists) throw new Error('sessionId already exists in pool');

    this.state.items.push({
      id: crypto.randomUUID(),
      sessionId: sid,
      remark,
      isActive: true,
      cooledUntil: 0,
      createdAt: nowMs(),
      lastUsedAt: 0,
      useCount: 0,
      errorCount: 0,
    });
    await this._flush();
  }

  async setActive(id, isActive) {
    const item = this.state.items.find((x) => x.id === id);
    if (!item) throw new Error('not found');
    item.isActive = !!isActive;
    await this._flush();
  }

  async remove(id) {
    const before = this.state.items.length;
    this.state.items = this.state.items.filter((x) => x.id !== id);
    if (this.state.items.length === before) throw new Error('not found');
    this.state.cursor = 0;
    await this._flush();
  }

  async cooldown(id, ms, reason = '') {
    const item = this.state.items.find((x) => x.id === id);
    if (!item) return;
    item.cooledUntil = nowMs() + Math.max(0, Number(ms) || 0);
    item.errorCount = (item.errorCount || 0) + 1;
    if (reason) item.remark = item.remark ? `${item.remark} | ${reason}` : reason;
    await this._flush();
  }

  // Round-robin select an active, non-cooled session.
  acquire() {
    if (!this._loaded) throw new Error('pool not loaded');
    const items = this.state.items;
    if (!items.length) return null;

    const n = items.length;
    const start = ((this.state.cursor % n) + n) % n;

    for (let step = 0; step < n; step++) {
      const idx = (start + step) % n;
      const item = items[idx];
      if (!item.isActive) continue;
      if (item.cooledUntil && item.cooledUntil > nowMs()) continue;
      if (!item.sessionId) continue;

      this.state.cursor = idx + 1;
      item.lastUsedAt = nowMs();
      item.useCount = (item.useCount || 0) + 1;
      // fire-and-forget flush
      this._flushSoon();

      return { id: item.id, sessionId: item.sessionId, remark: item.remark };
    }

    return null;
  }

  _flushSoon() {
    if (this._writePending) return;
    this._writePending = setTimeout(() => {
      this._writePending = null;
      this._flush().catch(() => {});
    }, 300);
  }

  async _flush() {
    const tmp = `${this.filePath}.tmp`;
    const payload = JSON.stringify(this.state, null, 2);
    await fs.writeFile(tmp, payload, 'utf-8');
    await fs.rename(tmp, this.filePath);
  }
}
