import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Card,
  Tag,
  Empty,
  Spin,
  Alert,
  Tooltip
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HistoryOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import type { AuditEvent } from '../../lib/types';
import { formatDate, formatActivityAction } from '../../lib/formatters';

export const ActivityPage: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.activity.list({
        limit: 25,
        cursor: cursor || undefined
      });
      setEvents(res.items || []);
      setNextCursor(res.next_cursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch sử hoạt động');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

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

  const getActionColor = (action: string) => {
    if (action.includes('uploaded') || action.includes('created')) return 'blue';
    if (action.includes('renamed') || action.includes('moved')) return 'orange';
    if (action.includes('restored')) return 'green';
    if (action.includes('deleted') || action.includes('trashed') || action.includes('purge')) return 'red';
    return 'default';
  };

  const columns: ColumnsType<AuditEvent> = [
    {
      title: 'Hành động',
      dataIndex: 'action',
      key: 'action',
      width: 200,
      render: (action: string) => (
        <Tag color={getActionColor(action)} style={{ fontWeight: 500 }}>
          {formatActivityAction(action)}
        </Tag>
      )
    },
    {
      title: 'Đối tượng',
      dataIndex: 'resource_type',
      key: 'resource_type',
      width: 120,
      render: (type: string) => (
        <span style={{ textTransform: 'capitalize' }}>
          {type === 'file' ? 'Tệp' : type === 'folder' ? 'Thư mục' : type}
        </span>
      )
    },
    {
      title: 'Chi tiết',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (meta: Record<string, unknown>, record: AuditEvent) => {
        const parts: string[] = [];
        if (meta?.file_name) parts.push(`Tên: ${meta.file_name}`);
        if (meta?.name) parts.push(`Tên: ${meta.name}`);
        if (meta?.folder_id) parts.push(`Thư mục đích: ${meta.folder_id}`);
        if (parts.length > 0) {
          return <span>{parts.join(' | ')}</span>;
        }
        return <span style={{ color: '#8c8c8c' }}>ID: {record.resource_id}</span>;
      }
    },
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      render: (date: string) => formatDate(date)
    }
  ];

  return (
    <div>
      <Card
        size="small"
        bordered={false}
        style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>
            <HistoryOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Lịch sử hoạt động
          </span>
          <Tooltip title="Làm mới">
            <Button
              icon={<ReloadOutlined />}
              onClick={loadData}
              loading={loading}
            />
          </Tooltip>
        </div>
      </Card>

      {error && (
        <Alert
          message="Không thể tải lịch sử hoạt động"
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
        {loading && events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin tip="Đang tải dữ liệu hoạt động..." />
          </div>
        ) : events.length === 0 ? (
          <Empty description="Chưa có hoạt động nào được ghi lại" style={{ padding: '40px 0' }} />
        ) : (
          <Table
            columns={columns}
            dataSource={events}
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
