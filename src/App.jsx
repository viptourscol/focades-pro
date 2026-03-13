import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import BeneficiarioLayout from './layouts/BeneficiarioLayout';
import Dashboard from './pages/Dashboard';
import Aspirantes from './pages/Aspirantes';
import AdminBeneficiarios from './pages/AdminBeneficiarios';
import AdminBeneficiarioDetalle from './pages/AdminBeneficiarioDetalle';
import AdminActualizaciones from './pages/AdminActualizaciones';
import Registro from './pages/Registro';
import TicketsAdmin from './pages/TicketsAdmin';
import PortalConfig from './pages/PortalConfig';
import BeneficiarioLogin from './pages/BeneficiarioLogin';
import AdminLogin from './pages/AdminLogin';
import BeneficiarioHome from './pages/BeneficiarioHome';
import BeneficiarioResumen from './pages/BeneficiarioResumen';
import BeneficiarioActualizacion from './pages/BeneficiarioActualizacion';
import BeneficiarioHistorial from './pages/BeneficiarioHistorial';
import { supabase } from './lib/supabase';
import { resolvePortalAccess, setPortalAuthErrorMessage } from './lib/portalAuth';
import { useEffect, useState } from 'react';

function BeneficiarioAuthGuard({ children }) {
  const [ready, setReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateBeneficiarioAccess = async () => {
      const access = await resolvePortalAccess({ attemptClaim: true });
      if (!mounted) return;

      if (!access.ok && access.hasSession) {
        setPortalAuthErrorMessage(
          'Tu cuenta de Google no está vinculada a un beneficiario activo. Solicita al administrador registrar o actualizar tu correo autorizado.'
        );
        await supabase.auth.signOut();
        if (!mounted) return;
      }

      setHasAccess(access.ok);
      setReady(true);
    };

    const loadSession = async () => {
      await validateBeneficiarioAccess();
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session) {
        setHasAccess(false);
        setReady(true);
        return;
      }

      window.setTimeout(() => {
        if (!mounted) return;
        validateBeneficiarioAccess().catch(() => {
          if (!mounted) return;
          setHasAccess(false);
          setReady(true);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/beneficiario/login" replace />;
  }

  return children;
}

function AdminAuthGuard({ children }) {
  const [ready, setReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateAdminAccess = async () => {
      const access = await resolvePortalAccess({ attemptClaim: false });
      if (!mounted) return;

      if (!access.isAdmin && access.hasSession) {
        setPortalAuthErrorMessage(
          'Tu cuenta autenticada no tiene permisos de administrador. Solicita habilitación al equipo responsable.'
        );
        await supabase.auth.signOut();
        if (!mounted) return;
      }

      setHasAccess(Boolean(access.isAdmin));
      setReady(true);
    };

    const loadSession = async () => {
      await validateAdminAccess();
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session) {
        setHasAccess(false);
        setReady(true);
        return;
      }

      window.setTimeout(() => {
        if (!mounted) return;
        validateAdminAccess().catch(() => {
          if (!mounted) return;
          setHasAccess(false);
          setReady(true);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/registro" element={<Registro />} />
        <Route path="/beneficiario/login" element={<BeneficiarioLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        <Route
          path="/beneficiario"
          element={
            <BeneficiarioAuthGuard>
              <BeneficiarioLayout />
            </BeneficiarioAuthGuard>
          }
        >
          <Route index element={<BeneficiarioHome />} />
          <Route path="resumen" element={<BeneficiarioResumen />} />
          <Route path="actualizacion" element={<BeneficiarioActualizacion />} />
          <Route path="historial" element={<BeneficiarioHistorial />} />
        </Route>

        <Route
          path="/admin"
          element={
            <AdminAuthGuard>
              <AdminLayout />
            </AdminAuthGuard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="beneficiarios" element={<AdminBeneficiarios />} />
          <Route path="beneficiarios/:beneficiarioId" element={<AdminBeneficiarioDetalle />} />
          <Route path="actualizaciones" element={<AdminActualizaciones />} />
          <Route path="aspirantes" element={<Aspirantes />} />
          <Route path="tickets" element={<TicketsAdmin />} />
          <Route path="configuracion" element={<PortalConfig />} />
        </Route>

        <Route path="/" element={<Navigate to="/registro" replace />} />
        <Route path="*" element={<Navigate to="/registro" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;