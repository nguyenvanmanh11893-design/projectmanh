import React from 'react';
import {
  FilePdfOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FileOutlined,
  FolderOutlined
} from '@ant-design/icons';

interface FileIconProps {
  extension?: string;
  mimeType?: string;
  isFolder?: boolean;
  style?: React.CSSProperties;
}

export const FileIcon: React.FC<FileIconProps> = ({ extension, mimeType, isFolder, style }) => {
  const customStyle: React.CSSProperties = { fontSize: 20, ...style };

  if (isFolder) {
    return <FolderOutlined style={{ ...customStyle, color: '#faad14' }} />;
  }

  const ext = (extension || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return <FilePdfOutlined style={{ ...customStyle, color: '#ff4d4f' }} />;
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || mime.startsWith('image/')) {
    return <FileImageOutlined style={{ ...customStyle, color: '#52c41a' }} />;
  }

  if (ext === 'txt' || mime.startsWith('text/')) {
    return <FileTextOutlined style={{ ...customStyle, color: '#1677ff' }} />;
  }

  return <FileOutlined style={{ ...customStyle, color: '#8c8c8c' }} />;
};
