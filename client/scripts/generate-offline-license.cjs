#!/usr/bin/env node
/**
 * 离线授权码生成器
 *
 * 用法：
 *   node scripts/generate-offline-license.cjs [选项]
 *
 * 选项：
 *   --days 30            授权天数（默认 30）
 *   --machine-fp HASH    绑定设备 fingerprint（不填=一码通用）
 *   --client-id ID       绑定 clientId（不填=通配 *）
 *   --features basic,green-report  功能列表（默认 basic,green-report）
 *   --version-min 1.0.0  最低版本
 *   --version-max 99.99.99  最高版本
 *   --private-key PATH   私钥路径（默认同目录 license-private-key.json）
 *   --full               输出完整 JSON 信封而不是简化码
 *
 * 示例：
 *   # 生成一个 30 天一码通用的离线密钥
 *   node scripts/generate-offline-license.cjs --days 30
 *
 *   # 生成一年期，绑设备的离线密钥
 *   node scripts/generate-offline-license.cjs --days 365 --machine-fp xxxhash
 */

const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const DEFAULT_PROJECT = 'lvcert-client';
const DEFAULT_VERSION_MIN = '1.0.0';
const DEFAULT_VERSION_MAX = '99.99.99';
const DEFAULT_FEATURES = ['basic', 'green-report'];
const DEFAULT_DAYS = 30;
const CODE_PREFIX = 'YB-LICENSE-';

// ========== 工具 ==========

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function formatIsoDaysLater(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

// ========== 主流程 ==========

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const privateKeyPath = args['private-key']
    || path.join(__dirname, 'license-private-key.json');
  if (!fs.existsSync(privateKeyPath)) {
    console.error(`❌ 找不到私钥文件：${privateKeyPath}`);
    console.error('请先生成密钥对，私钥必须 ECDSA P-256 JWK 格式。');
    process.exit(1);
  }

  const privJwk = JSON.parse(fs.readFileSync(privateKeyPath, 'utf-8'));
  const privKey = await webcrypto.subtle.importKey(
    'jwk',
    privJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const days = Number(args.days || DEFAULT_DAYS);
  const clientId = args['client-id'] || '*';
  const machineFp = args['machine-fp'] || '';
  const features = (args.features || DEFAULT_FEATURES.join(',')).split(',');
  const versionMin = args['version-min'] || DEFAULT_VERSION_MIN;
  const versionMax = args['version-max'] || DEFAULT_VERSION_MAX;

  const payload = {
    clientId,
    machineFingerprintHash: machineFp,
    expiresAt: formatIsoDaysLater(days),
    issuedAt: new Date().toISOString(),
    issuedBy: 'yibiao-offline-keygen',
    project: DEFAULT_PROJECT,
    versionMin,
    versionMax,
    features,
  };

  const signatureBuf = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    Buffer.from(canonicalJson(payload), 'utf-8'),
  );
  const signature = base64UrlEncode(signatureBuf);

  const envelope = { payload, signature };
  const code = CODE_PREFIX + base64UrlEncode(Buffer.from(JSON.stringify(envelope), 'utf-8'));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           哲元绿证报告工具箱 · 离线授权码                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║');
  console.log(`║  有效期  ：${days} 天（至 ${payload.expiresAt.slice(0, 10)}）`);
  console.log(`║  设备绑定：${machineFp ? '是（' + machineFp.slice(0, 12) + '...）' : '否（一码通用）'}`);
  console.log(`║  功能    ：${features.join(', ')}`);
  console.log(`║  版本范围：${versionMin} ~ ${versionMax}`);
  console.log('║');
  console.log('║  授权码  ：');
  console.log('║');
  console.log(`║  ${code}`);
  console.log('║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (args.full) {
    console.log('\n── 完整 JSON 信封 ──');
    console.log(JSON.stringify(envelope, null, 2));
  }
}

main().catch((err) => {
  console.error('生成失败:', err?.message || err);
  process.exit(1);
});
