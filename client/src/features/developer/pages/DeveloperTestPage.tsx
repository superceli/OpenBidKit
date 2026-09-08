import { useState } from 'react';
import { aiClient } from '../../../shared/ai/aiClient';

type RunningMode = 'text' | 'json' | null;

const sampleContent = `# 测试项目报告

项目名称：测试项目。
项目编号：LV-TEST-001。
项目类型：绿色报告。
项目预算：100 万元。
项目地址：北京市海淀区。

报告评分要求：
1. 报告完整性，满分 30 分，要求章节完整、实施路径清晰。
2. 数据准确性，满分 20 分，要求进度安排合理、风险控制明确。
3. 内容可读性，满分 15 分，要求说明响应时效和服务保障。`;

const sampleJsonInput = {
  project_name: '测试项目',
  requirements: '报告完整性 30 分；数据准确性 20 分；内容可读性 15 分。',
};

interface JsonTestResult {
  project_name: string;
  requirements: Array<{ title: string; score: number }>;
}

const textSystemPrompt = `你是专业的报告内容分析助手。请严格基于用户提供的报告原文完成提取和总结。

通用要求：
1. 保持信息全面、准确，尽量使用原文内容，不要自行编造。
2. 如果原文没有提及，明确写"没有提及"或"原文未提及"。
3. 只输出最终结果，不输出过程、提示语或客套话。
4. 始终使用简体中文。`;

const textUserPrompt = `请基于以下报告原文提取项目名称和评分要求，并以 Markdown 列表输出：`;

function DeveloperTestPage() {
  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');

  const appendEvent = (message: string) => {
    setEvents((prev) => [...prev, `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`]);
  };

  const resetOutput = () => {
    setEvents([]);
    setContent('');
    setResult('');
  };

  const runTextTest = async () => {
    resetOutput();
    setRunningMode('text');
    appendEvent('调用通用 AI 文本请求：aiClient.chat。');

    try {
      const nextContent = await aiClient.chat({
        messages: [
          { role: 'system', content: textSystemPrompt },
          { role: 'user', content: `${textUserPrompt}\n\n${sampleContent}` },
        ],
        logTitle: '开发者测试-文本请求',
      });
      setContent(nextContent);
      appendEvent('文本请求完成。');
    } catch (error) {
      appendEvent(`文本请求错误：${error instanceof Error ? error.message : 'AI 文本请求失败'}`);
    } finally {
      setRunningMode(null);
    }
  };

  const runJsonTest = async () => {
    resetOutput();
    setRunningMode('json');
    appendEvent('调用通用 AI JSON 请求：aiClient.requestJson。');

    try {
      const response = await aiClient.requestJson<JsonTestResult>({
        messages: [
          {
            role: 'system',
            content: '请从用户输入中提取项目名称和评分要求，只返回 JSON：{"project_name":"","requirements":[{"title":"","score":0}]}。',
          },
          { role: 'user', content: JSON.stringify(sampleJsonInput) },
        ],
        logTitle: '开发者测试-JSON请求',
      });
      setResult(JSON.stringify(response, null, 2));
      appendEvent('JSON 请求完成。');
    } catch (error) {
      appendEvent(`JSON 请求错误：${error instanceof Error ? error.message : 'AI JSON 请求失败'}`);
    } finally {
      setRunningMode(null);
    }
  };

  const running = runningMode !== null;

  return (
    <div className="page-stack developer-test-page">
      <section className="panel developer-test-hero">
        <div className="hero-copy">
          <span className="eyebrow">JSON Request Lab</span>
          <h2>Json请求测试</h2>
          <p>
            这里通过通用 AI 请求复现不同响应模式的兼容问题：文本按钮验证普通响应，JSON 按钮验证结构化响应。
          </p>
          <div className="developer-test-actions">
            <button type="button" className="primary-action" onClick={runTextTest} disabled={running}>
              {runningMode === 'text' ? '文本请求中...' : '测试文本请求'}
            </button>
            <button type="button" className="primary-action" onClick={runJsonTest} disabled={running}>
              {runningMode === 'json' ? 'JSON 请求中...' : '测试 JSON 请求'}
            </button>
          </div>
        </div>
      </section>

      <div className="developer-test-grid">
        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>文本复用入口</strong>
          </div>
          <pre>{JSON.stringify({ service: 'aiClient.chat', sample: sampleContent }, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>JSON 复用入口</strong>
          </div>
          <pre>{JSON.stringify({ service: 'aiClient.requestJson', input: sampleJsonInput }, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>事件日志</strong>
          </div>
          <pre>{events.length ? events.join('\n') : '尚未开始请求。'}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>返回内容</strong>
          </div>
          <pre>{content || result || '暂无内容。'}</pre>
        </section>
      </div>
    </div>
  );
}

export default DeveloperTestPage;
