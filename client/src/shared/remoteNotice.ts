const RELEASE_LIST_API_URL = 'https://api.atomgit.com/api/v5/repos/qq_45963071/OpenBidKit/releases?per_page=10';
const YIBIAO_RELEASE_TAG_PREFIX = 'lvsebaogao-v';
const DISMISSED_NOTICE_ID_KEY = 'remote_notice_dismissed_id';
const LOG_PREFIX = '[remote-notice]';

export interface RemoteNotice {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface AtomGitRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  created_at?: string;
  release_status?: string;
}

// 比较两个版本号字符串的大小（去掉前缀后比）。
function compareVersionNumbers(a: string, b: string): number {
  const partsA = a.replace(/^lvsebaogao-v/i, '').split('.').map((p) => Number(p) || 0);
  const partsB = b.replace(/^lvsebaogao-v/i, '').split('.').map((p) => Number(p) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i += 1) {
    const na = partsA[i] || 0;
    const nb = partsB[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// 从 AtomGit release 列表中挑出绿色报告（tag 以 'lvsebaogao-v' 开头且非预发布）中版本号最大的一条。
function pickLatestYibiaoRelease(releases: AtomGitRelease[]): AtomGitRelease | null {
  if (!Array.isArray(releases)) return null;
  const candidates = releases.filter((release) => {
    const tagName = String(release?.tag_name || '');
    if (!tagName.startsWith(YIBIAO_RELEASE_TAG_PREFIX)) return false;
    if (release?.release_status === 'pre') return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) => {
    return compareVersionNumbers(String(current?.tag_name || ''), String(latest?.tag_name || '')) > 0
      ? current
      : latest;
  });
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function readDismissedNoticeId() {
  try {
    return localStorage.getItem(DISMISSED_NOTICE_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function hasDismissedRemoteNotice(noticeId: string) {
  return Boolean(noticeId) && readDismissedNoticeId() === noticeId;
}

export function dismissRemoteNotice(noticeId: string) {
  if (!noticeId) return;

  try {
    localStorage.setItem(DISMISSED_NOTICE_ID_KEY, noticeId);
  } catch {
    // 公告关闭记录失败不影响主流程；下次轮询可能再次显示同一公告。
  }
}

function normalizeNotice(release: AtomGitRelease | null | undefined): RemoteNotice | null {
  if (!release?.tag_name || !release.body) {
    return null;
  }

  const tag = String(release.tag_name);
  return {
    id: tag,
    title: String(release.name || tag),
    content: String(release.body),
    createdAt: formatTime(String(release.created_at || '')),
    updatedAt: formatTime(String(release.created_at || '')),
  };
}

export async function fetchRemoteNotice() {
  const response = await fetch(RELEASE_LIST_API_URL, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.info(LOG_PREFIX, 'request failed', response.status);
    return null;
  }

  const list = await response.json().catch(() => null) as AtomGitRelease[] | null;
  console.info(LOG_PREFIX, 'response count', Array.isArray(list) ? list.length : 0);
  if (!Array.isArray(list)) {
    console.info(LOG_PREFIX, 'invalid response');
    return null;
  }

  const release = pickLatestYibiaoRelease(list);
  console.info(LOG_PREFIX, 'matched release', release?.tag_name || null);
  const notice = normalizeNotice(release);
  console.info(LOG_PREFIX, 'normalized notice', notice?.id || null);
  return notice;
}
