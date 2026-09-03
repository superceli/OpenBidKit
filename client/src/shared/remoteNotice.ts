const RELEASE_API_URL = 'https://api.atomgit.com/api/v5/repos/qq_45963071/OpenBidKit/releases/latest';
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
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.info(LOG_PREFIX, 'request failed', response.status);
    return null;
  }

  const data = await response.json().catch(() => null) as AtomGitRelease | null;
  console.info(LOG_PREFIX, 'response', data);
  if (!data) {
    console.info(LOG_PREFIX, 'invalid response');
    return null;
  }

  const notice = normalizeNotice(data);
  console.info(LOG_PREFIX, 'normalized notice', notice?.id || null);
  return notice;
}
