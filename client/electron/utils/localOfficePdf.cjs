'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function runPowerShell(script, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* 忽略结束失败 */ }
      resolve({ code: -1, stdout, stderr: `${stderr}\n转换超时` });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error?.message || String(error)}` });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function escapePowerShellText(value) {
  return String(value || '').replace(/'/g, "''");
}

/**
 * 在没有 LibreOffice 的 Windows 环境下，用本机 WPS / Microsoft Word 的 COM 接口把 docx 转成 PDF。
 * 成功返回生成的 PDF 路径，失败返回 null（不抛错，由调用方决定提示文案）。
 */
async function convertDocxToPdfWithLocalOffice(inputPath, outputDir) {
  if (process.platform !== 'win32') return null;
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const expectedPdf = path.join(outputDir, `${baseName}.pdf`);

  const script = `
$ErrorActionPreference = 'Stop'
$inputFile = '${escapePowerShellText(inputPath)}'
$outputFile = '${escapePowerShellText(expectedPdf)}'
$done = $false
foreach ($progId in @('KWPS.Application', 'Word.Application')) {
  if ($done) { break }
  $app = $null
  try {
    $app = New-Object -ComObject $progId
    try {
      try { $app.Visible = $false } catch { }
      try { $app.DisplayAlerts = 0 } catch { }
      $doc = $app.Documents.Open($inputFile, $false, $true)
      try {
        try { $doc.ExportAsFixedFormat($outputFile, 17) } catch { $doc.SaveAs([ref]$outputFile, [ref]17) }
      } finally {
        try { $doc.Close($false) } catch { }
      }
      if (Test-Path $outputFile) { $done = $true }
    } finally {
      if ($app) { try { $app.Quit() } catch { } }
    }
  } catch {
    # 当前 Office 组件不可用时继续尝试下一个
  }
}
if (-not (Test-Path $outputFile)) { exit 1 }
exit 0
`;

  const result = await runPowerShell(script);
  if (result.code === 0 && fs.existsSync(expectedPdf)) return expectedPdf;
  return null;
}

module.exports = { convertDocxToPdfWithLocalOffice };
