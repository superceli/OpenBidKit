import { useState } from 'react';
import { MarkdownRenderer, ProgressBar, useToast } from '../../../shared/ui';
import type { OutlineItem } from '../../../shared/types';
import type { GreenReportState } from '../types';
import { collectGreenLeaves } from '../types';

interface ContentPageProps {
  state: GreenReportState;
  onGenerate: () => Promise<void>;
  onSaveChapter: (nodeId: string, content: string) => Promise<void>;
  onContentRequirementsChange: (requirements: string) => void;
  wordExportProgress: {
    running: boolean;
    progress: number;
    message: string;
    error: string;
    filePath: string;
  };
  onExportWord: () => Promise<void>;
}

function ContentPage({
  state,
  onGenerate,
  onSaveChapter,
  onContentRequirementsChange,
  wordExportProgress,
  onExportWord,
}: ContentPageProps) {
  const { showToast } = useToast();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const outline = state.outlineData?.outline ?? [];
  const leaves = collectGreenLeaves(outline);
  const contentTaskRunning = state.contentTask?.status === 'running';
  const selectedNode = leaves.find((l) => l.id === selectedNodeId) ?? null;

  const handleGenerate = async () => {
    if (leaves.length === 0) {
      showToast('请先生成目录', 'error');
      return;
    }
    try {
      await onGenerate();
      showToast('正文生成任务已启动', 'info');
    } finally {
      /* 忽略 */
    }
  };

  const handleStartEdit = (item: OutlineItem) => {
    setDraft(item.content || '');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedNode) return;
    await onSaveChapter(selectedNode.id, draft);
    setEditing(false);
    showToast('正文已保存', 'success');
  };

  const generatedCount = leaves.filter((l) => l.content && l.content.trim()).length;
  const hasContent = leaves.length > 0 && generatedCount > 0;

  return (
    <div className="green-report-section" style={{ height: '100%' }}>
      {wordExportProgress.running && (
        <div className="green-report-progress-stack">
          <ProgressBar
            value={wordExportProgress.progress}
            label={`Word: ${wordExportProgress.message}`}
          />
        </div>
      )}

      <div className="green-report-content-split">
        <div className="green-report-chapter-panel">
          <div className="green-report-chapter-head">
            <span className="green-report-chapter-head-title">章节列表</span>
            <button
              className="green-report-btn-secondary"
              onClick={handleGenerate}
              disabled={contentTaskRunning}
            >
              {contentTaskRunning ? '生成中...' : '生成正文'}
            </button>
          </div>
          {(contentTaskRunning || state.contentTask) && (
            <div style={{ padding: '4px 8px' }}>
              <ProgressBar
                value={state.contentTask?.progress ?? 0}
                label={state.contentTask?.logs?.[state.contentTask.logs.length - 1] ?? ''}
                showPercentage
                active={contentTaskRunning}
              />
              {state.contentTask?.status === 'error' && (
                <div className="green-report-error-text">
                  正文生成失败: {state.contentTask.error}
                </div>
              )}
            </div>
          )}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--yb-border-soft)' }}>
            <textarea
              className="green-report-textarea"
              value={state.contentRequirements || ''}
              onChange={(e) => onContentRequirementsChange(e.target.value)}
              placeholder="附加生成要求（可选）：例如重点描述碳中和路径、增加数据对比表格、引用最新政策..."
              rows={2}
              style={{ marginBottom: 0 }}
            />
          </div>
          <div className="green-report-chapter-list">
            {leaves.length === 0 ? (
              <div className="green-report-outline-empty">
                <p className="green-report-outline-empty-title">尚无目录数据</p>
                <p className="green-report-outline-empty-hint">请先在"报告目录"步骤生成目录</p>
              </div>
            ) : (
              leaves.map((item) => (
                <div
                  key={item.id}
                  className={['green-report-chapter-item', selectedNodeId === item.id ? 'is-selected' : ''].filter(Boolean).join(' ')}
                  onClick={() => { setSelectedNodeId(item.id); setEditing(false); }}
                >
                  <span className="green-report-chapter-item-id">{item.id}</span>
                  {item.title}
                  {item.content && <span className="green-report-chapter-item-check">✓</span>}
                </div>
              ))
            )}
          </div>
          <div className="green-report-chapter-foot">
            {generatedCount}/{leaves.length} 章已生成
          </div>
        </div>

        <div className="green-report-editor-panel">
          {selectedNode ? (
            <>
              <div className="green-report-editor-head">
                <span className="green-report-editor-title">
                  {selectedNode.id} {selectedNode.title}
                </span>
                {editing ? (
                  <div className="green-report-editor-actions">
                    <button className="green-report-btn green-report-btn-primary" onClick={handleSaveEdit}>保存</button>
                    <button className="green-report-btn-secondary" onClick={() => setEditing(false)}>取消</button>
                  </div>
                ) : (
                  <button className="green-report-btn-secondary" onClick={() => handleStartEdit(selectedNode)}>编辑</button>
                )}
              </div>
              <div className="green-report-editor-body">
                {editing ? (
                  <textarea
                    className="green-report-editor-textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                ) : selectedNode.content ? (
                  <MarkdownRenderer>{selectedNode.content}</MarkdownRenderer>
                ) : (
                  <div className="green-report-outline-empty">
                    <p className="green-report-outline-empty-title">本章尚未生成正文</p>
                    <p className="green-report-outline-empty-hint">请点击上方"生成正文"按钮，或切换到编辑模式手动填写</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="green-report-editor-placeholder">
              <span className="green-report-editor-placeholder-text">请从左侧选择一个章节</span>
              {hasContent && (
                <div className="green-report-editor-placeholder-actions">
                  <button
                    className="green-report-btn green-report-btn-primary"
                    onClick={onExportWord}
                    disabled={wordExportProgress.running}
                  >
                    {wordExportProgress.running ? 'Word 导出中...' : '导出 Word'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContentPage;
