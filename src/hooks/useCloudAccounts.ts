import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhigrosCloudSave, type PhigrosCloudData } from "../core/phigrosCloud";
import type { ChartRecord } from "../data/types";

const storageKey = "phitarget.cloud-accounts.v1";
const dataStorageKey = "phitarget.cloud-data.v1";

export type CloudAccount = {
  id: string;
  label: string;
  token: string;
  isGlobal: boolean;
};

type StoredCloudData = {
  data: PhigrosCloudData;
  savedAt: string;
};

type CloudDataCache = Record<string, StoredCloudData>;

export type CloudAccountsController = {
  accounts: CloudAccount[];
  activeAccountId: string | null;
  token: string;
  label: string;
  isGlobal: boolean;
  remember: boolean;
  loading: boolean;
  message: string;
  cachedData: PhigrosCloudData | null;
  cachedAt: string | null;
  setToken: (value: string) => void;
  setLabel: (value: string) => void;
  setIsGlobal: (value: boolean) => void;
  setRemember: (value: boolean) => void;
  selectAccount: (id: string) => void;
  removeAccount: (id: string) => void;
  connect: (charts: ChartRecord[]) => Promise<{ data: PhigrosCloudData; accountId: string | null } | null>;
};

const readAccounts = (): CloudAccount[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CloudAccount => Boolean(item && typeof item === "object" && typeof (item as CloudAccount).id === "string" && typeof (item as CloudAccount).token === "string" && typeof (item as CloudAccount).label === "string" && typeof (item as CloudAccount).isGlobal === "boolean")).slice(0, 8);
  } catch {
    return [];
  }
};

const readDataCache = (): CloudDataCache => {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(dataStorageKey) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cache: CloudDataCache = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([id, value]) => {
      if (!value || typeof value !== "object") return;
      const item = value as Partial<StoredCloudData>;
      if (!item.data || typeof item.data !== "object" || typeof item.savedAt !== "string") return;
      cache[id] = { data: item.data as PhigrosCloudData, savedAt: item.savedAt };
    });
    return cache;
  } catch {
    return {};
  }
};

const makeId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `account-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useCloudAccounts(): CloudAccountsController {
  const initialAccounts = useRef<CloudAccount[] | null>(null);
  if (!initialAccounts.current) initialAccounts.current = readAccounts();
  const initialAccount = initialAccounts.current[0] ?? null;
  const initialCache = useRef<CloudDataCache | null>(null);
  if (!initialCache.current) initialCache.current = readDataCache();
  const initialSnapshot = initialAccount ? initialCache.current[initialAccount.id] : undefined;
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => initialAccounts.current ?? []);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(initialAccount?.id ?? null);
  const [token, setToken] = useState(initialAccount?.token ?? "");
  const [label, setLabel] = useState(initialAccount?.label ?? "");
  const [isGlobal, setIsGlobal] = useState(initialAccount?.isGlobal ?? false);
  // Persisting is the useful default for a player-data page: a later visit
  // can restore the newest snapshot and account selector without another
  // network request. The checkbox still lets a public/shared device opt out.
  const [remember, setRememberState] = useState(true);
  const [cachedData, setCachedData] = useState<PhigrosCloudData | null>(initialSnapshot?.data ?? null);
  const [cachedAt, setCachedAt] = useState<string | null>(initialSnapshot?.savedAt ?? null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(accounts));
    } catch {
      // Private browsing or a blocked storage policy should not prevent a
      // one-session connection from working.
    }
  }, [accounts]);
  const saveDataCache = useCallback((id: string, data: PhigrosCloudData) => {
    const savedAt = new Date().toISOString();
    setCachedData(data);
    setCachedAt(savedAt);
    if (typeof window === "undefined") return;
    try {
      const cache = readDataCache();
      cache[id] = { data, savedAt };
      // Keep one latest snapshot per account. Old snapshots are overwritten,
      // so repeated synchronizations do not grow localStorage indefinitely.
      window.localStorage.setItem(dataStorageKey, JSON.stringify(cache));
    } catch {
      // Storage is optional; the in-memory copy still powers this session.
    }
  }, []);
  useEffect(() => () => controller.current?.abort(), []);

  const selectAccount = useCallback((id: string) => {
    controller.current?.abort();
    if (!id) {
      setActiveAccountId(null);
      setToken("");
      setLabel("");
      setIsGlobal(false);
      setRememberState(false);
      setMessage("");
      setCachedData(null);
      setCachedAt(null);
      return;
    }
    const account = accounts.find((item) => item.id === id);
    if (!account) return;
    setActiveAccountId(account.id);
    setToken(account.token);
    setLabel(account.label);
    setIsGlobal(account.isGlobal);
    setRemember(true);
    setMessage("");
    const snapshot = readDataCache()[account.id];
    setCachedData(snapshot?.data ?? null);
    setCachedAt(snapshot?.savedAt ?? null);
  }, [accounts]);

  const removeAccount = useCallback((id: string) => {
    controller.current?.abort();
    setAccounts((current) => current.filter((item) => item.id !== id));
    if (typeof window !== "undefined") {
      try {
        const cache = readDataCache();
        delete cache[id];
        window.localStorage.setItem(dataStorageKey, JSON.stringify(cache));
      } catch {
        // Ignore blocked storage.
      }
    }
    if (activeAccountId !== id) return;
    setActiveAccountId(null);
    setToken("");
    setLabel("");
    setIsGlobal(false);
    setRememberState(false);
    setCachedData(null);
    setCachedAt(null);
    setMessage("已移除本机保存的账号；该账号的本地成绩缓存也已清除。");
  }, [activeAccountId]);

  const setRemember = useCallback((value: boolean) => {
    setRememberState(value);
    if (value || !activeAccountId) return;
    const removedId = activeAccountId;
    setAccounts((current) => current.filter((item) => item.id !== removedId));
    setActiveAccountId(null);
    setCachedData(null);
    setCachedAt(null);
    if (typeof window !== "undefined") {
      try {
        const cache = readDataCache();
        delete cache[removedId];
        window.localStorage.setItem(dataStorageKey, JSON.stringify(cache));
      } catch {
        // Ignore blocked storage.
      }
    }
  }, [activeAccountId]);

  const connect = useCallback(async (charts: ChartRecord[]) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setMessage("");
    try {
      const data = await fetchPhigrosCloudSave(token, isGlobal, charts, nextController.signal);
      const nextLabel = label.trim() || data.profile.playerName || data.profile.playerId || `账号 ${accounts.length + 1}`;
      let nextAccountId = activeAccountId;
      if (remember) {
        nextAccountId = activeAccountId || makeId();
        setAccounts((current) => {
          const next: CloudAccount = { id: nextAccountId!, label: nextLabel, token: token.trim(), isGlobal };
          const index = current.findIndex((item) => item.id === next.id);
          if (index < 0) return [...current, next].slice(-8);
          return current.map((item, itemIndex) => itemIndex === index ? next : item);
        });
        setActiveAccountId(nextAccountId);
        setLabel(nextLabel);
        saveDataCache(nextAccountId, data);
      } else {
        setCachedData(data);
        setCachedAt(new Date().toISOString());
      }
      setMessage(`已读取 ${data.records.length} 条成绩；${remember ? "账号已保存到当前浏览器。" : "token 仅在本页内存中使用。"}`);
      return { data, accountId: nextAccountId };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      setMessage(error instanceof Error ? error.message : "获取 TapTap 云存档失败");
      return null;
    } finally {
      if (controller.current === nextController) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, [accounts.length, activeAccountId, isGlobal, label, remember, saveDataCache, token]);

  return { accounts, activeAccountId, token, label, isGlobal, remember, loading, message, cachedData, cachedAt, setToken, setLabel, setIsGlobal, setRemember, selectAccount, removeAccount, connect };
}

