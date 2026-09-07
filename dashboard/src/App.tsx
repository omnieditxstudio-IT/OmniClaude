'use client';

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { KeysPage } from '@/pages/KeysPage';
import { EndpointsPage } from '@/pages/EndpointsPage';
import { MappingsPage } from '@/pages/MappingsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { PersonaAnalyticsPage } from '@/pages/PersonaAnalyticsPage';
import { SettingsPage } from '@/pages/SettingsPage';

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PublicRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route path="/login" element={<PublicRoute />}>
            <Route index element={<LoginPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/keys" element={<KeysPage />} />
              <Route path="/endpoints" element={<EndpointsPage />} />
              <Route path="/mappings" element={<MappingsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/personas/analytics" element={<PersonaAnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}