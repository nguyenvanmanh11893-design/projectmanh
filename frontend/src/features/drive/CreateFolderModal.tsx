import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { FolderAddOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

interface CreateFolderModalProps {
  open: boolean;
  parentId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  open,
  parentId,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await api.folders.create({
        name: values.name.trim(),
        parent_id: parentId
      });
      message.success('Tạo thư mục thành công!');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'ValidationError') {
        message.error(err.message || 'Tạo thư mục thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <FolderAddOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Tạo thư mục mới
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={loading}
      okText="Tạo"
      cancelText="Hủy"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="name"
          label="Tên thư mục"
          rules={[
            { required: true, message: 'Vui lòng nhập tên thư mục' },
            { max: 255, message: 'Tên thư mục không quá 255 ký tự' }
          ]}
        >
          <Input placeholder="Nhập tên thư mục" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};
