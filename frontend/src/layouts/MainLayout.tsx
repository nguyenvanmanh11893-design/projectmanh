import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout,
  Menu,
  Button,
  Progress,
  Typography,
  Dropdown,
  Space,
  Avatar,
  Badge,
  Drawer,
  Grid
} from 'antd';
import type { MenuProps } from 'antd';
import {
  FolderOutlined,
  DeleteOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  CloudUploadOutlined,
  CloudServerOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { useUpload } from '../features/uploads/UploadContext';
import { api } from '../lib/api';
import type { StorageUsage } from '../lib/types';
import { formatBytes } from '../lib/formatters';
import { ProfileModal } from '../features/auth/ProfileModal';
import { UploadListDrawer } from '../features/uploads/UploadListDrawer';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const { user, logout } = useAuth();
  const { uploads, registerCompletionListener } = useUpload();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);

  // Active uploads count (ongoing or pending)
  const activeUploadsCount = uploads.filter(
    (u) => u.status === 'uploading' || u.status === 'validating' || u.status === 'preparing'
  ).length;

  const fetchStorage = useCallback(async () => {
    try {
      const data = await api.storage.getUsage();
      setStorageUsage(data);
    } catch {
      // Storage usage may not be critical
    }
  }, []);

  useEffect(() => {
    fetchStorage();
    const interval = setInterval(fetchStorage, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchStorage]);

  useEffect(() => {
    const unregister = registerCompletionListener(() => {
      fetchStorage();
    });
    return unregister;
  }, [registerCompletionListener, fetchStorage]);

  // Derive active menu key from location pathname
  const activeMenuKey = location.pathname.startsWith('/trash')
    ? 'trash'
    : location.pathname.startsWith('/activity')
    ? 'activity'
    : 'drive';

  const menuItems: MenuProps['items'] = [
    {
      key: 'drive',
      icon: <FolderOutlined />,
      label: 'Tệp của tôi',
      onClick: () => {
        navigate('/drive');
        if (isMobile) setMobileMenuOpen(false);
      }
    },
    {
      key: 'trash',
      icon: <DeleteOutlined />,
      label: 'Thùng rác',
      onClick: () => {
        navigate('/trash');
        if (isMobile) setMobileMenuOpen(false);
      }
    },
    {
      key: 'activity',
      icon: <HistoryOutlined />,
      label: 'Hoạt động',
      onClick: () => {
        navigate('/activity');
        if (isMobile) setMobileMenuOpen(false);
      }
    }
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Tài khoản của tôi',
      onClick: () => setProfileModalOpen(true)
    },
    {
      type: 'divider'
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: async () => {
        await logout();
        navigate('/auth');
      }
    }
  ];

  // Storage calculation
  const used = Number(storageUsage?.used_bytes || 0);
  const reserved = Number(storageUsage?.reserved_bytes || 0);
  const quota = Number(storageUsage?.quota_bytes || 1);
  const usedPercent = Math.min(100, Math.round(((used + reserved) / quota) * 100));

  const SidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand logo */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderBottom: '1px solid #f0f0f0'
        }}
      >
        <CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />
        <span style={{ fontWeight: 600, fontSize: 16, color: '#262626' }}>
          Cloud Manager
        </span>
      </div>

      {/* Main navigation */}
      <div style={{ flex: 1, paddingTop: 12 }}>
        <Menu
          mode="inline"
          selectedKeys={[activeMenuKey]}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </div>

      {/* Storage quota card */}
      <div
        style={{
          padding: '16px',
          margin: '12px',
          backgroundColor: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text strong style={{ fontSize: 13 }}>
            Dung lượng lưu trữ
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {usedPercent}%
          </Text>
        </div>
        <Progress
          percent={usedPercent}
          showInfo={false}
          size="small"
          strokeColor={usedPercent > 90 ? '#ff4d4f' : '#1677ff'}
        />
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatBytes(used)}
            {reserved > 0 ? ` (+${formatBytes(reserved)})` : ''} / {formatBytes(quota)}
          </Text>
        </div>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          width={240}
          theme="light"
          style={{
            borderRight: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            height: '100vh'
          }}
        >
          {SidebarContent}
        </Sider>
      )}

      {/* Mobile Drawer Menu */}
      {isMobile && (
        <Drawer
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          bodyStyle={{ padding: 0 }}
          width={260}
        >
          {SidebarContent}
        </Drawer>
      )}

      <Layout>
        {/* Header */}
        <Header
          style={{
            padding: '0 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}
        >
          <Space>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
              />
            )}
            <span style={{ fontWeight: 600, fontSize: 16 }}>
              {activeMenuKey === 'drive'
                ? 'Tệp của tôi'
                : activeMenuKey === 'trash'
                ? 'Thùng rác'
                : 'Lịch sử hoạt động'}
            </span>
          </Space>

          <Space size="middle">
            {/* Upload Drawer Toggle Button */}
            <Badge count={activeUploadsCount} overflowCount={99}>
              <Button
                icon={<CloudUploadOutlined />}
                onClick={() => setUploadDrawerOpen(true)}
              >
                {!isMobile && 'Tiến trình tải lên'}
                {uploads.length > 0 && isMobile ? ` (${uploads.length})` : ''}
              </Button>
            </Badge>

            {/* User Profile Dropdown */}
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <Button type="text" style={{ padding: '4px 8px' }}>
                <Space>
                  <Avatar
                    style={{ backgroundColor: '#1677ff' }}
                    icon={<UserOutlined />}
                    src={user?.avatar_url}
                  />
                  {!isMobile && (
                    <span style={{ fontWeight: 500 }}>
                      {user?.full_name || user?.username}
                    </span>
                  )}
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        {/* Content */}
        <Content style={{ margin: '16px', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>

      {/* Global Modals / Drawers */}
      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />

      <UploadListDrawer
        open={uploadDrawerOpen}
        onClose={() => setUploadDrawerOpen(false)}
      />
    </Layout>
  );
};
