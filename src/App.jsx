import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import BeneficiarioLayout from './layouts/BeneficiarioLayout';
import Dashboard from './pages/Dashboard';
import { Suspense, lazy, useEffect, useState } from 'react';
import Aspirantes from './pages/Aspirantes';
import AdminBeneficiarios from './pages/AdminBeneficiarios';
import AdminBeneficiarioDetalle from './pages/AdminBeneficiarioDetalle';
import AdminActualizaciones from './pages/AdminActualizaciones';
import AdminVentanasActualizacion from './pages/AdminVentanasActualizacion';
import Registro from './pages/Registro';
import TicketsAdmin from './pages/TicketsAdmin';
import PortalConfig from './pages/PortalConfig';
import AdminCondonaciones from './pages/AdminCondonaciones';
import BeneficiarioLogin from './pages/BeneficiarioLogin';
import AdminLogin from './pages/AdminLogin';
import BeneficiarioHome from './pages/BeneficiarioHome';
import BeneficiarioResumen from './pages/BeneficiarioResumen';
import BeneficiarioActualizacion from './pages/BeneficiarioActualizacion';
import BeneficiarioHistorial from './pages/BeneficiarioHistorial';
import BeneficiarioNotificaciones from './pages/BeneficiarioNotificaciones';
import BeneficiarioCondonacion from './pages/BeneficiarioCondonacion';
import BeneficiarioTickets from './pages/BeneficiarioTickets';
import VerificarCertificado from './pages/VerificarCertificado';
import AdminImportHistoricos from './components/AdminImportHistoricos';
import AdminMigracionHistoricos from './pages/AdminMigracionHistoricos';
import AdminImportPagosHistoricos from './pages/AdminImportPagosHistoricos';
import AdminDocumentosHistoricos from './pages/AdminDocumentosHistoricos';
import AdminHistoricosHub from './pages/AdminHistoricosHub';
import AdminConvocatorias from './pages/AdminConvocatorias';
import AdminFaq from './pages/AdminFaq';
import BeneficiarioOnboarding from './pages/BeneficiarioOnboarding';
import Landing from './pages/Landing';
import { supabase } from './lib/supabase';
import { resolvePortalAccess, setPortalAuthErrorMessage } from './lib/portalAuth';
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminProjection = lazy(() => import('./pages/AdminProjection'));
const AdminResoluciones = lazy(() => import('./pages/AdminResoluciones'));

function BeneficiarioAuthGuard({ children }) {
  const [ready, setReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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

      // El onboarding solo aplica a beneficiarios históricos (importados por el admin).
      // Los que pasaron por el flujo de convocatoria ya tienen sus documentos y van directo al portal.
      if (
        access.ok &&
        access.profile &&
        access.profile.origen_registro === 'historico' &&
        !access.profile.onboarding_completado
      ) {
        setNeedsOnboarding(true);
        setHasAccess(false);
        setReady(true);
        return;
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

  if (needsOnboarding) {
    return <Navigate to="/beneficiario/onboarding" replace />;
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
        // Si hay sesión pero no admin access, reintentar una vez más con delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryAccess = await resolvePortalAccess({ attemptClaim: false });
        if (!mounted) return;
        
        if (!retryAccess.isAdmin) {
          setPortalAuthErrorMessage(
            'Tu cuenta autenticada no tiene permisos de administrador. Solicita habilitación al equipo responsable.'
          );
          await supabase.auth.signOut();
          if (!mounted) return;
        } else {
          setHasAccess(true);
          setReady(true);
          return;
        }
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
        <Route path="/verificar-certificado" element={<VerificarCertificado />} />
        <Route path="/beneficiario/login" element={<BeneficiarioLogin />} />
        <Route path="/beneficiario/onboarding" element={<BeneficiarioOnboarding />} />
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
          <Route path="notificaciones" element={<BeneficiarioNotificaciones />} />
          <Route path="resumen" element={<BeneficiarioResumen />} />
          <Route path="actualizacion" element={<BeneficiarioActualizacion />} />
          <Route path="historial" element={<BeneficiarioHistorial />} />
          <Route path="condonacion" element={<BeneficiarioCondonacion />} />
          <Route path="tickets" element={<BeneficiarioTickets />} />
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
          <Route
            path="analiticas"
            element={
              <Suspense
                fallback={
                  <div className="min-h-[40vh] flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
                  </div>
                }
              >
                <AdminAnalytics />
              </Suspense>
            }
          />
          <Route
            path="proyecciones"
            element={
              <Suspense
                fallback={
                  <div className="min-h-[40vh] flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
                  </div>
                }
              >
                <AdminProjection />
              </Suspense>
            }
          />
          <Route path="beneficiarios" element={<AdminBeneficiarios />} />
          <Route path="beneficiarios/:beneficiarioId" element={<AdminBeneficiarioDetalle />} />
          <Route path="actualizaciones" element={<AdminActualizaciones />} />
          <Route path="actualizaciones/ventanas" element={<AdminVentanasActualizacion />} />
          <Route path="condonaciones" element={<AdminCondonaciones />} />
          <Route path="historicos" element={<AdminHistoricosHub />} />
          <Route path="historicos/importar" element={<AdminImportHistoricos />} />
          <Route path="historicos/documentos" element={<AdminDocumentosHistoricos />} />
          <Route path="historicos/pagos" element={<AdminImportPagosHistoricos />} />
          <Route path="historicos/activacion" element={<AdminMigracionHistoricos />} />
          {/* Redirects de compatibilidad con rutas anteriores */}
          <Route path="importar" element={<Navigate to="/admin/historicos/importar" replace />} />
          <Route path="documentos-historicos" element={<Navigate to="/admin/historicos/documentos" replace />} />
          <Route path="importar-pagos" element={<Navigate to="/admin/historicos/pagos" replace />} />
          <Route path="activacion" element={<Navigate to="/admin/historicos/activacion" replace />} />
          <Route path="aspirantes" element={<Aspirantes />} />
          <Route path="convocatorias" element={<AdminConvocatorias />} />
          <Route path="faq" element={<AdminFaq />} />
          <Route path="tickets" element={<TicketsAdmin />} />
          <Route path="configuracion" element={<PortalConfig />} />
          <Route
            path="resoluciones"
            element={
              <Suspense
                fallback={
                  <div className="min-h-[40vh] flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
                  </div>
                }
              >
                <AdminResoluciones />
              </Suspense>
            }
          />
        </Route>

        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;