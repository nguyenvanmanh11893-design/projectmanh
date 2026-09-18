import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Select, Spin, message } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import type { FileItem } from '../../lib/types';

interface MoveModalProps {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FolderOption {
  id: string | null;
  name: string;
}

export const MoveModal: React.FC<MoveModalProps> = ({
  open,
  file,
  onClose,
  onSuccess
}) => {
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [moving, setMoving] = useState(false);
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const fetchFolderTree = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const options: FolderOption[] = [{ id: null, name: '📁 Tệp của tôi (Thư mục gốc)' }];
      const visited = new Set<string>();

      const walk = async (parentId: string | null, depth: number) => {
        if (depth > 8) return;
        const data = parentId ? await api.folders.getById(parentId) : await api.folders.getRoot();
        const list = parentId ? (data as { subfolders?: Array<{ id: string; name: string }> }).subfolders || [] : (data as Array<{ id: string; name: string }>);

        for (const item of list) {
          if (!visited.has(item.id)) {
            visited.add(item.id);
            const prefix = '— '.repeat(depth + 1);
            options.push({
              id: item.id,
              name: `${prefix}📁 ${item.name}`
            });
            await walk(item.id, depth + 1);
          }
        }
      };

      await walk(null, 0);
      setFolderOptions(options);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể tải danh sách thư mục');
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (open && file) {
      setSelectedFolderId(file.folder_id);
      fetchFolderTree();
    }
  }, [open, file, fetchFolderTree]);

  const handleOk = async () => {
    if (!file) return;
    setMoving(true);
    try {
      await api.files.move(file.id, selectedFolderId);
      message.success('Di chuyển tệp thành công!');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Di chuyển tệp thất bại');
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <FolderOpenOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Di chuyển tệp &ldquo;{file?.file_name}&rdquo;
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={moving}
      okText="Di chuyển đến đây"
      cancelText="Hủy"
      destroyOnClose
    >
      {loadingFolders ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin tip="Đang tải danh mục thư mục..." />
        </div>
      ) : (
        <Form layout="vertical">
          <Form.Item label="Chọn thư mục đích">
            <Select
              value={selectedFolderId}
              onChange={(val) => setSelectedFolderId(val)}
              style={{ width: '100%' }}
              options={folderOptions.map((f) => ({
                value: f.id,
                label: f.name
              }))}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};
