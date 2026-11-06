import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { NotFound } from './pages/NotFound';

// Lazy-load ONLY EditorPage to keep the heavy Fabric.js bundle off the main app
const EditorPage = lazy(() =>
  import('./editor/ui/EditorPage').then((m) => ({ default: m.EditorPage }))
);

export default function App() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0b)' }} />}>
      <Routes>
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowGuest={false}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute allowGuest={true}>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
