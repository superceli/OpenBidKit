'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { dialog } = require('electron');
const { getGreenReportImagesDir } = require('../utils/paths.cjs');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
};

function now() {
  return new Date().toISOString();
}

function createGreenReportImageService({ app, db }) {
  const imagesDir = getGreenReportImagesDir(app);

  function ensureDir() {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  function toRecord(row) {
    return {
      id: row.id,
      fileName: row.file_name,
      filePath: row.file_path,
      mimeType: row.mime_type || '',
      size: row.size || 0,
      description: row.description || '',
      folderId: row.folder_id || '',
      assetUrl: `lvcert-asset://green-report-images/${encodeURIComponent(row.file_path)}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function list(folderId) {
    const rows = folderId
      ? db.prepare('SELECT * FROM green_report_images WHERE folder_id = ? ORDER BY created_at DESC').all(folderId)
      : db.prepare('SELECT * FROM green_report_images ORDER BY created_at DESC').all();
    return rows.map(toRecord);
  }

  function getById(id) {
    const row = db.prepare('SELECT * FROM green_report_images WHERE id = ?').get(id);
    return row ? toRecord(row) : null;
  }

  async function addImages(folderId) {
    const targetFolderId = String(folderId || '').trim();
    if (!targetFolderId) {
      return { success: false, message: '请先在知识库选择企业文件夹', images: [] };
    }
    ensureDir();
    const result = await dialog.showOpenDialog({
      title: '选择图片素材',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, message: '已取消选择', images: list(targetFolderId) };
    }

    const ts = now();
    const inserted = [];
    const stmt = db.prepare('INSERT INTO green_report_images (id, file_name, file_path, mime_type, size, description, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const sourcePath of result.filePaths) {
      const ext = path.extname(sourcePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      const id = crypto.randomUUID();
      const fileName = `${id}${ext}`;
      const targetPath = path.join(imagesDir, fileName);
      await fsp.copyFile(sourcePath, targetPath);
      const stat = await fsp.stat(targetPath);
      stmt.run(id, path.basename(sourcePath), fileName, MIME_TYPES[ext] || '', stat.size, '', targetFolderId, ts, ts);
      inserted.push(id);
    }

    return {
      success: inserted.length > 0,
      message: inserted.length ? `已添加 ${inserted.length} 张图片，请补充描述` : '未选择支持的图片格式',
      images: list(targetFolderId),
    };
  }

  function updateImage({ id, description }) {
    const existing = db.prepare('SELECT id FROM green_report_images WHERE id = ?').get(id);
    if (!existing) throw new Error('图片素材不存在');
    db.prepare('UPDATE green_report_images SET description = ?, updated_at = ? WHERE id = ?').run(
      String(description || '').trim(),
      now(),
      id,
    );
    return getById(id);
  }

  async function deleteImage(id) {
    const record = getById(id);
    if (!record) return { success: false, message: '图片素材不存在', images: list() };
    const filePath = path.join(imagesDir, record.filePath);
    await fsp.rm(filePath, { force: true }).catch(() => undefined);
    db.prepare('DELETE FROM green_report_images WHERE id = ?').run(id);
    return { success: true, images: list() };
  }

  /** 删除某个知识库文件夹下的全部图片素材及文件。 */
  async function deleteImagesByFolder(folderId) {
    const records = list(folderId);
    db.prepare('DELETE FROM green_report_images WHERE folder_id = ?').run(folderId);
    for (const record of records) {
      await fsp.rm(path.join(imagesDir, record.filePath), { force: true }).catch(() => undefined);
    }
  }

  /** 正文生成使用的图片清单：按委托单位匹配知识库文件夹，只保留已填写描述的图片。 */
  function listForGeneration(companyName) {
    const name = String(companyName || '').trim();
    if (!name) return [];
    const folder = db.prepare('SELECT folder_id FROM knowledge_folders WHERE TRIM(name) = ? ORDER BY sort_order, created_at LIMIT 1').get(name);
    if (!folder) return [];
    return list(folder.folder_id).filter((item) => item.description.trim());
  }

  return {
    list,
    addImages,
    updateImage,
    deleteImage,
    deleteImagesByFolder,
    listForGeneration,
  };
}

module.exports = { createGreenReportImageService };
