import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { appTheme } from '../theme/theme';
import { AuthProvider } from '../features/auth/AuthContext';
import { UploadProvider } from '../features/uploads/UploadContext';
import { appRoutes } from './routes';

const router = createBrowserRouter(appRoutes);

export const App: React.FC = () => {
  return (
    <ConfigProvider theme={appTheme} locale={viVN}>
      <AntdApp>
        <AuthProvider>
          <UploadProvider>
            <RouterProvider router={router} />
          </UploadProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
};
