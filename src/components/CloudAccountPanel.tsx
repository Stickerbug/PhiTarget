import type { ChartRecord } from "../data/types";
import type { PhigrosCloudData } from "../core/phigrosCloud";
import type { CloudAccountsController } from "../hooks/useCloudAccounts";

type Props = {
  charts: ChartRecord[];
  cloud: CloudAccountsController;
  onLoaded: (data: PhigrosCloudData) => void;
  onAccountChange?: () => void;
  compact?: boolean;
};

export default function CloudAccountPanel({ charts, cloud, onLoaded, onAccountChange, compact = false }: Props) {
  const connect = async () => {
    const result = await cloud.connect(charts);
    if (result) onLoaded(result.data);
  };
  const select = (id: string) => {
    onAccountChange?.();
    cloud.selectAccount(id);
  };
  return <div className={`cloud-account-panel ${compact ? "compact" : ""}`}>
    {cloud.accounts.length > 0 && <div className="cloud-account-row"><label>本机账号<select value={cloud.activeAccountId ?? ""} onChange={(event) => select(event.target.value)}><option value="">临时账号</option>{cloud.accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.isGlobal ? "国际服" : "国服"}</option>)}</select>{cloud.cachedAt && <small className="cloud-cache-time">最新数据保存于 {new Date(cloud.cachedAt).toLocaleString()}</small>}</label>{cloud.activeAccountId && <button type="button" className="account-remove" onClick={() => { onAccountChange?.(); cloud.removeAccount(cloud.activeAccountId!); }}>移除保存</button>}</div>}
    <div className="cloud-account-fields"><label>账号名称（可选）<input value={cloud.label} onChange={(event) => cloud.setLabel(event.target.value)} placeholder="例如 Stickerbug" /></label><label>sessionToken<input type="password" autoComplete="off" spellCheck={false} value={cloud.token} onChange={(event) => cloud.setToken(event.target.value)} placeholder="24 或 25 位字母数字字符串" /></label><label>服务器<select value={cloud.isGlobal ? "global" : "cn"} onChange={(event) => cloud.setIsGlobal(event.target.value === "global")}><option value="cn">国服</option><option value="global">国际服</option></select></label><button type="button" className="primary-action" disabled={cloud.loading || !cloud.token.trim()} onClick={() => void connect()}>{cloud.loading ? "读取中…" : "读取云档"}</button></div>
    <label className="cloud-account-remember"><input type="checkbox" checked={cloud.remember} onChange={(event) => cloud.setRemember(event.target.checked)} /><span>在本机保存这个账号，方便下次切换</span><small>会把 token 保存到当前浏览器 localStorage；公共设备请关闭。</small></label>
    {cloud.message && <p className="profile-message">{cloud.message}</p>}
  </div>;
}

