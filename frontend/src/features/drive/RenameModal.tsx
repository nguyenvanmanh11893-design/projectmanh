import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export type RenameItemType = 'file' | 'folder';

interface RenameModalProps {
  open: boolean;
  type: RenameItemType;
  item: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  open,
  type,
  item,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item) {
      form.setFieldsValue({ name: item.name });
    }
  }, [open, item, form]);

  const handleOk = async () => {
    if (!item) return;
    try {
      const values = await form.validateFields();
      setLoading(true);
      const newName = values.name.trim();

      if (type === 'file') {
        await api.files.rename(item.id, newName);
        message.success('Đổi tên tệp thành công!');
      } else {
        await api.folders.rename(item.id, newName);
        message.success('Đổi tên thư mục thành công!');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'ValidationError') {
        message.error(err.message || 'Đổi tên thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  const title = type === 'file' ? 'Đổi tên tệp' : 'Đổi tên thư mục';

  return (
    <Modal
      title={
        <span>
          <EditOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          {title}
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={loading}
      okText="Lưu"
      cancelText="Hủy"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={type === 'file' ? 'Tên tệp mới' : 'Tên thư mục mới'}
          rules={[
            { required: true, message: 'Vui lòng nhập tên mới' },
            { max: 255, message: 'Tên không quá 255 ký tự' }
          ]}
        >
          <Input placeholder="Nhập tên mới" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};
