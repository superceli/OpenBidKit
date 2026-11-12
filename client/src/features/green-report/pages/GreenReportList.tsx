import type { GreenReportSummary } from '../types';
import { GREEN_STEP_LABELS } from '../types';
import { resolveReportTypeName } from '../reportTypes';

interface GreenReportListProps {
  reports: GreenReportSummary[];
  loading: boolean;
  exportingId: string;
  generatingId: string;
  onCreate: () => void;
  onOpen: (reportId: string) => void;
  onDelete: (report: GreenReportSummary) => void;
  onCancel: (report: GreenReportSummary) => void;
  onExportWord: (report: GreenReportSummary) => void;
  onGenerateContent: (report: GreenReportSummary) => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '待生成',
  queued: '排队中',
  running: '生成中',
  success: '已完成',
  error: '生成失败',
  cancelled: '已取消',
};

function formatUpdatedAt(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function GreenReportList({
  reports,
  loading,
  exportingId,
  generatingId,
  onCreate,
  onOpen,
  onDelete,
  onCancel,
  onExportWord,
  onGenerateContent,
}: GreenReportListProps) {
  return (
    <div className="green-report-list">
      <div className="green-report-list-head">
        <div>
          <h2 className="green-report-list-title">绿色报告</h2>
          <p className="green-report-list-subtitle">报告生成在后台进行，可随时新建下一份，进度会实时更新。</p>
        </div>
        <button type="button" className="primary-action" onClick={onCreate}>新建报告</button>
      </div>

      {loading ? (
        <div className="green-report-list-empty">正在读取报告列表...</div>
      ) : reports.length === 0 ? (
        <div className="green-report-list-empty">
          <strong>还没有报告</strong>
          <p>点击“新建报告”开始录入企业信息。</p>
        </div>
      ) : (
        <div className="green-report-list-grid">
          {reports.map((report) => {
            const statusLabel = STATUS_LABELS[report.status] || report.status;
            const running = report.status === 'running' || report.status === 'queued';
            return (
              <article className={`green-report-list-card is-${report.status}`} key={report.id}>
                <div className="green-report-list-card-head">
                  <strong title={report.companyName}>{report.companyName || '未填写委托单位'}</strong>
                  <span className={`green-report-list-status is-${report.status}`}>{statusLabel}</span>
                </div>
                <div className="green-report-list-meta">
                  <span>{resolveReportTypeName(report.reportType) || '绿色报告'}</span>
                  <span>{GREEN_STEP_LABELS[report.step] || report.step}</span>
                  <span>{formatUpdatedAt(report.updatedAt)}</span>
                </div>
                {running && (
                  <div className="green-report-list-progress">
                    <div className="green-report-list-progress-bar">
                      <span style={{ width: `${Math.max(2, Math.min(100, report.progress || 0))}%` }} />
                    </div>
                    <small>{report.progress || 0}%</small>
                  </div>
                )}
                <div className="green-report-list-actions">
                  <button type="button" className="green-report-list-action is-primary" onClick={() => onOpen(report.id)}>
                    打开
                  </button>
                  {report.hasOutline && !running && (
                    <button
                      type="button"
                      className="green-report-list-action"
                      disabled={generatingId === report.id}
                      onClick={() => onGenerateContent(report)}
                    >
                      {generatingId === report.id ? '提交中...' : '生成正文'}
                    </button>
                  )}
                  {running && (
                    <button type="button" className="green-report-list-action" onClick={() => onCancel(report)}>
                      取消生成
                    </button>
                  )}
                  <button
                    type="button"
                    className="green-report-list-action"
                    disabled={exportingId === report.id || report.status !== 'success'}
                    onClick={() => onExportWord(report)}
                  >
                    {exportingId === report.id ? '导出中...' : '导出 Word'}
                  </button>
                  <button type="button" className="green-report-list-action is-danger" onClick={() => onDelete(report)}>
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GreenReportList;
