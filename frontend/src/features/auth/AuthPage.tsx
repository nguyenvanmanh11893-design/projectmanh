import React, { useState } from 'react';
import { Card, Tabs, Form, Input, Button, Typography, Alert, Space } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  IdcardOutlined,
  KeyOutlined,
  CloudServerOutlined
} from '@ant-design/icons';
import { useAuth } from './AuthContext';

const { Title, Text } = Typography;

export const AuthPage: React.FC = () => {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(values);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    invitation_token?: string;
  }) => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await register(values);
      setSuccessMessage('Đăng ký tài khoản thành công! Vui lòng chuyển sang tab Đăng nhập.');
      registerForm.resetFields();
      setActiveTab('login');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f2f5',
        padding: '24px'
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical" align="center" size={4}>
            <CloudServerOutlined style={{ fontSize: 44, color: '#1677ff' }} />
            <Title level={3} style={{ margin: '8px 0 0' }}>
              Cloud File Manager
            </Title>
            <Text type="secondary">Hệ thống lưu trữ và quản lý tệp tin đám mây</Text>
          </Space>
        </div>

        <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {errorMessage && (
            <Alert
              message={errorMessage}
              type="error"
              showIcon
              closable
              onClose={() => setErrorMessage(null)}
              style={{ marginBottom: 16 }}
            />
          )}

          {successMessage && (
            <Alert
              message={successMessage}
              type="success"
              showIcon
              closable
              onClose={() => setSuccessMessage(null)}
              style={{ marginBottom: 16 }}
            />
          )}

          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key as 'login' | 'register');
              setErrorMessage(null);
            }}
            centered
            items={[
              {
                key: 'login',
                label: 'Đăng nhập',
                children: (
                  <Form
                    form={loginForm}
                    layout="vertical"
                    onFinish={handleLogin}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="username"
                      label="Tên đăng nhập hoặc Email"
                      rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập hoặc email' }]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="Nhập username hoặc email"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      label="Mật khẩu"
                      rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="Nhập mật khẩu"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                        size="large"
                      >
                        Đăng nhập
                      </Button>
                    </Form.Item>
                  </Form>
                )
              },
              {
                key: 'register',
                label: 'Đăng ký',
                children: (
                  <Form
                    form={registerForm}
                    layout="vertical"
                    onFinish={handleRegister}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="full_name"
                      label="Họ và tên"
                      rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
                    >
                      <Input
                        prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="Nguyễn Văn A"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="username"
                      label="Tên đăng nhập"
                      rules={[
                        { required: true, message: 'Vui lòng nhập tên đăng nhập' },
                        { min: 3, message: 'Tên đăng nhập tối thiểu 3 ký tự' }
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="username"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[
                        { required: true, message: 'Vui lòng nhập email' },
                        { type: 'email', message: 'Email không đúng định dạng' }
                      ]}
                    >
                      <Input
                        prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="name@example.com"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      label="Mật khẩu"
                      rules={[
                        { required: true, message: 'Vui lòng nhập mật khẩu' },
                        { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="Mật khẩu ít nhất 6 ký tự"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="invitation_token"
                      label="Mã mời (nếu có)"
                    >
                      <Input
                        prefix={<KeyOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="Nhập mã mời nếu quản trị viên cung cấp"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                        size="large"
                      >
                        Tạo tài khoản
                      </Button>
                    </Form.Item>
                  </Form>
                )
              }
            ]}
          />
        </Card>
      </div>
    </div>
  );
};
