import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Home } from './pages/Home';

// Route-based code splitting so heavy libraries (like Fabric in EditorPage) don't delay LCP on the Home page
const EditorPage = lazy(() =>
  import('./editor/ui/EditorPage').then((m) => ({ default: m.EditorPage }))
);
const Login = lazy(() =>
  import('./pages/Login').then((m) => ({ default: m.Login }))
);
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const Profile = lazy(() =>
  import('./pages/Profile').then((m) => ({ default: m.Profile }))
);
const Terms = lazy(() =>
  import('./pages/Terms').then((m) => ({ default: m.Terms }))
);
const Privacy = lazy(() =>
  import('./pages/Privacy').then((m) => ({ default: m.Privacy }))
);
const NotFound = lazy(() =>
  import('./pages/NotFound').then((m) => ({ default: m.NotFound }))
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
