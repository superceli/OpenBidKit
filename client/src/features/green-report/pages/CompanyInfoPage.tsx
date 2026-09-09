import { useMemo, useState, type ChangeEvent } from 'react';
import { useToast } from '../../../shared/ui';
import type { GreenKnowledgeContext, GreenProjectInfo, GreenReportState, GreenReportType } from '../types';
import { GREEN_REPORT_TYPES, groupReportTypesByCategory, searchReportTypes, type GreenReportCategory } from '../reportTypes';

interface CompanyInfoPageProps {
  state: GreenReportState;
  draftProjectInfo: GreenProjectInfo;
  onDraftChange: (info: GreenProjectInfo) => void;
  onReportTypeChange: (type: GreenReportType) => void;
  onSaveProjectInfo: () => void;
  onSearchKnowledge: (keyword: string) => Promise<GreenKnowledgeContext | null>;
  onClearKnowledge: () => Promise<void>;
}

function CompanyInfoPage({
  state,
  draftProjectInfo,
  onDraftChange,
  onReportTypeChange,
  onSaveProjectInfo,
  onSearchKnowledge,
  onClearKnowledge,
}: CompanyInfoPageProps) {
  const { showToast } = useToast();
  const [searching, setSearching] = useState(false);
  const [reportTypeSearch, setReportTypeSearch] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);

  // 搜索并按分类分组
  const filteredGroups = useMemo(() => {
    const filtered = searchReportTypes(reportTypeSearch);
    return groupReportTypesByCategory(filtered);
  }, [reportTypeSearch]);

  const handleFieldChange = (field: keyof GreenProjectInfo) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onDraftChange({ ...draftProjectInfo, [field]: e.target.value });
  };

  const handleSearch = async () => {
    const keyword = draftProjectInfo.companyName.trim();
    if (!keyword) {
      showToast('请先输入企业名称', 'error');
      return;
    }
    setSearching(true);
    try {
      const result = await onSearchKnowledge(keyword);
      if (result && result.items.length > 0) {
        showToast(`找到 ${result.items.length} 条相关知识条目`, 'success');
      } else {
        showToast('未在知识库中找到相关企业信息', 'info');
      }
    } catch (error) {
      showToast(`知识库检索失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleClearKnowledge = async () => {
    await onClearKnowledge();
    showToast('已清除知识库上下文', 'info');
  };

  const handleGenerateReportCode = async () => {
    setGeneratingCode(true);
    try {
      const code = await window.lvcert.greenReport.generateReportCode();
      onDraftChange({ ...draftProjectInfo, reportCode: code });
      showToast(`已生成报告编号 ${code}`, 'success');
    } catch (error) {
      showToast(`报告编号生成失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setGeneratingCode(false);
    }
  };

  const knowledgeItems = state.knowledgeContext?.items ?? [];

  return (
    <div className="green-report-section">
      <div className="green-report-card-panel">
        <div className="green-report-block">
          <h2 className="green-report-title">选择报告类型</h2>
          <p className="green-report-subtitle">共 {GREEN_REPORT_TYPES.length} 种报告类型，可搜索名称或分类</p>
          <div className="green-report-type-search">
            <input
              type="text"
              className="green-report-input"
              placeholder="搜索报告类型，例如：ESG、碳减排、绿色工厂、智能制造..."
              value={reportTypeSearch}
              onChange={(e) => setReportTypeSearch(e.target.value)}
            />
          </div>
          <div className="green-report-type-list">
            {Object.entries(filteredGroups).map(([category, items]) => (
              <div key={category} className="green-report-type-group">
                <div className="green-report-type-group-title">
                  {category} <span className="green-report-type-group-count">({items.length})</span>
                </div>
                <div className="green-report-type-items">
                  {items.map((item) => {
                    const selected = state.reportType === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`green-report-type-item${selected ? ' is-selected' : ''}`}
                        onClick={() => onReportTypeChange(item.id)}
                        title={item.description || item.name}
                      >
                        <span className="green-report-type-item-name">{item.name}</span>
                        {selected && <span className="green-report-type-item-check">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(filteredGroups).length === 0 && (
              <div className="green-report-type-empty">未找到匹配的报告类型</div>
            )}
          </div>
        </div>
      </div>

      <div className="green-report-card-panel">
        <div className="green-report-block">
          <h2 className="green-report-title">企业基本信息</h2>
          <p className="green-report-subtitle">用于生成报告封面和正文背景描述</p>
          <div className="green-report-form">
            <div className="green-report-field">
              <div className="green-report-field-label">
                <span>企业/组织名称</span>
                <button
                  className="green-report-btn-secondary"
                  onClick={handleSearch}
                  disabled={searching}
                >
                  {searching ? '检索中...' : '搜索知识库'}
                </button>
              </div>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.companyName}
                onChange={handleFieldChange('companyName')}
                placeholder="请输入企业全称"
              />
            </div>

            {knowledgeItems.length > 0 && (
              <div className="green-report-knowledge">
                <div className="green-report-knowledge-head">
                  <span>知识库检索结果（{knowledgeItems.length} 条）</span>
                  <button
                    className="green-report-btn-secondary"
                    onClick={handleClearKnowledge}
                  >
                    清除
                  </button>
                </div>
                <div className="green-report-knowledge-list">
                  {knowledgeItems.map((item, idx) => (
                    <div
                      key={item.itemId || idx}
                      className="green-report-knowledge-item"
                    >
                      <div className="green-report-knowledge-item-title">
                        {item.title || '（无标题）'}
                      </div>
                      {item.resume && (
                        <div className="green-report-knowledge-item-resume">
                          {item.resume}
                        </div>
                      )}
                      {item.content && (
                        <div className="green-report-knowledge-item-content">
                          {item.content.slice(0, 200)}{item.content.length > 200 ? '...' : ''}
                        </div>
                      )}
                      {item.documentName && (
                        <div className="green-report-knowledge-item-source">
                          来源：{item.documentName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="green-report-field">
              <span className="green-report-field-label">所属行业</span>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.industry}
                onChange={handleFieldChange('industry')}
                placeholder="例如：制造业 / 信息技术 / 金融等"
              />
            </label>
            <label className="green-report-field">
              <span className="green-report-field-label">报告期</span>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.reportingPeriod}
                onChange={handleFieldChange('reportingPeriod')}
                placeholder="例如：2025年度 / 2025年1月-12月"
              />
            </label>
            <label className="green-report-field">
              <span className="green-report-field-label">
                报告范围 <span className="green-report-field-optional">（可选）</span>
              </span>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.reportScope}
                onChange={handleFieldChange('reportScope')}
                placeholder="例如：集团及下属所有子公司"
              />
            </label>
            <label className="green-report-field">
              <span className="green-report-field-label">
                重点关注议题 <span className="green-report-field-optional">（可选）</span>
              </span>
              <textarea
                className="green-report-textarea"
                value={draftProjectInfo.keyTopics}
                onChange={handleFieldChange('keyTopics')}
                placeholder="例如：碳中和、供应链管理、员工发展、公司治理等"
                rows={3}
              />
            </label>
          </div>
        </div>

        <div className="green-report-block">
          <h2 className="green-report-title">封面信息</h2>
          <p className="green-report-subtitle">导出 Word 时回显到封面页，留空则不显示该字段</p>
          <div className="green-report-form">
            <div className="green-report-field">
              <div className="green-report-field-label">
                <span>报告编号</span>
                <button
                  className="green-report-btn-secondary"
                  onClick={handleGenerateReportCode}
                  disabled={generatingCode}
                >
                  {generatingCode ? '生成中...' : '自动生成'}
                </button>
              </div>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.reportCode}
                onChange={handleFieldChange('reportCode')}
                placeholder="点击「自动生成」或手动输入编号，例如 WTHB-ESG-202609-0001"
              />
            </div>
            <label className="green-report-field">
              <span className="green-report-field-label">委托单位</span>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.clientUnit}
                onChange={handleFieldChange('clientUnit')}
                placeholder="例如：XX 集团有限公司"
              />
            </label>
            <label className="green-report-field">
              <span className="green-report-field-label">编制单位 <span className="green-report-required">*</span></span>
              <input
                type="text"
                className="green-report-input"
                value={draftProjectInfo.compileUnit}
                onChange={handleFieldChange('compileUnit')}
                placeholder="例如：蔚碳（北京）环保咨询有限公司"
              />
            </label>
            <label className="green-report-field">
              <span className="green-report-field-label">编制日期</span>
              <input
                type="date"
                className="green-report-input"
                value={draftProjectInfo.compileDate}
                onChange={handleFieldChange('compileDate')}
              />
            </label>
          </div>
        </div>

        <div className="green-report-btn-row">
          <button
            className="green-report-btn green-report-btn-primary"
            onClick={onSaveProjectInfo}
          >
            保存信息
          </button>
        </div>
      </div>
    </div>
  );
}

export default CompanyInfoPage;
