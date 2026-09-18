import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../features/auth/AuthContext';
import { MainLayout } from '../layouts/MainLayout';
import { AuthPage } from '../features/auth/AuthPage';
import { DrivePage } from '../features/drive/DrivePage';
import { TrashPage } from '../features/trash/TrashPage';
import { ActivityPage } from '../features/activity/ActivityPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Spin size="large" tip="Đang kiểm tra trạng thái phiên làm việc..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Spin size="large" tip="Đang tải..." />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/drive" replace />;
  }

  return <>{children}</>;
};

export const appRoutes = [
  {
    path: '/auth',
    element: (
      <PublicOnlyRoute>
        <AuthPage />
      </PublicOnlyRoute>
    )
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/drive" replace />
      },
      {
        path: 'drive',
        element: <DrivePage />
      },
      {
        path: 'trash',
        element: <TrashPage />
      },
      {
        path: 'activity',
        element: <ActivityPage />
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/drive" replace />
  }
];
