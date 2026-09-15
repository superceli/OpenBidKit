import { useState } from 'react';
import { AppDialog, ProgressBar, useToast } from '../../../shared/ui';
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const outline = state.outlineData?.outline ?? [];
  const leaves = collectGreenLeaves(outline);
  const outlineTaskRunning = state.outlineTask?.status === 'running';
  const contentTaskRunning = state.contentTask?.status === 'running';

  const handleGenerate = async () => {
    if (!state.projectInfo.companyName?.trim()) {
      showToast('请先在"企业信息"步骤填写委托单位', 'error');
      return;
    }
    setGenerating(true);
    try {
      await onGenerateOutline();
      showToast('目录生成任务已启动，请等待完成', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelGenerate = async () => {
    try {
      const res = await window.lvcert.tasks.cancelGreenReportOutline();
      if (res.success) {
        showToast('目录生成已取消', 'success');
      } else {
        showToast(res.message || '取消失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
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

  const handleAddRoot = async () => {
    const newNode: OutlineItem = { id: '', title: '新章节', description: '', children: [] };
    const newOutline = reassignIds([...outline, newNode]);
    const request: GreenSaveOutlineRequest = {
      outlineData: { outline: newOutline, project_name: state.outlineData?.project_name, project_overview: state.outlineData?.project_overview },
      reason: 'replace',
    };
    await onSaveOutline(request);
    const added = newOutline[newOutline.length - 1];
    setEditingItem({ ...added });
  };

  const handleAddChild = async (parentId: string) => {
    const newOutline = reassignIds(addChildNode(outline, parentId));
    const request: GreenSaveOutlineRequest = {
      outlineData: { outline: newOutline, project_name: state.outlineData?.project_name, project_overview: state.outlineData?.project_overview },
      reason: 'replace',
    };
    await onSaveOutline(request);
    const parent = findNodeById(newOutline, parentId);
    const added = parent?.children?.[parent.children.length - 1];
    if (added) setEditingItem({ ...added });
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    const newOutline = reassignIds(removeNode(outline, pendingDeleteId));
    const request: GreenSaveOutlineRequest = {
      outlineData: { outline: newOutline, project_name: state.outlineData?.project_name, project_overview: state.outlineData?.project_overview },
      reason: 'replace',
    };
    await onSaveOutline(request);
    setPendingDeleteId(null);
    showToast('已删除', 'success');
  };

  const deleteTarget = pendingDeleteId ? findNodeById(outline, pendingDeleteId) : null;

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

        {(outlineTaskRunning || state.outlineTask?.status === 'error' || state.outlineTask?.status === 'cancelled') && (
          <div style={{ marginBottom: '16px' }}>
            <ProgressBar
              value={state.outlineTask?.progress ?? 0}
              label={state.outlineTask?.logs?.[state.outlineTask.logs.length - 1] ?? ''}
              showPercentage
              active={outlineTaskRunning}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              {state.outlineTask?.status === 'error' && (
                <div className="green-report-error-text">
                  目录生成失败: {state.outlineTask.error}
                </div>
              )}
              {state.outlineTask?.status === 'cancelled' && (
                <div className="green-report-error-text" style={{ color: 'var(--yb-text-muted)' }}>
                  已取消
                </div>
              )}
              {outlineTaskRunning && (
                <button
                  className="green-report-btn-secondary"
                  style={{ marginLeft: 'auto', color: 'var(--yb-danger, #e5484d)', borderColor: 'var(--yb-danger, #e5484d)' }}
                  onClick={handleCancelGenerate}
                >
                  取消生成
                </button>
              )}
            </div>
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
            {renderOutlineItems({
              items: outline,
              depth: 0,
              editingItem,
              setEditingItem,
              onSave: handleSaveEdit,
              onAddChild: handleAddChild,
              onDelete: (id) => setPendingDeleteId(id),
              structureDisabled: contentTaskRunning,
            })}
            <div className="green-report-outline-actions">
              <button
                className="green-report-outline-add-root"
                onClick={handleAddRoot}
                disabled={contentTaskRunning}
                title={contentTaskRunning ? '正文生成中，暂不支持修改目录结构' : ''}
              >
                + 新增父目录
              </button>
            </div>
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
            <button
              className="green-report-outline-add-root"
              onClick={handleAddRoot}
              style={{ marginTop: '12px' }}
            >
              + 新增父目录
            </button>
          </div>
        )}
      </div>

      <AppDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        kicker="删除章节"
        title={`确认删除「${deleteTarget?.title || ''}」？`}
        description={
          deleteTarget?.children?.length
            ? `该章节包含 ${deleteTarget.children.length} 个子章节，删除后将一并移除且不可恢复。`
            : '删除后不可恢复。'
        }
        actions={
          <>
            <button className="green-report-btn-secondary" onClick={() => setPendingDeleteId(null)}>取消</button>
            <button className="green-report-btn green-report-btn-primary" style={{ background: 'var(--yb-danger, #e5484d)' }} onClick={handleDelete}>确认删除</button>
          </>
        }
      />
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

function findNodeById(items: OutlineItem[], id: string): OutlineItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children?.length) {
      const found = findNodeById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function reassignIds(items: OutlineItem[], parentId?: string): OutlineItem[] {
  return items.map((item, i) => {
    const id = parentId ? `${parentId}.${i + 1}` : String(i + 1);
    const children = item.children?.length ? reassignIds(item.children, id) : item.children;
    return { ...item, id, children };
  });
}

function addChildNode(items: OutlineItem[], parentId: string): OutlineItem[] {
  return items.map((item) => {
    if (item.id === parentId) {
      const newChild: OutlineItem = { id: '', title: '新子章节', description: '', children: [] };
      return { ...item, children: [...(item.children || []), newChild] };
    }
    if (item.children?.length) {
      return { ...item, children: addChildNode(item.children, parentId) };
    }
    return item;
  });
}

function removeNode(items: OutlineItem[], nodeId: string): OutlineItem[] {
  return items
    .filter((item) => item.id !== nodeId)
    .map((item) => {
      if (item.children?.length) {
        return { ...item, children: removeNode(item.children, nodeId) };
      }
      return item;
    });
}

interface RenderOutlineItemsArgs {
  items: OutlineItem[];
  depth: number;
  editingItem: OutlineItem | null;
  setEditingItem: (item: OutlineItem | null) => void;
  onSave: (item: OutlineItem) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  structureDisabled: boolean;
}

function renderOutlineItems(args: RenderOutlineItemsArgs): React.ReactNode {
  const { items, depth, editingItem, setEditingItem, onSave, onAddChild, onDelete, structureDisabled } = args;
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
        >
          {isEditing ? (
            <div className="green-report-outline-item-edit">
              <input
                type="text"
                className="green-report-input"
                value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                placeholder="章节标题"
              />
              <textarea
                className="green-report-textarea"
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                placeholder="章节描述（可选）"
                rows={2}
              />
              <div className="green-report-toolbar-actions">
                <button className="green-report-btn green-report-btn-primary" onClick={() => onSave(editingItem)}>保存</button>
                <button className="green-report-btn-secondary" onClick={() => setEditingItem(null)}>取消</button>
              </div>
            </div>
          ) : (
            <div
              className="green-report-outline-item-body"
              onClick={() => setEditingItem({ ...item })}
            >
              <div className={['green-report-outline-item-title', depth === 0 ? 'is-root' : ''].filter(Boolean).join(' ')}>
                {item.id} {item.title}
              </div>
              {item.description && (
                <div className="green-report-outline-item-desc">{item.description}</div>
              )}
              {item.content && (
                <div className="green-report-outline-item-meta">正文已生成（{item.content.length}字）</div>
              )}
            </div>
          )}
          {!isEditing && (
            <div className="green-report-outline-item-actions">
              <button
                className="green-report-outline-action-btn"
                onClick={(e) => { e.stopPropagation(); onAddChild(item.id); }}
                disabled={structureDisabled}
                title={structureDisabled ? '正文生成中，暂不支持修改目录结构' : '添加子目录'}
              >
                + 子目录
              </button>
              <button
                className="green-report-outline-action-btn"
                onClick={(e) => { e.stopPropagation(); setEditingItem({ ...item }); }}
                title="编辑"
              >
                编辑
              </button>
              <button
                className="green-report-outline-action-btn is-danger"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                disabled={structureDisabled}
                title={structureDisabled ? '正文生成中，暂不支持修改目录结构' : '删除'}
              >
                删除
              </button>
            </div>
          )}
        </div>
        {hasChildren ? renderOutlineItems({ ...args, items: item.children!, depth: depth + 1 }) : null}
      </div>
    );
  });
}

export default OutlinePage;
