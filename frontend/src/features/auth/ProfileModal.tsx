import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Tabs, Descriptions, message } from 'antd';
import { LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/formatters';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    if (user && open) {
      profileForm.setFieldsValue({
        full_name: user.full_name || '',
        avatar_url: user.avatar_url || ''
      });
      passwordForm.resetFields();
    }
  }, [user, open, profileForm, passwordForm]);

  const handleUpdateProfile = async (values: { full_name: string; avatar_url?: string }) => {
    setLoading(true);
    try {
      await api.user.updateProfile(values);
      message.success('Cập nhật thông tin thành công!');
      await refreshUser();
      onClose();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values: { current_password: string; new_password: string }) => {
    setLoading(true);
    try {
      await api.user.changePassword(values);
      message.success('Đổi mật khẩu thành công!');
      passwordForm.resetFields();
      onClose();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Thông tin tài khoản"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Tabs
        defaultActiveKey="info"
        items={[
          {
            key: 'info',
            label: 'Hồ sơ',
            children: (
              <div>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Tên người dùng">{user?.username}</Descriptions.Item>
                  <Descriptions.Item label="Email">{user?.email}</Descriptions.Item>
                  <Descriptions.Item label="Vai trò">{user?.role || 'User'}</Descriptions.Item>
                  <Descriptions.Item label="Ngày tạo">{formatDate(user?.created_at)}</Descriptions.Item>
                </Descriptions>

                <Form
                  form={profileForm}
                  layout="vertical"
                  onFinish={handleUpdateProfile}
                >
                  <Form.Item
                    name="full_name"
                    label="Họ và tên hiển thị"
                    rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
                  >
                    <Input prefix={<IdcardOutlined />} placeholder="Họ và tên" />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                    <Button onClick={onClose} style={{ marginRight: 8 }}>
                      Đóng
                    </Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      Lưu thay đổi
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            )
          },
          {
            key: 'security',
            label: 'Đổi mật khẩu',
            children: (
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={handleChangePassword}
              >
                <Form.Item
                  name="current_password"
                  label="Mật khẩu hiện tại"
                  rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu hiện tại" />
                </Form.Item>

                <Form.Item
                  name="new_password"
                  label="Mật khẩu mới"
                  rules={[
                    { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                    { min: 6, message: 'Mật khẩu mới tối thiểu 6 ký tự' }
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu mới" />
                </Form.Item>

                <Form.Item
                  name="confirm_password"
                  label="Xác nhận mật khẩu mới"
                  dependencies={['new_password']}
                  rules={[
                    { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('new_password') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                      }
                    })
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Xác nhận mật khẩu mới" />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                  <Button onClick={onClose} style={{ marginRight: 8 }}>
                    Hủy
                  </Button>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Đổi mật khẩu
                  </Button>
                </Form.Item>
              </Form>
            )
          }
        ]}
      />
    </Modal>
  );
};
