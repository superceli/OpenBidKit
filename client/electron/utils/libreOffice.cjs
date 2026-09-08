'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function normalizeCommandCandidate(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function pathToFileUri(p) {
  const normalized = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32'
    ? `file:///${encodeURI(normalized).replace(/%5C/g, '/')}`
    : `file://${encodeURI(normalized)}`;
}

function getPlatformLibreOfficeCandidates() {
  if (process.platform !== 'darwin') return [];
  return [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    path.join(os.homedir(), 'Applications', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'),
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/opt/local/bin/soffice',
  ];
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`命令执行超时: ${command}`));
        }, options.timeoutMs)
      : null;

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`命令退出码 ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function canRunCommand(command, args) {
  try {
    await runProcess(command, args, { timeoutMs: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function findLibreOfficeCommand() {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    'soffice',
    'libreoffice',
    ...getPlatformLibreOfficeCandidates(),
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ].map(normalizeCommandCandidate).filter(Boolean);

  const checked = new Set();
  for (const candidate of candidates) {
    if (checked.has(candidate)) continue;
    checked.add(candidate);
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    if (await canRunCommand(candidate, ['--version'])) return candidate;
  }
  return null;
}

async function runLibreOfficeConvertToPdf(soffice, inputPath, outputDir) {
  const profileDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'green-pdf-lo-profile-'));
  try {
    const profileUri = pathToFileUri(profileDir);
    const args = [
      '--headless',
      '--nologo',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      `-env:UserInstallation=${profileUri}`,
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath,
    ];
    await runProcess(soffice, args, { timeoutMs: 180000 });
  } finally {
    await fs.promises.rm(profileDir, { recursive: true, force: true });
  }
}

module.exports = {
  findLibreOfficeCommand,
  runLibreOfficeConvertToPdf,
};
