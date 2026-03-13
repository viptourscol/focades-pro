import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, Bell, LifeBuoy, IdCard, ClipboardList } from 'lucide-react';
import { invokeAdminTickets } from '../lib/adminTickets';
import { supabase } from '../lib/supabase';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingTickets, setPendingTickets] = useState(0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  useEffect(() => {
    let mounted = true;

    const loadTicketBadge = async () => {
      const result = await invokeAdminTickets({ action: 'stats' });
      if (!mounted) return;

      if (result.ok) {
        setPendingTickets(Number(result.data?.stats?.pendientes || 0));
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
    <div className="flex h-screen bg-slate-50 font-sans">
      <aside className="w-72 bg-[#0f172a] text-white flex flex-col shadow-2xl z-20">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f9a03f] rounded-xl flex items-center justify-center font-black text-primary">F</div>
          <h1 className="font-black text-xl">FOCADES</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem to="/admin" icon={<LayoutDashboard size={20}/>} label="Dashboard" active={location.pathname === '/admin'} />
          <NavItem to="/admin/beneficiarios" icon={<IdCard size={20}/>} label="Beneficiarios" active={location.pathname.startsWith('/admin/beneficiarios')} />
          <NavItem to="/admin/actualizaciones" icon={<ClipboardList size={20}/>} label="Actualizaciones" active={location.pathname.startsWith('/admin/actualizaciones')} />
          <NavItem to="/admin/aspirantes" icon={<Users size={20}/>} label="Aspirantes" active={location.pathname === '/admin/aspirantes'} />
          <NavItem
            to="/admin/tickets"
            icon={<LifeBuoy size={20}/>}
            label="Tickets"
            active={location.pathname === '/admin/tickets'}
            badge={pendingTickets > 0 ? pendingTickets : 0}
          />
          <NavItem to="/admin/configuracion" icon={<Settings size={20}/>} label="Configuración" active={location.pathname === '/admin/configuracion'} />
        </nav>

        <div className="p-6 border-t border-slate-800/50">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 text-slate-500 hover:text-red-400 w-full px-4 py-3 font-bold text-sm transition-colors"
          >
            <LogOut size={18}/> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-10 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Panel Administrativo</h2>
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 bg-blue-50 rounded-full border border-blue-100 flex items-center justify-center text-blue-600">
              <Bell size={18} />
              {pendingTickets > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                  {pendingTickets > 99 ? '99+' : pendingTickets}
                </span>
              )}
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-full border border-blue-100 flex items-center justify-center text-blue-600 font-bold">A</div>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto p-10">
          <Outlet /> {/* AQUÍ SE CARGAN LAS PÁGINAS DEL ADMIN */}
        </section>
      </main>
    </div>
  );
};

function NavItem({ to, icon, label, active, badge = 0 }) {
  return (
    <Link 
      to={to}
      className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl transition-all duration-300 ${
        active ? 'bg-[#3b82f6] text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800/50'
      }`}
    >
      {icon}
      <span className="font-bold text-sm">{label}</span>
      {badge > 0 && (
        <span className={`ml-auto min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
          active ? 'bg-white text-secondary' : 'bg-red-500 text-white'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export default AdminLayout;