import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhigrosCloudSave, type PhigrosCloudData } from "../core/phigrosCloud";
import type { ChartRecord } from "../data/types";

const storageKey = "phitarget.cloud-accounts.v1";

export type CloudAccount = {
  id: string;
  label: string;
  token: string;
  isGlobal: boolean;
};

export type CloudAccountsController = {
  accounts: CloudAccount[];
  activeAccountId: string | null;
  token: string;
  label: string;
  isGlobal: boolean;
  remember: boolean;
  loading: boolean;
  message: string;
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

const makeId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `account-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useCloudAccounts(): CloudAccountsController {
  const [accounts, setAccounts] = useState<CloudAccount[]>(readAccounts);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [remember, setRememberState] = useState(false);
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
  useEffect(() => () => controller.current?.abort(), []);

  const selectAccount = useCallback((id: string) => {
    controller.current?.abort();
    if (!id) {
      setActiveAccountId(null);
      setToken("");
      setLabel("");
      setIsGlobal(false);
      setRemember(false);
      setMessage("");
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
  }, [accounts]);

  const removeAccount = useCallback((id: string) => {
    controller.current?.abort();
    setAccounts((current) => current.filter((item) => item.id !== id));
    if (activeAccountId !== id) return;
    setActiveAccountId(null);
    setToken("");
    setLabel("");
    setIsGlobal(false);
    setRemember(false);
    setMessage("已移除本机保存的账号；云档成绩仍只保留在当前页面内存中。");
  }, [activeAccountId]);

  const setRemember = useCallback((value: boolean) => {
    setRememberState(value);
    if (value || !activeAccountId) return;
    setAccounts((current) => current.filter((item) => item.id !== activeAccountId));
    setActiveAccountId(null);
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
  }, [accounts.length, activeAccountId, isGlobal, label, remember, token]);

  return { accounts, activeAccountId, token, label, isGlobal, remember, loading, message, setToken, setLabel, setIsGlobal, setRemember, selectAccount, removeAccount, connect };
}

