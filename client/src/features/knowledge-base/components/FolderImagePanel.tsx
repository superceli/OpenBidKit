import { useEffect, useState } from 'react';
import { AppDialog, useToast } from '../../../shared/ui';
import type { ImageLibraryItem } from '../../../shared/types/imageLibrary';

interface FolderImagePanelProps {
  folderId: string;
}

function FolderImagePanel({ folderId }: FolderImagePanelProps) {
  const { showToast } = useToast();
  const [images, setImages] = useState<ImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingDeleteImage = images.find((item) => item.id === pendingDeleteId) ?? null;

  const refreshImages = async () => {
    if (!folderId) {
      setImages([]);
      return;
    }
    try {
      const items = await window.lvcert?.imageLibrary?.list(folderId);
      setImages(items || []);
    } catch (error) {
      showToast(`加载图片失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  useEffect(() => {
    void refreshImages();
  }, [folderId]);

  const handleAddImages = async () => {
    if (!folderId) {
      showToast('请先在左侧选择企业文件夹', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await window.lvcert.imageLibrary.addImages(folderId);
      setImages(result.images || []);
      if (result.success) {
        showToast(result.message || '图片已添加', 'success');
      } else if (result.message) {
        showToast(result.message, 'info');
      }
    } catch (error) {
      showToast(`添加图片失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDescriptionChange = (id: string, description: string) => {
    setImages((prev) => prev.map((item) => (item.id === id ? { ...item, description } : item)));
  };

  const handleDescriptionSave = async (id: string, description: string) => {
    try {
      const updated = await window.lvcert.imageLibrary.updateImage({ id, description });
      setImages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      showToast(`保存图片描述失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await window.lvcert.imageLibrary.deleteImage(pendingDeleteId);
      await refreshImages();
      showToast('图片已删除', 'success');
    } catch (error) {
      showToast(`删除图片失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <>
      <div className="knowledge-image-library">
        <div className="knowledge-image-toolbar">
          <span className="knowledge-image-count">{images.length ? `共 ${images.length} 张图片` : '暂无图片'}</span>
          <button
            type="button"
            className="primary-action knowledge-image-upload"
            onClick={handleAddImages}
            disabled={loading || !folderId}
          >
            {loading ? '上传中...' : '上传图片'}
          </button>
        </div>
        {images.length === 0 ? (
          <div className="knowledge-image-empty">
            当前文件夹还没有图片。点击“上传图片”添加，并填写每张图片的描述。
          </div>
        ) : (
          <div className="knowledge-image-grid">
            {images.map((image) => (
              <div className="knowledge-image-card" key={image.id}>
                <img
                  className="knowledge-image-thumb"
                  src={image.assetUrl}
                  alt={image.description || image.fileName}
                />
                <div className="knowledge-image-name" title={image.fileName}>{image.fileName}</div>
                <textarea
                  className="knowledge-image-desc"
                  value={image.description}
                  placeholder="填写图片描述，例如：公司营业执照正本，统一社会信用代码 91..."
                  onChange={(e) => handleDescriptionChange(image.id, e.target.value)}
                  onBlur={(e) => void handleDescriptionSave(image.id, e.target.value)}
                />
                <div className="knowledge-image-actions">
                  <button
                    type="button"
                    className="knowledge-image-delete"
                    onClick={() => setPendingDeleteId(image.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AppDialog
        open={Boolean(pendingDeleteId)}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="删除图片素材"
        description={pendingDeleteImage
          ? `确定删除“${pendingDeleteImage.fileName}”吗？已生成正文中的图片不会自动移除。`
          : '确定删除这张图片素材吗？'}
        actions={(
          <>
            <button className="secondary-action" onClick={() => setPendingDeleteId(null)}>取消</button>
            <button className="danger-action" onClick={() => void handleDelete()}>删除</button>
          </>
        )}
      />
    </>
  );
}

export default FolderImagePanel;
