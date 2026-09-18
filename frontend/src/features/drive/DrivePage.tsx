import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Breadcrumb,
  Space,
  Card,
  Tag,
  Dropdown,
  Modal,
  Empty,
  Spin,
  Alert,
  message,
  Row,
  Col,
  Tooltip
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  FolderOutlined,
  FolderAddOutlined,
  CloudUploadOutlined,
  SearchOutlined,
  MoreOutlined,
  DownloadOutlined,
  EditOutlined,
  DragOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import type { FileItem, Folder, BreadcrumbItem } from '../../lib/types';
import { formatBytes, formatDate, formatFileStatus } from '../../lib/formatters';
import { FileIcon } from '../../components/FileIcon';
import { CreateFolderModal } from './CreateFolderModal';
import { RenameModal, RenameItemType } from './RenameModal';
import { MoveModal } from './MoveModal';
import { UploadModal } from './UploadModal';
import { useUpload } from '../uploads/UploadContext';

export const DrivePage: React.FC = () => {
  const { registerCompletionListener } = useUpload();

  // Navigation / folder state
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: 'Tệp của tôi' }
  ]);
  const currentFolderId = crumbs[crumbs.length - 1].id;

  // Data state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters and pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<'created_at' | 'updated_at' | 'file_name' | 'file_size'>('created_at');
  const [direction, setDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameState, setRenameState] = useState<{
    open: boolean;
    type: RenameItemType;
    item: { id: string; name: string } | null;
  }>({
    open: false,
    type: 'file',
    item: null
  });
  const [moveFile, setMoveFile] = useState<FileItem | null>(null);

  // Debounce search
  const searchTimerRef = useRef<NodeJS.Timeout>();
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val.trim());
      setCursor(null);
      setCursorHistory([]);
      setCurrentPage(1);
    }, 350);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch folders
      const folderPromise = currentFolderId
        ? api.folders.getById(currentFolderId).then((res) => (res.subfolders || []))
        : api.folders.getRoot();

      // 2. Fetch files
      const filePromise = api.files.list({
        folder_id: currentFolderId,
        search: debouncedSearch || undefined,
        sort,
        direction,
        limit: 25,
        cursor: cursor || undefined
      });

      const [folderList, fileResponse] = await Promise.all([folderPromise, filePromise]);

      setFolders(folderList);
      setFiles(fileResponse.items || []);
      setNextCursor(fileResponse.next_cursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, debouncedSearch, sort, direction, cursor]);

  // Load when parameters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for upload completion to automatically reload files!
  useEffect(() => {
    const unregister = registerCompletionListener(() => {
      loadData();
    });
    return unregister;
  }, [registerCompletionListener, loadData]);

  // Handle folder navigation
  const handleOpenFolder = (folder: Folder) => {
    setCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setCursor(null);
    setCursorHistory([]);
    setCurrentPage(1);
  };

  const handleCrumbClick = (index: number) => {
    setCrumbs((prev) => prev.slice(0, index + 1));
    setCursor(null);
    setCursorHistory([]);
    setCurrentPage(1);
  };

  // Pagination handlers
  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, cursor]);
    setCursor(nextCursor);
    setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage <= 1) return;
    const prevHistory = [...cursorHistory];
    const prevCursor = prevHistory.pop() ?? null;
    setCursorHistory(prevHistory);
    setCursor(prevCursor);
    setCurrentPage((prev) => prev - 1);
  };

  // Folder actions
  const handleDeleteFolder = (folder: Folder) => {
    Modal.confirm({
      title: `Xác nhận xóa thư mục "${folder.name}"?`,
      content: 'Thư mục phải hoàn toàn rỗng (không chứa tệp hoặc thư mục con).',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.folders.delete(folder.id);
          message.success('Đã xóa thư mục!');
          loadData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : 'Xóa thư mục thất bại');
        }
      }
    });
  };

  // File actions
  const handleDownload = async (file: FileItem) => {
    try {
      const res = await api.files.download(file.id);
      window.open(res.download_url, '_blank', 'noopener');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Tải xuống thất bại');
    }
  };

  const handleTrashFile = (file: FileItem) => {
    Modal.confirm({
      title: `Chuyển "${file.file_name}" vào thùng rác?`,
      content: 'Tệp sẽ được giữ trong thùng rác và tự động xóa sau 7 ngày.',
      okText: 'Chuyển vào thùng rác',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.files.trash(file.id);
          message.success('Đã chuyển tệp vào thùng rác!');
          loadData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : 'Chuyển tệp vào thùng rác thất bại');
        }
      }
    });
  };

  const columns: ColumnsType<FileItem> = [
    {
      title: 'Tên tệp',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (name: string, record: FileItem) => (
        <Space>
          <FileIcon extension={record.extension} mimeType={record.mime_type} />
          <span style={{ fontWeight: 500 }}>{name}</span>
        </Space>
      )
    },
    {
      title: 'Dung lượng',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 130,
      render: (size: number) => formatBytes(size)
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        const info = formatFileStatus(status);
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: 'Thời gian sửa',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (date: string) => formatDate(date)
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 90,
      align: 'center',
      render: (_, record: FileItem) => {
        const isReady = record.status === 'READY';
        const items = [
          {
            key: 'download',
            label: 'Tải xuống',
            icon: <DownloadOutlined />,
            disabled: !isReady,
            onClick: () => handleDownload(record)
          },
          {
            key: 'rename',
            label: 'Đổi tên',
            icon: <EditOutlined />,
            onClick: () =>
              setRenameState({
                open: true,
                type: 'file',
                item: { id: record.id, name: record.file_name }
              })
          },
          {
            key: 'move',
            label: 'Di chuyển',
            icon: <DragOutlined />,
            onClick: () => setMoveFile(record)
          },
          {
            type: 'divider' as const
          },
          {
            key: 'trash',
            label: 'Đưa vào thùng rác',
            icon: <DeleteOutlined />,
            danger: true,
            disabled: !isReady,
            onClick: () => handleTrashFile(record)
          }
        ];

        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button type="text" shape="circle" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  return (
    <div>
      {/* Top action bar */}
      <Card
        size="small"
        bordered={false}
        style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[12, 12]} justify="space-between" align="middle">
          <Col xs={24} md={10}>
            <Breadcrumb
              items={crumbs.map((crumb, idx) => ({
                title: (
                  <span
                    onClick={() => handleCrumbClick(idx)}
                    style={{
                      cursor: 'pointer',
                      fontWeight: idx === crumbs.length - 1 ? 600 : 400,
                      color: idx === crumbs.length - 1 ? '#262626' : '#1677ff'
                    }}
                  >
                    {idx === 0 ? '📁 ' : ''}
                    {crumb.name}
                  </span>
                )
              }))}
            />
          </Col>

          <Col xs={24} md={14}>
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Input
                placeholder="Tìm kiếm tệp..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={search}
                onChange={handleSearchChange}
                allowClear
                style={{ width: 180 }}
              />

              <Select
                value={sort}
                onChange={(val) => {
                  setSort(val);
                  setCursor(null);
                  setCursorHistory([]);
                  setCurrentPage(1);
                }}
                style={{ width: 140 }}
                options={[
                  { value: 'created_at', label: 'Thời gian tạo' },
                  { value: 'updated_at', label: 'Thời gian sửa' },
                  { value: 'file_name', label: 'Tên tệp' },
                  { value: 'file_size', label: 'Dung lượng' }
                ]}
              />

              <Select
                value={direction}
                onChange={(val) => {
                  setDirection(val);
                  setCursor(null);
                  setCursorHistory([]);
                  setCurrentPage(1);
                }}
                style={{ width: 110 }}
                options={[
                  { value: 'DESC', label: 'Giảm dần' },
                  { value: 'ASC', label: 'Tăng dần' }
                ]}
              />

              <Button
                icon={<FolderAddOutlined />}
                onClick={() => setCreateFolderOpen(true)}
              >
                Tạo thư mục
              </Button>

              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                onClick={() => setUploadOpen(true)}
              >
                Tải tệp lên
              </Button>

              <Tooltip title="Làm mới">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={loadData}
                  loading={loading}
                />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert
          message="Không thể tải dữ liệu"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Folders Section */}
      {folders.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#595959', marginBottom: 8 }}>
            Thư mục ({folders.length})
          </div>
          <Row gutter={[12, 12]}>
            {folders.map((folder) => (
              <Col xs={24} sm={12} md={8} lg={6} key={folder.id}>
                <Card
                  size="small"
                  hoverable
                  bodyStyle={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px'
                  }}
                  style={{ borderRadius: 6 }}
                >
                  <Space
                    style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={() => handleOpenFolder(folder)}
                  >
                    <FolderOutlined style={{ fontSize: 22, color: '#faad14' }} />
                    <span
                      style={{
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                        maxWidth: 160
                      }}
                    >
                      {folder.name}
                    </span>
                  </Space>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'rename',
                          label: 'Đổi tên',
                          icon: <EditOutlined />,
                          onClick: () =>
                            setRenameState({
                              open: true,
                              type: 'folder',
                              item: { id: folder.id, name: folder.name }
                            })
                        },
                        {
                          key: 'delete',
                          label: 'Xóa',
                          icon: <DeleteOutlined />,
                          danger: true,
                          onClick: () => handleDeleteFolder(folder)
                        }
                      ]
                    }}
                    trigger={['click']}
                  >
                    <Button type="text" shape="circle" size="small" icon={<MoreOutlined />} />
                  </Dropdown>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* Files Section */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
        bodyStyle={{ padding: '0 0 16px 0' }}
      >
        <div style={{ padding: '16px 16px 8px 16px', fontWeight: 600, fontSize: 14, color: '#595959' }}>
          Tệp ({files.length})
        </div>

        {loading && files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin tip="Đang tải danh sách tệp..." />
          </div>
        ) : files.length === 0 && folders.length === 0 ? (
          <Empty
            description={
              debouncedSearch ? 'Không tìm thấy tệp nào phù hợp' : 'Thư mục này hiện chưa có dữ liệu'
            }
            style={{ padding: '40px 0' }}
          >
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              Tải tệp lên ngay
            </Button>
          </Empty>
        ) : (
          <Table
            columns={columns}
            dataSource={files}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 600 }}
          />
        )}

        {/* Pagination Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 16px 0 16px',
            borderTop: '1px solid #f0f0f0',
            marginTop: 8
          }}
        >
          <span style={{ color: '#8c8c8c', fontSize: 13 }}>
            Trang {currentPage}
          </span>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || loading}
            >
              Trang trước
            </Button>
            <Button
              onClick={handleNextPage}
              disabled={!nextCursor || loading}
            >
              Trang sau <ArrowRightOutlined />
            </Button>
          </Space>
        </div>
      </Card>

      {/* Modals */}
      <CreateFolderModal
        open={createFolderOpen}
        parentId={currentFolderId}
        onClose={() => setCreateFolderOpen(false)}
        onSuccess={loadData}
      />

      <RenameModal
        open={renameState.open}
        type={renameState.type}
        item={renameState.item}
        onClose={() => setRenameState({ open: false, type: 'file', item: null })}
        onSuccess={loadData}
      />

      <MoveModal
        open={!!moveFile}
        file={moveFile}
        onClose={() => setMoveFile(null)}
        onSuccess={loadData}
      />

      <UploadModal
        open={uploadOpen}
        currentFolderId={currentFolderId}
        onClose={() => setUploadOpen(false)}
      />
    </div>
  );
};
