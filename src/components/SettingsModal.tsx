import { useEffect, useState } from 'react';
import { CloseIcon, EyeIcon, EyeOffIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onSessionIdChange: (id: string) => void;
  authMode: 'single' | 'pool';
  onAuthModeChange: (mode: 'single' | 'pool') => void;
}

const LS_SESSION_KEY = 'seedance_session_id';
const LS_AUTH_MODE_KEY = 'seedance_auth_mode';
const LS_ADMIN_KEY = 'seedance_admin_key';

type PoolItem = {
  id: string;
  remark: string;
  isActive: boolean;
  cooledUntil: number;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  errorCount: number;
  sessionIdMasked: string;
};

type PoolSnapshot = {
  enabled: boolean;
  file: string;
  total: number;
  active: number;
  cooled: number;
  cursor: number;
  items: PoolItem[];
};

export function loadSettings() {
  return {
    sessionId: localStorage.getItem(LS_SESSION_KEY) || '',
    authMode:
      (localStorage.getItem(LS_AUTH_MODE_KEY) as 'single' | 'pool' | null) ||
      'single',
    adminKey: localStorage.getItem(LS_ADMIN_KEY) || '',
  };
}

export default function SettingsModal({
  isOpen,
  onClose,
  sessionId,
  onSessionIdChange,
  authMode,
  onAuthModeChange,
}: SettingsModalProps) {
  const [localSessionId, setLocalSessionId] = useState(sessionId);
  const [showSessionId, setShowSessionId] = useState(false);

  // Pool admin key (only for managing pool)
  const [adminKey, setAdminKey] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);

  const [pool, setPool] = useState<PoolSnapshot | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

  const [newSid, setNewSid] = useState('');
  const [newRemark, setNewRemark] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importRemark, setImportRemark] = useState('');

  useEffect(() => {
    setLocalSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadSettings();
    setAdminKey(saved.adminKey || '');
  }, [isOpen]);

  if (!isOpen) return null;

  const canUsePoolMode = true;

  const formatTime = (ts: number) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const formatCooldown = (cooledUntil: number) => {
    if (!cooledUntil) return '-';
    const left = cooledUntil - Date.now();
    if (left <= 0) return '已解除';
    const sec = Math.ceil(left / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `冷却中 ${m}m${s}s`;
  };

  async function poolFetch(url: string, init?: RequestInit) {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${adminKey}`,
    };
    return fetch(url, { ...init, headers });
  }

  const refreshPool = async () => {
    setPoolLoading(true);
    setPoolError(null);
    try {
      const res = await poolFetch('/api/pool');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPool(data as PoolSnapshot);
    } catch (e) {
      setPool(null);
      setPoolError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setPoolLoading(false);
    }
  };

  const handleSave = () => {
    // Persist auth mode & admin key
    localStorage.setItem(LS_AUTH_MODE_KEY, authMode);
    localStorage.setItem(LS_ADMIN_KEY, adminKey);

    if (authMode === 'single') {
      onSessionIdChange(localSessionId);
      localStorage.setItem(LS_SESSION_KEY, localSessionId);
    } else {
      // Pool mode: do NOT send sessionId. Backend will acquire from server-side pool.
      onSessionIdChange('');
      localStorage.setItem(LS_SESSION_KEY, '');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1c1f2e] border border-gray-800 rounded-3xl p-6 max-w-3xl w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg text-gray-200 font-medium">设置</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-800 transition-colors">
            <CloseIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Auth Mode */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">认证方式</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onAuthModeChange('single')}
                className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                  authMode === 'single'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                    : 'bg-[#161824] border-gray-700 text-gray-300 hover:bg-[#1c2030]'
                }`}
              >
                单账号 SessionID
              </button>
              <button
                onClick={() => canUsePoolMode && onAuthModeChange('pool')}
                className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                  authMode === 'pool'
                    ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                    : 'bg-[#161824] border-gray-700 text-gray-300 hover:bg-[#1c2030]'
                }`}
              >
                账号池（服务端轮换）
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              账号池模式下，前端不会发送 sessionid，后端会从账号池自动选择可用账号。
            </p>
          </div>

          {/* Single */}
          {authMode === 'single' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Session ID</label>
              <div className="relative">
                <input
                  type={showSessionId ? 'text' : 'password'}
                  value={localSessionId}
                  onChange={(e) => setLocalSessionId(e.target.value)}
                  placeholder="输入即梦 sessionid"
                  className="w-full bg-[#161824] border border-gray-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={() => setShowSessionId(!showSessionId)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                >
                  {showSessionId ? (
                    <EyeOffIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                从 jimeng.jianying.com 的 Cookie 中获取 sessionid
              </p>
            </div>
          )}

          {/* Pool */}
          {authMode === 'pool' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-gray-800 bg-[#161824] p-4">
                <div className="flex items-center justify-between mb-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-200">账号池管理</div>
                    <div className="text-xs text-gray-500">
                      需要 AdminKey 才能查看/管理账号池（仅脱敏显示）。
                    </div>
                  </div>
                  <button
                    onClick={refreshPool}
                    disabled={poolLoading || !adminKey}
                    className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-gray-200 text-sm transition-colors"
                  >
                    {poolLoading ? '加载中…' : '刷新'}
                  </button>
                </div>

                <label className="block text-sm text-gray-400 mb-1.5">AdminKey</label>
                <div className="relative">
                  <input
                    type={showAdminKey ? 'text' : 'password'}
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    placeholder="粘贴 SEEDANCE_ADMIN_KEY（用于管理账号池）"
                    className="w-full bg-[#0f1220] border border-gray-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-cyan-400 transition-colors"
                  />
                  <button
                    onClick={() => setShowAdminKey(!showAdminKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                  >
                    {showAdminKey ? (
                      <EyeOffIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {poolError && (
                  <div className="mt-2 text-xs text-red-300">{poolError}</div>
                )}

                {pool && (
                  <div className="mt-3 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Enabled: {String(pool.enabled)}</span>
                    <span>Total: {pool.total}</span>
                    <span>Active: {pool.active}</span>
                    <span>Cooled: {pool.cooled}</span>
                    <span className="truncate">File: {pool.file}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-800 bg-[#161824] p-4">
                  <div className="text-sm text-gray-200 mb-2">新增 sessionid</div>
                  <div className="space-y-2">
                    <input
                      value={newSid}
                      onChange={(e) => setNewSid(e.target.value)}
                      placeholder="sessionid（明文，仅提交给服务端存储）"
                      className="w-full bg-[#0f1220] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-cyan-400 transition-colors"
                    />
                    <input
                      value={newRemark}
                      onChange={(e) => setNewRemark(e.target.value)}
                      placeholder="备注（可选，例如：账号A/手机号后四位）"
                      className="w-full bg-[#0f1220] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-gray-500 transition-colors"
                    />
                    <button
                      onClick={async () => {
                        setPoolError(null);
                        try {
                          const res = await poolFetch('/api/pool/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sessionId: newSid, remark: newRemark }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                          setNewSid('');
                          setNewRemark('');
                          await refreshPool();
                        } catch (e) {
                          setPoolError(e instanceof Error ? e.message : '未知错误');
                        }
                      }}
                      disabled={!adminKey || !newSid.trim()}
                      className="w-full px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors"
                    >
                      新增
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-[#161824] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-200">批量导入/替换</div>
                    <button
                      onClick={() => setShowImport(!showImport)}
                      className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs"
                    >
                      {showImport ? '收起' : '展开'}
                    </button>
                  </div>

                  {showImport ? (
                    <div className="space-y-2">
                      <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder={'每行一个 sessionid\n（会覆盖现有账号池）'}
                        className="w-full min-h-28 bg-[#0f1220] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-cyan-400 transition-colors"
                      />
                      <input
                        value={importRemark}
                        onChange={(e) => setImportRemark(e.target.value)}
                        placeholder="统一备注前缀（可选）"
                        className="w-full bg-[#0f1220] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-gray-500 transition-colors"
                      />
                      <button
                        onClick={async () => {
                          setPoolError(null);
                          try {
                            const sessionIds = importText
                              .split(/\r?\n/)
                              .map((x) => x.trim())
                              .filter(Boolean);
                            const res = await poolFetch('/api/pool/replace', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ sessionIds, remark: importRemark }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                            setImportText('');
                            setImportRemark('');
                            await refreshPool();
                          } catch (e) {
                            setPoolError(e instanceof Error ? e.message : '未知错误');
                          }
                        }}
                        disabled={!adminKey || !importText.trim()}
                        className="w-full px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors"
                      >
                        覆盖导入（替换现有账号池）
                      </button>
                      <div className="text-xs text-gray-500">
                        注意：这是“替换”操作，提交后会覆盖原账号池。
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">展开后可一次性导入多条 sessionid。</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-[#161824] p-4 overflow-x-auto">
                <div className="text-sm text-gray-200 mb-3">账号池列表</div>

                {!pool ? (
                  <div className="text-xs text-gray-500">点击“刷新”加载列表。</div>
                ) : pool.items.length === 0 ? (
                  <div className="text-xs text-gray-500">账号池为空。</div>
                ) : (
                  <table className="w-full text-xs text-gray-300">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="text-left py-2 pr-3">备注</th>
                        <th className="text-left py-2 pr-3">SessionID</th>
                        <th className="text-left py-2 pr-3">启用</th>
                        <th className="text-left py-2 pr-3">冷却</th>
                        <th className="text-left py-2 pr-3">使用/错误</th>
                        <th className="text-left py-2 pr-3">最后使用</th>
                        <th className="text-right py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.items.map((it) => (
                        <tr key={it.id} className="border-t border-gray-800">
                          <td className="py-2 pr-3 max-w-48 truncate" title={it.remark || ''}>
                            {it.remark || '-'}
                          </td>
                          <td className="py-2 pr-3 font-mono text-gray-200">{it.sessionIdMasked}</td>
                          <td className="py-2 pr-3">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={it.isActive}
                                onChange={async (e) => {
                                  setPoolError(null);
                                  try {
                                    const res = await poolFetch('/api/pool/active', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: it.id, isActive: e.target.checked }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok)
                                      throw new Error(data?.error || `HTTP ${res.status}`);
                                    await refreshPool();
                                  } catch (err) {
                                    setPoolError(err instanceof Error ? err.message : '未知错误');
                                  }
                                }}
                              />
                              <span className="text-gray-400">{it.isActive ? '是' : '否'}</span>
                            </label>
                          </td>
                          <td className="py-2 pr-3 text-gray-400">{formatCooldown(it.cooledUntil)}</td>
                          <td className="py-2 pr-3 text-gray-400">{it.useCount}/{it.errorCount}</td>
                          <td className="py-2 pr-3 text-gray-500">{formatTime(it.lastUsedAt)}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={async () => {
                                if (!confirm('确定要删除该 sessionid 吗？')) return;
                                setPoolError(null);
                                try {
                                  const res = await poolFetch('/api/pool/remove', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: it.id }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok)
                                    throw new Error(data?.error || `HTTP ${res.status}`);
                                  await refreshPool();
                                } catch (err) {
                                  setPoolError(err instanceof Error ? err.message : '未知错误');
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#161824] border border-gray-700 text-gray-300 text-sm hover:bg-[#1c2030] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-purple-900/20"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
