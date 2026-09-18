import React, { useState, useRef } from 'react';
import { Modal, Typography, Space, Alert } from 'antd';
import { CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import { useUpload, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../uploads/UploadContext';
import { formatBytes } from '../../lib/formatters';

const { Text } = Typography;

interface UploadModalProps {
  open: boolean;
  currentFolderId: string | null;
  onClose: () => void;
  onUploadStarted?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  open,
  currentFolderId,
  onClose,
  onUploadStarted
}) => {
  const { startUpload } = useUpload();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setValidationError('Định dạng tệp không được hỗ trợ. Chỉ hỗ trợ PDF, JPEG, PNG hoặc TXT.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setValidationError(`Dung lượng tệp vượt quá giới hạn 50 MiB (Kích thước hiện tại: ${formatBytes(file.size)}).`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    const fileToUpload = selectedFile;
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
    if (onUploadStarted) {
      onUploadStarted();
    }
    await startUpload(fileToUpload, currentFolderId);
  };

  return (
    <Modal
      title={
        <span>
          <CloudUploadOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Tải tệp lên đám mây (S3 Direct)
        </span>
      }
      open={open}
      onOk={handleStartUpload}
      okButtonProps={{ disabled: !selectedFile }}
      okText="Bắt đầu tải lên"
      cancelText="Hủy"
      onCancel={() => {
        setSelectedFile(null);
        setValidationError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        onClose();
      }}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed #d9d9d9',
            borderRadius: 8,
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: '#fafafa',
            transition: 'border-color 0.3s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1677ff')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d9d9d9')}
        >
          <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <p style={{ marginTop: 12, marginBottom: 4, fontWeight: 500 }}>
            Nhấp chuột để chọn tệp từ máy tính
          </p>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Hỗ trợ định dạng: PDF, JPEG, PNG, TXT (Dung lượng tối đa: 50 MiB)
          </Text>
        </div>
      </div>

      {validationError && (
        <Alert
          message={validationError}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedFile && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderRadius: 6
          }}
        >
          <Space direction="vertical" size={2}>
            <Text strong>Tệp đã chọn: {selectedFile.name}</Text>
            <Text type="secondary">Dung lượng: {formatBytes(selectedFile.size)}</Text>
            <Text type="secondary">Loại: {selectedFile.type || 'Không xác định'}</Text>
          </Space>
        </div>
      )}
    </Modal>
  );
};
