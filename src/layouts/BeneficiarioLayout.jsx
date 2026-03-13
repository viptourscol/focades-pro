import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, ClipboardList, FileClock, Home, LogOut, Menu, UserCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolvePortalAccess } from '../lib/portalAuth';

const navItems = [
  { to: '/beneficiario', label: 'Inicio', icon: Home },
  { to: '/beneficiario/resumen', label: 'Mi Resumen', icon: UserCircle2 },
  { to: '/beneficiario/actualizacion', label: 'Actualización', icon: ClipboardList },
  { to: '/beneficiario/historial', label: 'Historial', icon: FileClock },
];

const BeneficiarioLayout = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState('Beneficiario');

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/beneficiario/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-slate-900 flex">
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-primary text-white border-r border-primary/40 transition-all duration-300 ${
          collapsed ? 'w-[86px]' : 'w-[280px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="h-20 px-4 border-b border-white/10 flex items-center justify-between gap-2">
          <Link to="/beneficiario" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent text-primary font-black flex items-center justify-center">F</div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-black leading-tight">FOCADES</p>
                <p className="text-[11px] text-slate-300 leading-tight">Portal Beneficiarios</p>
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

        <nav className="p-3 space-y-2">
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
                    isActive ? 'bg-secondary text-white' : 'text-slate-200 hover:bg-white/10'
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
        <header className="h-20 bg-white border-b border-border px-4 md:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden w-10 h-10 rounded-xl border border-border inline-flex items-center justify-center"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-extrabold text-primary truncate">Portal de Beneficiarios</h1>
              <p className="text-xs text-slate-500 truncate">{profileName}</p>
            </div>
          </div>

          <div className="w-10 h-10 rounded-full border border-border bg-slate-50 flex items-center justify-center text-secondary">
            <Bell size={18} />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Outlet />
        </main>

        <footer className="bg-primary text-white text-center text-xs px-4 py-5 border-t border-primary/70">
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
    </div>
  );
};

export default BeneficiarioLayout;
