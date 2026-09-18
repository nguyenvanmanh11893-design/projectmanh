import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Card,
  Tag,
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
  SearchOutlined,
  UndoOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import type { FileItem } from '../../lib/types';
import { formatBytes, formatDate, formatFileStatus } from '../../lib/formatters';
import { FileIcon } from '../../components/FileIcon';

export const TrashPage: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters and pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TRASHED' | 'PURGE_PENDING'>('ALL');
  const [sort, setSort] = useState<'trashed_at' | 'file_name' | 'file_size'>('trashed_at');
  const [direction, setDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

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
      const res = await api.files.listTrash({
        search: debouncedSearch || undefined,
        status: statusFilter,
        sort,
        direction,
        limit: 25,
        cursor: cursor || undefined
      });
      setFiles(res.items || []);
      setNextCursor(res.next_cursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách thùng rác');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, sort, direction, cursor]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleRestore = async (file: FileItem) => {
    try {
      await api.files.restore(file.id);
      message.success(`Đã khôi phục tệp "${file.file_name}"!`);
      loadData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Khôi phục tệp thất bại');
    }
  };

  const handlePermanentDelete = (file: FileItem) => {
    Modal.confirm({
      title: `Xác nhận xóa vĩnh viễn tệp "${file.file_name}"?`,
      content: 'Hành động này KHÔNG THỂ khôi phục. Dữ liệu trên bộ lưu trữ đám mây sẽ được xóa hoàn toàn.',
      okText: 'Xóa vĩnh viễn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.files.permanentDelete(file.id);
          message.success('Đã gửi yêu cầu xóa vĩnh viễn. Tệp sẽ được hệ thống xử lý hoàn tất.');
          loadData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : 'Xóa vĩnh viễn thất bại');
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
      width: 170,
      render: (status: string) => {
        const info = formatFileStatus(status);
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: 'Ngày đưa vào thùng rác',
      dataIndex: 'trashed_at',
      key: 'trashed_at',
      width: 190,
      render: (date: string) => formatDate(date)
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_, record: FileItem) => {
        const canRestore = record.status === 'TRASHED';
        const canPurge = record.status === 'TRASHED' || record.status === 'PURGE_PENDING';

        return (
          <Space size="small">
            {canRestore && (
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={() => handleRestore(record)}
              >
                Khôi phục
              </Button>
            )}
            {canPurge && (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handlePermanentDelete(record)}
              >
                Xóa vĩnh viễn
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div>
      <Card
        size="small"
        bordered={false}
        style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[12, 12]} justify="space-between" align="middle">
          <Col xs={24} md={8}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>
              🗑️ Thùng rác
            </span>
          </Col>

          <Col xs={24} md={16}>
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Input
                placeholder="Tìm kiếm trong thùng rác..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={search}
                onChange={handleSearchChange}
                allowClear
                style={{ width: 190 }}
              />

              <Select
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setCursor(null);
                  setCursorHistory([]);
                  setCurrentPage(1);
                }}
                style={{ width: 160 }}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  { value: 'TRASHED', label: 'Đã vào thùng rác' },
                  { value: 'PURGE_PENDING', label: 'Chờ xóa vĩnh viễn' }
                ]}
              />

              <Select
                value={sort}
                onChange={(val) => {
                  setSort(val);
                  setCursor(null);
                  setCursorHistory([]);
                  setCurrentPage(1);
                }}
                style={{ width: 150 }}
                options={[
                  { value: 'trashed_at', label: 'Thời gian xóa' },
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
          message="Không thể tải danh sách thùng rác"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
        bodyStyle={{ padding: '0 0 16px 0' }}
      >
        <div style={{ padding: '16px 16px 8px 16px', fontWeight: 600, fontSize: 14, color: '#595959' }}>
          Tệp trong thùng rác ({files.length})
        </div>

        {loading && files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin tip="Đang tải dữ liệu..." />
          </div>
        ) : files.length === 0 ? (
          <Empty
            description={
              debouncedSearch ? 'Không tìm thấy tệp nào phù hợp' : 'Thùng rác đang trống'
            }
            style={{ padding: '40px 0' }}
          />
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
    </div>
  );
};
