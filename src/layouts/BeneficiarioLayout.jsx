import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, ClipboardList, FileClock, GraduationCap, Home, LifeBuoy, LogOut, Menu, UserCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolvePortalAccess, logoutBeneficiaryDueToTimeout } from '../lib/portalAuth';
import { useSessionTimeout } from '../lib/hooks/useSessionTimeout';
import { SessionTimeoutWarning } from '../components/SessionTimeoutWarning';

const navItems = [
  { to: '/beneficiario', label: 'Inicio', icon: Home },
  { to: '/beneficiario/resumen', label: 'Mi Resumen', icon: UserCircle2 },
  { to: '/beneficiario/actualizacion', label: 'Actualización', icon: ClipboardList },
  { to: '/beneficiario/historial', label: 'Historial', icon: FileClock },
  { to: '/beneficiario/condonacion', label: 'Condonación', icon: GraduationCap },
  { to: '/beneficiario/tickets', label: 'Soporte', icon: LifeBuoy },
];

const BeneficiarioLayout = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState('Beneficiario');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Hook para detectar inactividad (30 minutos = 1800 segundos para beneficiarios)
  const sessionTimeout = useSessionTimeout(
    1800, // 30 minutos en segundos
    () => logoutBeneficiaryDueToTimeout(), // Callback cuando sesión expira
    true // Habilitado
  );

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      const access = await resolvePortalAccess({ attemptClaim: false });
      const user = access.session?.user;
      if (!mounted || !user) return;

      const nameFromMeta = String(
        user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Beneficiario'
      ).trim();

      setProfileName(access.profile?.nombre_completo || nameFromMeta || 'Beneficiario');
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadUnreadNotifications = async () => {
      try {
        // Primero intentar obtener beneficiario_id desde localStorage (login con documento)
        let beneficiarioId = null;
        try {
          const sessionStr = localStorage.getItem('focades:beneficiario-session');
          if (sessionStr) {
            const documentSession = JSON.parse(sessionStr);
            const sessionTime = new Date(documentSession.timestamp).getTime();
            const maxAge = 24 * 60 * 60 * 1000;
            
            if (Date.now() - sessionTime <= maxAge && documentSession.beneficiario_id) {
              beneficiarioId = documentSession.beneficiario_id;
            }
          }
        } catch (error) {
          console.error('Error leyendo sesión de localStorage:', error);
        }

        // Si no hay beneficiario_id en localStorage, buscar con Supabase Auth
        if (!beneficiarioId) {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData?.session?.user?.id;
          if (!userId) {
            if (mounted) setUnreadNotifications(0);
            return;
          }

          const { data: profileData } = await supabase
            .from('portal_beneficiarios')
            .select('id')
            .eq('auth_user_id', userId)
            .maybeSingle();

          beneficiarioId = profileData?.id;
        }

        if (!beneficiarioId) {
          if (mounted) setUnreadNotifications(0);
          return;
        }

        const { count } = await supabase
          .from('portal_notificaciones_beneficiarios')
          .select('id', { count: 'exact', head: true })
          .eq('beneficiario_id', beneficiarioId)
          .eq('leida', false);

        if (mounted) {
          setUnreadNotifications(Number(count || 0));
        }
      } catch {
        if (mounted) setUnreadNotifications(0);
      }
    };

    const onNotificationUpdated = (event) => {
      const nextUnread = Number(event?.detail?.unreadCount);
      if (Number.isFinite(nextUnread)) {
        setUnreadNotifications(Math.max(0, nextUnread));
      } else {
        loadUnreadNotifications();
      }
    };

    loadUnreadNotifications();
    const timer = setInterval(loadUnreadNotifications, 45000);
    window.addEventListener('benef-notif-updated', onNotificationUpdated);

    return () => {
      mounted = false;
      clearInterval(timer);
      window.removeEventListener('benef-notif-updated', onNotificationUpdated);
    };
  }, []);

  const handleLogout = async () => {
    // Limpiar sesión de Auth y de documento
    await supabase.auth.signOut();
    try {
      localStorage.removeItem('focades:beneficiario-session');
    } catch (error) {
      console.error('Error limpiando sesión:', error);
    }
    navigate('/beneficiario/login', { replace: true });
  };

  return (
    <div className="min-h-screen admin-shell text-slate-900 flex">
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 admin-panel-dark text-white border-r border-white/10 transition-all duration-300 ${
          collapsed ? 'w-[86px]' : 'w-[280px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="h-20 px-4 border-b border-white/10 flex items-center justify-between gap-2 relative">
          <div className="absolute inset-0 opacity-35 pointer-events-none admin-grid" />
          <Link to="/beneficiario" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[linear-gradient(135deg,#f1c57f,#bb7d26)] text-[#10233f] font-black flex items-center justify-center shadow-lg shadow-amber-900/20">F</div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-black leading-tight">FOCADES</p>
                <p className="text-[11px] text-slate-300 leading-tight uppercase tracking-[0.16em]">Portal Beneficiarios</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="hidden md:inline-flex w-8 h-8 rounded-lg border border-white/20 items-center justify-center"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="p-3 space-y-2 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                end={item.to === '/beneficiario'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 transition-all ${
                    isActive ? 'bg-white text-[#10233f] shadow-lg shadow-slate-900/15' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={18} />
                {!collapsed && <span className="font-semibold text-sm">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-200 hover:bg-white/10"
          >
            <LogOut size={18} />
            {!collapsed && <span className="font-semibold text-sm">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="px-4 md:px-8 pt-4 md:pt-6 sticky top-0 z-30">
          <div className="admin-panel h-20 rounded-[26px] px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden w-10 h-10 rounded-xl border border-[var(--gov-line)] inline-flex items-center justify-center"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-[var(--gov-ink)] text-xl truncate">Portal de Beneficiarios</h1>
              <p className="text-xs text-slate-600 truncate">{profileName}</p>
            </div>
          </div>

          <Link
            to="/beneficiario/notificaciones"
            className="relative w-10 h-10 rounded-2xl border border-[var(--gov-line)] bg-white flex items-center justify-center text-[var(--gov-info)] hover:bg-slate-50 transition-colors"
            aria-label="Ver notificaciones"
          >
            <Bell size={18} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Outlet />
        </main>

        <footer className="bg-[var(--gov-ink)] text-white text-center text-xs px-4 py-5 border-t border-white/10 tracking-[0.08em] uppercase">
          © 2026 Alcaldía de Montelíbano - Secretaría de Educación
        </footer>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 bg-slate-900/50 z-30"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Modal de advertencia de sesión por expirar */}
      <SessionTimeoutWarning
        isVisible={sessionTimeout.isWarning}
        timeRemaining={sessionTimeout.timeRemaining}
        onExtend={sessionTimeout.extendSession}
        onLogout={() => navigate('/login')}
      />
    </div>
  );
};

export default BeneficiarioLayout;
