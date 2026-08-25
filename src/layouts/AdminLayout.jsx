import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, Bell, LifeBuoy, IdCard, ClipboardList, Menu, X, BarChart3, Calculator, FileText, CalendarClock, ShieldCheck, Search, ArrowUpRight, UploadCloud, UserPlus, HandCoins, FolderOpen, Database, ChevronDown, ChevronRight, Megaphone, HelpCircle, Zap, KeyRound } from 'lucide-react';
import { invokeAdminTickets } from '../lib/adminTickets';
import { supabase, logoutDueToTimeout } from '../lib/supabase';
import { useSessionTimeout } from '../lib/hooks/useSessionTimeout';
import { SessionTimeoutWarning } from '../components/SessionTimeoutWarning';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={20} />, match: (path) => path === '/admin' },
  { to: '/admin/analiticas', label: 'Analíticas', icon: <BarChart3 size={20} />, match: (path) => path.startsWith('/admin/analiticas') },
  { to: '/admin/proyecciones', label: 'Proyecciones', icon: <Calculator size={20} />, match: (path) => path.startsWith('/admin/proyecciones') },
  // Beneficiarios se manejará con BeneficiariesGroup (desplegable)
  // Actualizaciones se manejará con ActualizacionesGroup (desplegable)
  { to: '/admin/condonaciones', label: 'Condonaciones', icon: <ShieldCheck size={20} />, match: (path) => path.startsWith('/admin/condonaciones') },
  { to: '/admin/resoluciones', label: 'Resoluciones', icon: <FileText size={20} />, match: (path) => path.startsWith('/admin/resoluciones') },
  { to: '/admin/generador-tokens', label: 'Generar Tokens', icon: <Zap size={20} />, match: (path) => path.startsWith('/admin/generador-tokens') },
  { to: '/admin/tokens-activacion', label: 'Tokens Activación', icon: <KeyRound size={20} />, match: (path) => path.startsWith('/admin/tokens-activacion') },
  { to: '/admin/aspirantes', label: 'Aspirantes', icon: <Users size={20} />, match: (path) => path === '/admin/aspirantes' },
  { to: '/admin/convocatorias', label: 'Convocatorias', icon: <Megaphone size={20} />, match: (path) => path.startsWith('/admin/convocatorias') },
  { to: '/admin/tickets', label: 'Tickets', icon: <LifeBuoy size={20} />, match: (path) => path === '/admin/tickets' },
  { to: '/admin/faq', label: 'FAQ Pública', icon: <HelpCircle size={20} />, match: (path) => path.startsWith('/admin/faq') },
  { to: '/admin/configuracion', label: 'Configuración', icon: <Settings size={20} />, match: (path) => path === '/admin/configuracion' },
];

const getPageMeta = (pathname) => {
  if (pathname.startsWith('/admin/beneficiarios/')) return { title: 'Ficha 360', subtitle: 'Perfil, pagos, trazabilidad y expediente del beneficiario.' };
  if (pathname.startsWith('/admin/beneficiarios/autorizados')) return { title: 'Beneficiarios Autorizados', subtitle: 'Gestión de beneficiarios preautorizados y vinculación de cuentas.' };
  if (pathname.startsWith('/admin/beneficiarios')) return { title: 'Beneficiarios', subtitle: 'Vista maestra de estado, vinculación y seguimiento institucional.' };
  if (pathname.startsWith('/admin/generador-tokens')) return { title: 'Generador de Tokens', subtitle: 'Genera tokens de setup y envía emails de activación a beneficiarios.' };
  if (pathname.startsWith('/admin/tokens-activacion')) return { title: 'Tokens de Activación', subtitle: 'Gestiona y reenvía tokens de activación para beneficiarios históricos.' };
  if (pathname.startsWith('/admin/actualizaciones/ventanas')) return { title: 'Ventanas de Actualización', subtitle: 'Calendario de actualización y control de periodos.' };
  if (pathname.startsWith('/admin/actualizaciones')) return { title: 'Actualizaciones', subtitle: 'Revisión documental y aprobación del ciclo académico.' };
  if (pathname.startsWith('/admin/historicos/importar')) return { title: 'Importar Beneficiarios', subtitle: 'Carga masiva de beneficiarios históricos por lote.' };
  if (pathname.startsWith('/admin/historicos/documentos')) return { title: 'Documentos Históricos', subtitle: 'Carga individual de soportes por beneficiario histórico.' };
  if (pathname.startsWith('/admin/historicos/pagos')) return { title: 'Importar Pagos', subtitle: 'Carga masiva de pagos históricos y conciliación por documento.' };
  if (pathname.startsWith('/admin/historicos/activacion')) return { title: 'Activar Históricos', subtitle: 'Clasificación y activación de acceso para beneficiarios migrados.' };
  if (pathname.startsWith('/admin/historicos')) return { title: 'Gestión Históricos', subtitle: 'Hub central de importación, documentos, pagos y activación.' };
  if (pathname.startsWith('/admin/analiticas')) return { title: 'Analíticas', subtitle: 'Lectura ejecutiva del comportamiento del portal.' };
  if (pathname.startsWith('/admin/proyecciones')) return { title: 'Proyecciones', subtitle: 'Planeación financiera y escenarios de desembolso.' };
  if (pathname.startsWith('/admin/condonaciones')) return { title: 'Condonaciones', subtitle: 'Seguimiento normativo, certificaciones y decisiones.' };
  if (pathname.startsWith('/admin/resoluciones')) return { title: 'Resoluciones', subtitle: 'Generación institucional de actos administrativos.' };
  if (pathname.startsWith('/admin/tickets')) return { title: 'Tickets', subtitle: 'Atención, seguimiento y trazabilidad de solicitudes.' };
  if (pathname.startsWith('/admin/configuracion')) return { title: 'Configuración', subtitle: 'Parámetros del portal y control administrativo.' };
  if (pathname.startsWith('/admin/aspirantes')) return { title: 'Aspirantes', subtitle: 'Ruta de admisión, legalización y revisión de soportes.' };
  if (pathname.startsWith('/admin/convocatorias')) return { title: 'Convocatorias', subtitle: 'Gestión de cohortes, periodos de inscripción y cupos admitidos.' };
  if (pathname.startsWith('/admin/faq')) return { title: 'FAQ Pública', subtitle: 'Preguntas frecuentes que se muestran en la página principal del portal.' };
  return { title: 'Centro de Control', subtitle: 'Operación institucional unificada para el portal FOCADES.' };
};

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingTickets, setPendingTickets] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentTickets, setRecentTickets] = useState([]);
  const pageMeta = getPageMeta(location.pathname);
  const todayLabel = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date());

  // Hook para detectar inactividad (2 horas = 7200 segundos para admin)
  const sessionTimeout = useSessionTimeout(
    7200, // 2 horas en segundos
    () => logoutDueToTimeout(), // Callback cuando sesión expira
    true // Habilitado
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;

    const loadTicketBadge = async () => {
      const result = await invokeAdminTickets({ action: 'list', limit: 5 });
      if (!mounted) return;

      if (result.ok) {
        const tickets = result.data?.tickets || [];
        const stats = result.data?.stats || {};
        setPendingTickets(Number(stats.pendientes || 0));
        // Filtrar solo tickets pendientes (recibido, en_revision)
        const pending = tickets.filter(t => t.estado === 'recibido' || t.estado === 'en_revision');
        setRecentTickets(pending.slice(0, 5));
      }
    };

    loadTicketBadge();
    const timer = setInterval(loadTicketBadge, 45000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="admin-shell flex h-screen overflow-hidden">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="md:hidden fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 w-80 admin-panel-dark text-white flex flex-col z-40 transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="absolute inset-0 opacity-35 pointer-events-none admin-grid" />
        <div className="relative p-7 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#f1c57f,#c88c3a)] text-[#10233f] flex items-center justify-center shadow-lg shadow-amber-950/20 font-black">F</div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.35em] text-amber-200/80 font-extrabold">Portal</p>
              <h1 className="text-2xl font-bold tracking-tight">FOCADES</h1>
            </div>
          <button
            type="button"
            className="ml-auto md:hidden w-9 h-9 rounded-xl border border-white/10 text-slate-300 inline-flex items-center justify-center"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
          </div>

        </div>

        <nav className="relative flex-1 px-4 py-5 space-y-2 overflow-y-auto">
          {NAV_ITEMS.slice(0, 3).map((item) => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} active={item.match(location.pathname)} onClick={() => setMobileMenuOpen(false)} badge={item.to === '/admin/tickets' ? pendingTickets : 0} />
          ))}
          <BeneficiariesGroup location={location} onClick={() => setMobileMenuOpen(false)} />
          <ActualizacionesGroup location={location} onClick={() => setMobileMenuOpen(false)} />
          <HistoricosGroup location={location} onClick={() => setMobileMenuOpen(false)} />
          {NAV_ITEMS.slice(3).map((item) => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} active={item.match(location.pathname)} onClick={() => setMobileMenuOpen(false)} badge={item.to === '/admin/tickets' ? pendingTickets : 0} />
          ))}
        </nav>

        <div className="relative p-6 border-t border-white/10 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Atajo</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-semibold">Ir a tickets críticos</span>
              <Link to="/admin/tickets" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-1 text-amber-300 font-bold">
                Abrir <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 text-slate-300 hover:text-red-300 w-full px-4 py-3 rounded-2xl hover:bg-white/5 font-bold text-sm transition-colors"
          >
            <LogOut size={18}/> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="shrink-0 px-4 md:px-8 lg:px-10 pt-4 md:pt-6">
          <div className="admin-panel rounded-[30px] px-4 md:px-7 py-4 md:py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start md:items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden w-10 h-10 rounded-2xl border border-[var(--gov-line)] inline-flex items-center justify-center text-slate-600 bg-white/70"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
              <div className="min-w-0">
                <p className="admin-kicker truncate">{todayLabel}</p>
                <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-[var(--gov-ink)] truncate">{pageMeta.title}</h2>
                <p className="mt-1 text-sm text-slate-600 max-w-2xl">{pageMeta.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
              <div className="hidden lg:flex items-center gap-2 rounded-full border border-[var(--gov-line)] bg-white/80 px-4 py-2 text-sm text-slate-600">
                <Search size={15} className="text-slate-400" />
                Navegación administrativa
              </div>
              
              {/* Botón de notificaciones con dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700 hover:bg-sky-100 transition-colors"
                  title="Ver notificaciones"
                >
                  <Bell size={18} />
                  {pendingTickets > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                      {pendingTickets > 99 ? '99+' : pendingTickets}
                    </span>
                  )}
                </button>

                {/* Dropdown de notificaciones */}
                {notificationsOpen && (
                  <>
                    {/* Overlay para cerrar al hacer clic fuera */}
                    <div 
                      className="fixed inset-0 z-[99998]" 
                      onClick={() => setNotificationsOpen(false)}
                    />
                    
                    {/* Panel de notificaciones */}
                    <div className="fixed top-20 right-4 md:right-8 lg:right-10 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[99999] overflow-hidden">
                      <div className="bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-4 border-b border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bell size={18} className="text-sky-700" />
                            <h3 className="font-bold text-slate-800">Notificaciones</h3>
                          </div>
                          {pendingTickets > 0 && (
                            <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-bold">
                              {pendingTickets}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="max-h-96 overflow-y-auto">
                        {recentTickets.length === 0 ? (
                          <div className="px-5 py-8 text-center">
                            <Bell size={32} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-sm text-slate-500">No hay notificaciones pendientes</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {recentTickets.map((ticket) => (
                              <button
                                key={ticket.id}
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  navigate('/admin/tickets');
                                }}
                                className="w-full px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 p-2 rounded-lg bg-amber-50 text-amber-600">
                                    <LifeBuoy size={16} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">
                                      {ticket.asunto || 'Sin asunto'}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      {ticket.codigo} • {ticket.email_contacto}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                      {new Date(ticket.created_at).toLocaleDateString('es-CO', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                                    ticket.estado === 'recibido' 
                                      ? 'bg-blue-100 text-blue-700' 
                                      : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {ticket.estado === 'recibido' ? 'Nuevo' : 'En revisión'}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {pendingTickets > 0 && (
                        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
                          <button
                            onClick={() => {
                              setNotificationsOpen(false);
                              navigate('/admin/tickets');
                            }}
                            className="w-full px-4 py-2 rounded-lg bg-secondary text-white text-sm font-bold hover:bg-secondary/90 transition-colors"
                          >
                            Ver todos los tickets ({pendingTickets})
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="hidden md:flex flex-col items-end">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sesión</p>
                <span className="admin-chip-strong">Administrador</span>
              </div>
              <div className="hidden md:flex w-11 h-11 rounded-2xl bg-[linear-gradient(135deg,#244b88,#10233f)] items-center justify-center text-white font-bold shadow-lg shadow-slate-900/15">A</div>
            </div>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-10 pb-6 md:pb-8 pt-4">
          <Outlet /> {/* AQUÍ SE CARGAN LAS PÁGINAS DEL ADMIN */}
        </section>
      </main>

      {/* Modal de advertencia de sesión por expirar */}
      <SessionTimeoutWarning
        isVisible={sessionTimeout.isWarning}
        timeRemaining={sessionTimeout.timeRemaining}
        onExtend={sessionTimeout.extendSession}
        onLogout={handleLogout}
      />
    </div>
  );
};

function BeneficiariesGroup({ location, onClick }) {
  const isActive = location.pathname.startsWith('/admin/beneficiarios')
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); }}
        className={`group flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 ${
          isActive ? 'bg-white text-[#10233f] shadow-xl shadow-slate-950/10' : 'text-slate-300 hover:bg-white/5'
        }`}
      >
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          <IdCard size={20} />
        </span>
        <span className="font-bold text-sm flex-1 text-left">Beneficiarios</span>
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <SubNavItem to="/admin/beneficiarios" icon={<IdCard size={16} />} label="Todos los beneficiarios" active={location.pathname === '/admin/beneficiarios'} onClick={onClick} />
          <SubNavItem to="/admin/beneficiarios/autorizados" icon={<ShieldCheck size={16} />} label="Beneficiarios autorizados" active={location.pathname.startsWith('/admin/beneficiarios/autorizados')} onClick={onClick} />
          <SubNavItem to="/admin/beneficiarios/importar" icon={<UploadCloud size={16} />} label="Importar CSV" active={location.pathname.startsWith('/admin/beneficiarios/importar')} onClick={onClick} />
        </div>
      )}
    </div>
  )
}

function ActualizacionesGroup({ location, onClick }) {
  const isActive = location.pathname.startsWith('/admin/actualizaciones')
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); }}
        className={`group flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 ${
          isActive ? 'bg-white text-[#10233f] shadow-xl shadow-slate-950/10' : 'text-slate-300 hover:bg-white/5'
        }`}
      >
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          <ClipboardList size={20} />
        </span>
        <span className="font-bold text-sm flex-1 text-left">Actualizaciones</span>
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <SubNavItem to="/admin/actualizaciones" icon={<ClipboardList size={16} />} label="Revisión de actualizaciones" active={location.pathname === '/admin/actualizaciones'} onClick={onClick} />
          <SubNavItem to="/admin/actualizaciones/ventanas" icon={<CalendarClock size={16} />} label="Ventanas de actualización" active={location.pathname.startsWith('/admin/actualizaciones/ventanas')} onClick={onClick} />
        </div>
      )}
    </div>
  )
}

function HistoricosGroup({ location, onClick }) {
  const isActive = location.pathname.startsWith('/admin/historicos')
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); }}
        className={`group flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 ${
          isActive ? 'bg-white text-[#10233f] shadow-xl shadow-slate-950/10' : 'text-slate-300 hover:bg-white/5'
        }`}
      >
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          <Database size={20} />
        </span>
        <span className="font-bold text-sm flex-1 text-left">Gestión Históricos</span>
        <span className={`${isActive ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <SubNavItem to="/admin/historicos" icon={<Database size={16} />} label="Resumen de lotes" active={location.pathname === '/admin/historicos'} onClick={onClick} />
          <SubNavItem to="/admin/historicos/importar" icon={<UploadCloud size={16} />} label="Importar Beneficiarios" active={location.pathname.startsWith('/admin/historicos/importar')} onClick={onClick} />
          <SubNavItem to="/admin/historicos/documentos" icon={<FolderOpen size={16} />} label="Documentos" active={location.pathname.startsWith('/admin/historicos/documentos')} onClick={onClick} />
          <SubNavItem to="/admin/historicos/pagos" icon={<HandCoins size={16} />} label="Pagos" active={location.pathname.startsWith('/admin/historicos/pagos')} onClick={onClick} />
          <SubNavItem to="/admin/historicos/activacion" icon={<UserPlus size={16} />} label="Activación" active={location.pathname.startsWith('/admin/historicos/activacion')} onClick={onClick} />
        </div>
      )}
    </div>
  )
}

function NavItem({ to, icon, label, active, badge = 0, onClick }) {
  return (
    <Link 
      to={to}
      onClick={onClick}
      className={`group flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 ${
        active ? 'bg-white text-[#10233f] shadow-xl shadow-slate-950/10' : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      <span className={`${active ? 'text-[#c88c3a]' : 'text-slate-400 group-hover:text-amber-200'} transition-colors`}>{icon}</span>
      <span className="font-bold text-sm">{label}</span>
      {badge > 0 && (
        <span className={`ml-auto min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
          active ? 'bg-[#10233f] text-white' : 'bg-red-500 text-white'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function SubNavItem({ to, icon, label, active, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`ml-6 flex items-center gap-3 w-[calc(100%-1.5rem)] px-4 py-2.5 rounded-xl transition-all duration-300 ${
        active ? 'bg-white/10 text-white ring-1 ring-white/10' : 'text-slate-400 hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="font-semibold text-xs tracking-wide">{label}</span>
    </Link>
  );
}

export default AdminLayout;