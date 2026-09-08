import { useState } from 'react';
import { ProgressBar, useToast } from '../../../shared/ui';
import type { OutlineItem } from '../../../shared/types';
import type { GreenReportState } from '../types';
import type { GreenSaveOutlineRequest } from '../types';
import { collectGreenLeaves } from '../types';

interface OutlinePageProps {
  state: GreenReportState;
  onOutlineChange: (patch: { targetWords?: number; outlineRequirements?: string }) => void;
  onGenerateOutline: () => Promise<void>;
  onSaveOutline: (request: GreenSaveOutlineRequest) => Promise<void>;
}

function OutlinePage({ state, onOutlineChange, onGenerateOutline, onSaveOutline }: OutlinePageProps) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [editingItem, setEditingItem] = useState<OutlineItem | null>(null);
  const outline = state.outlineData?.outline ?? [];
  const leaves = collectGreenLeaves(outline);
  const outlineTaskRunning = state.outlineTask?.status === 'running';

  const handleGenerate = async () => {
    if (!state.projectInfo.companyName?.trim()) {
      showToast('请先在"企业信息"步骤填写企业名称', 'error');
      return;
    }
    setGenerating(true);
    try {
      await onGenerateOutline();
      showToast('目录生成任务已启动，请等待完成', 'info');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdit = async (item: OutlineItem) => {
    const newOutline = updateOutlineItem(outline, item);
    const request: GreenSaveOutlineRequest = {
      outlineData: { outline: newOutline, project_name: state.outlineData?.project_name, project_overview: state.outlineData?.project_overview },
      reason: 'edit',
      affectedNodeIds: [item.id],
    };
    await onSaveOutline(request);
    setEditingItem(null);
    showToast('已保存', 'success');
  };

  return (
    <div className="green-report-section">
      <div className="green-report-card-panel">
        <div className="green-report-toolbar">
          <h2 className="green-report-toolbar-title">报告目录</h2>
          <div className="green-report-toolbar-actions">
            <label className="green-report-number-inline">
              目标字数
              <input
                type="number"
                value={state.targetWords}
                onChange={(e) => onOutlineChange({ targetWords: Number(e.target.value) })}
              />
            </label>
            <button
              className="green-report-btn green-report-btn-primary"
              onClick={handleGenerate}
              disabled={outlineTaskRunning || generating}
            >
              {outlineTaskRunning ? '生成中...' : (outline.length > 0 ? '重新生成目录' : '生成目录')}
            </button>
          </div>
        </div>

        {(outlineTaskRunning || state.outlineTask) && (
          <div style={{ marginBottom: '16px' }}>
            <ProgressBar
              value={state.outlineTask?.progress ?? 0}
              label={state.outlineTask?.logs?.[state.outlineTask.logs.length - 1] ?? ''}
              showPercentage
            />
            {state.outlineTask?.status === 'error' && (
              <div className="green-report-error-text">
                目录生成失败: {state.outlineTask.error}
              </div>
            )}
          </div>
        )}

        <div className="green-report-block" style={{ marginBottom: '16px' }}>
          <label className="green-report-label">附加生成要求（可选）</label>
          <textarea
            className="green-report-textarea"
            value={state.outlineRequirements || ''}
            onChange={(e) => onOutlineChange({ outlineRequirements: e.target.value })}
            placeholder="例如：重点突出碳排放管理、增加供应链 ESG 评估章节、参考 GRI 2021 标准..."
            rows={3}
          />
          <p className="green-report-help-text">
            填写后将在生成目录时作为附加指令传给 AI，可指定章节侧重、参考标准、特殊要求等。
          </p>
        </div>

        {outline.length > 0 ? (
          <div className="green-report-outline-tree">
            {renderOutlineItems(outline, 0, editingItem, setEditingItem, handleSaveEdit)}
            <div className="green-report-outline-stats">
              共 {outline.length} 个一级章节，{leaves.length} 个叶子节点
            </div>
          </div>
        ) : (
          <div className="green-report-outline-empty">
            <p className="green-report-outline-empty-title">尚未生成目录</p>
            <p className="green-report-outline-empty-hint">
              请确认"企业信息"步骤的信息已保存，然后点击"生成目录"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function updateOutlineItem(items: OutlineItem[], updated: OutlineItem): OutlineItem[] {
  return items.map((item) => {
    if (item.id === updated.id) return updated;
    if (item.children?.length) return { ...item, children: updateOutlineItem(item.children, updated) };
    return item;
  });
}

function renderOutlineItems(
  items: OutlineItem[],
  depth: number,
  editingItem: OutlineItem | null,
  setEditingItem: (item: OutlineItem | null) => void,
  onSave: (item: OutlineItem) => void,
): React.ReactNode {
  return items.map((item) => {
    const isEditing = editingItem?.id === item.id;
    const hasChildren = !!item.children?.length;
    return (
      <div key={item.id}>
        <div
          className={[
            'green-report-outline-item',
            depth === 0 ? 'is-root' : '',
            !hasChildren ? 'is-leaf' : '',
            item.content ? 'has-content' : '',
          ].filter(Boolean).join(' ')}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => !isEditing && setEditingItem({ ...item })}
        >
          {isEditing ? (
            <div className="green-report-outline-item-edit">
              <input
                type="text"
                className="green-report-input"
                value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
              />
              <textarea
                className="green-report-textarea"
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                rows={2}
              />
              <div className="green-report-toolbar-actions">
                <button className="green-report-btn green-report-btn-primary" onClick={() => onSave(editingItem)}>保存</button>
                <button className="green-report-btn-secondary" onClick={() => setEditingItem(null)}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <div className={['green-report-outline-item-title', depth === 0 ? 'is-root' : ''].filter(Boolean).join(' ')}>
                {item.id} {item.title}
              </div>
              {item.description && (
                <div className="green-report-outline-item-desc">{item.description}</div>
              )}
              {item.content && (
                <div className="green-report-outline-item-meta">正文已生成（{item.content.length}字）</div>
              )}
            </>
          )}
        </div>
        {hasChildren ? renderOutlineItems(item.children!, depth + 1, editingItem, setEditingItem, onSave) : null}
      </div>
    );
  });
}

export default OutlinePage;
