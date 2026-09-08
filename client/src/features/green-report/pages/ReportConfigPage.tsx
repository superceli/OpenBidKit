import type { ChangeEvent } from 'react';
import type { GreenDocumentStyle, GreenReportState } from '../types';
import { GREEN_DOCUMENT_STYLE_LABELS } from '../types';

interface ReportConfigPageProps {
  state: GreenReportState;
  draftPageCount: number;
  draftDocumentStyle: GreenDocumentStyle;
  draftTargetWords: number;
  onDraftPageCountChange: (value: number) => void;
  onDraftDocumentStyleChange: (value: GreenDocumentStyle) => void;
  onDraftTargetWordsChange: (value: number) => void;
  onSave: () => void;
}

const DOCUMENT_STYLES = Object.keys(GREEN_DOCUMENT_STYLE_LABELS) as GreenDocumentStyle[];

const DOCUMENT_STYLE_DESCRIPTIONS: Record<GreenDocumentStyle, string> = {
  standard: '标准正式报告文体，语言严谨规范，结构清晰，适用于监管披露和正式发布。',
  narrative: '叙事型写作风格，注重逻辑连贯和可读性，适合面向利益相关方的沟通。',
  'data-driven': '数据驱动型写作风格，重点呈现量化指标、对比图表和趋势分析。',
  academic: '学术规范型写作风格，引用国内外标准和研究方法，适合研究类报告。',
};

function ReportConfigPage({
  draftPageCount,
  draftDocumentStyle,
  draftTargetWords,
  onDraftPageCountChange,
  onDraftDocumentStyleChange,
  onDraftTargetWordsChange,
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
