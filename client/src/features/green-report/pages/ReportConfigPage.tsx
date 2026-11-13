import type { ChangeEvent } from 'react';
import { AppSwitch } from '../../../shared/ui';
import type { ExportTemplateRecord } from '../../../shared/types/exportFormat';
import type { GreenDocumentStyle, GreenPageBackground, GreenReportFramework, GreenReportState } from '../types';
import { GREEN_DOCUMENT_STYLE_LABELS } from '../types';

interface ReportConfigPageProps {
  state: GreenReportState;
  draftPageCount: number;
  draftDocumentStyle: GreenDocumentStyle;
  draftFramework: GreenReportFramework;
  draftPageBackground: GreenPageBackground;
  draftTargetWords: number;
  draftTemplateId: string | null;
  skipCoverFrontMatter: boolean;
  templates: ExportTemplateRecord[];
  onDraftPageCountChange: (value: number) => void;
  onDraftDocumentStyleChange: (value: GreenDocumentStyle) => void;
  onDraftFrameworkChange: (value: GreenReportFramework) => void;
  onDraftPageBackgroundChange: (value: GreenPageBackground) => void;
  onDraftTargetWordsChange: (value: number) => void;
  onDraftTemplateIdChange: (value: string | null) => void;
  onSkipCoverFrontMatterChange: (value: boolean) => void;
  onSave: () => void;
}

const DOCUMENT_STYLES = Object.keys(GREEN_DOCUMENT_STYLE_LABELS) as GreenDocumentStyle[];

const DOCUMENT_STYLE_DESCRIPTIONS: Record<GreenDocumentStyle, string> = {
  standard: '标准正式报告文体，语言严谨规范，结构清晰，适用于监管披露和正式发布。',
  narrative: '叙事型写作风格，注重逻辑连贯和可读性，适合面向利益相关方的沟通。',
  'data-driven': '数据驱动型写作风格，重点呈现量化指标、对比图表和趋势分析。',
  academic: '学术规范型写作风格，引用国内外标准和研究方法，适合研究类报告。',
};

const REPORT_FRAMEWORKS: Array<{ value: GreenReportFramework; title: string; description: string }> = [
  {
    value: 'dual-track',
    title: '双轨制框架',
    description: '制度规范 + 五维评价：含前言、关于本报告、企业基本信息、关键指标总览、制度规范、五个评价维度、综合评价、报告结论与附录；封面、目录可选导出。',
  },
  {
    value: 'evaluation',
    title: '专项评价框架',
    description: '旧版评价写法：企业概况 → 评价目的与依据 → 现状 → 需求匹配 → 投入产出 → 适配性 → 问题建议 → 评价结论，共八章；直接从第一章开始，不导出封面、目录、签章页和尾页。',
  },
  {
    value: 'esg-disclosure',
    title: 'ESG披露框架',
    description: '所有报告类型通用：编制说明 → 公司概况与治理 → 合规与风险 → 环境与专项绩效 → 社会绩效（员工/客户社区）→ 创新 → 关键绩效 → 差距与改进 → 结论，共十章；章节标题按所选报告类型自动适配（ESG、碳足迹、专项评价等均可使用）；直接从第一章开始，不导出封面、目录、签章页和尾页。',
  },
];

function ReportConfigPage({
  draftPageCount,
  draftDocumentStyle,
  draftFramework,
  draftPageBackground,
  draftTargetWords,
  draftTemplateId,
  skipCoverFrontMatter,
  templates,
  onDraftPageCountChange,
  onDraftDocumentStyleChange,
  onDraftFrameworkChange,
  onDraftPageBackgroundChange,
  onDraftTargetWordsChange,
  onDraftTemplateIdChange,
  onSkipCoverFrontMatterChange,
  onSave,
}: ReportConfigPageProps) {
  const handlePageCountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    onDraftPageCountChange(Number.isFinite(value) && value > 0 ? value : 1);
  };

  const handleTargetWordsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    onDraftTargetWordsChange(Number.isFinite(value) && value > 0 ? value : 1000);
  };

  return (
    <div className="green-report-section">
      <div className="green-report-card-panel">
        <div className="green-report-block">
          <h2 className="green-report-title">报告配置</h2>
          <p className="green-report-subtitle">设置报告规模和写作风格，影响 AI 生成正文的字数与章节深度</p>

          <div className="green-report-form">
            <div className="green-report-field">
              <span className="green-report-field-label">报告框架</span>
              <div className="green-report-style-grid">
                {REPORT_FRAMEWORKS.map((framework) => {
                  const selected = draftFramework === framework.value;
                  return (
                    <div
                      key={framework.value}
                      className={`green-report-style-card${selected ? ' is-selected' : ''}`}
                      onClick={() => onDraftFrameworkChange(framework.value)}
                    >
                      <div className="green-report-style-card-title">{framework.title}</div>
                      <div className="green-report-style-card-desc">{framework.description}</div>
                    </div>
                  );
                })}
              </div>
              <span className="green-report-field-hint">
                切换框架后需重新生成目录和正文；双轨制框架为默认写法规格
              </span>
            </div>

            <label className="green-report-field">
              <span className="green-report-field-label">生成页数</span>
              <div className="green-report-number-group">
                <input
                  type="number"
                  className="green-report-input green-report-number-input"
                  min={1}
                  max={500}
                  value={draftPageCount}
                  onChange={handlePageCountChange}
                />
                <span className="green-report-number-suffix">页</span>
              </div>
              <span className="green-report-field-hint">
                预期生成的报告总页数，AI 会根据页数估算正文字数与章节深度
              </span>
            </label>

            <div className="green-report-field">
              <span className="green-report-field-label">文档样式</span>
              <div className="green-report-style-grid">
                {DOCUMENT_STYLES.map((style) => {
                  const selected = draftDocumentStyle === style;
                  return (
                    <div
                      key={style}
                      className={`green-report-style-card${selected ? ' is-selected' : ''}`}
                      onClick={() => onDraftDocumentStyleChange(style)}
                    >
                      <div className="green-report-style-card-title">
                        {GREEN_DOCUMENT_STYLE_LABELS[style]}
                      </div>
                      <div className="green-report-style-card-desc">
                        {DOCUMENT_STYLE_DESCRIPTIONS[style]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="green-report-field">
              <span className="green-report-field-label">页面底图</span>
              <select
                className="green-report-input green-report-select"
                value={draftPageBackground === 'none' ? '' : draftPageBackground}
                onChange={(e) => onDraftPageBackgroundChange((e.target.value || 'none') as GreenPageBackground)}
              >
                <option value="">不使用底图（默认）</option>
                <option value="default">双碳产业底图</option>
                <option value="brand">蔚碳环保底图</option>
              </select>
              <span className="green-report-field-hint">
                底图以每页水印形式衬于正文下方，仅影响导出效果，不影响已生成内容
              </span>
            </div>

            <div className="green-report-field">
              <span className="green-report-field-label">导出模板</span>
              <select
                className="green-report-input green-report-select"
                value={draftTemplateId ?? ''}
                onChange={(e) => onDraftTemplateIdChange(e.target.value || null)}
              >
                <option value="">默认导出格式</option>
                {templates.map((template) => (
                  <option key={template.template_id} value={template.template_id}>
                    {template.template_name}
                  </option>
                ))}
              </select>
              <span className="green-report-field-hint">
                选择导出 Word 时使用的版式模板；可在「报告模板」页面新建和管理模板
              </span>
            </div>

            <div className="green-report-field">
              <span className="green-report-field-label">仅导出正文</span>
              {draftFramework !== 'dual-track' ? (
                <>
                  <div className="green-report-switch-row">
                    <span>该框架固定不导出封面、扉页、目录、签章页和尾页，直接从第一章开始</span>
                  </div>
                  <span className="green-report-field-hint">
                    Word/PDF 导出时自动从“第一章”开始
                  </span>
                </>
              ) : (
                <>
                  <div className="green-report-switch-row">
                    <AppSwitch checked={skipCoverFrontMatter} onCheckedChange={onSkipCoverFrontMatterChange} />
                    <span>不导出封面、扉页、目录、签章页和尾页</span>
                  </div>
                  <span className="green-report-field-hint">
                    开启后 Word/PDF 从“前言”开始导出；关闭则保留完整封面与前置页
                  </span>
                </>
              )}
            </div>

            <label className="green-report-field">
              <span className="green-report-field-label">目标字数</span>
              <div className="green-report-number-group">
                <input
                  type="number"
                  className="green-report-input green-report-number-input"
                  min={1000}
                  max={200000}
                  step={1000}
                  value={draftTargetWords}
                  onChange={handleTargetWordsChange}
                />
                <span className="green-report-number-suffix">字</span>
              </div>
              <span className="green-report-field-hint">
                正文生成目标总字数，作为章节字数分配的依据
              </span>
            </label>
          </div>
        </div>

        <div className="green-report-btn-row">
          <button
            className="green-report-btn green-report-btn-primary"
            onClick={onSave}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportConfigPage;
