import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Search,
  Filter,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Send,
  X,
  ChevronLeft,
  Lock,
  User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import ChatBubble from '../components/ChatBubble'
import ChatInput from '../components/ChatInput'

export default function TicketsAdmin() {
  const [tickets, setTickets] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [sending, setSending] = useState(false)

  const chatEndRef = useRef(null)

  const loadTickets = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session) {
        console.error('No hay sesión de admin')
        return
      }

      const { data, error } = await supabase.functions.invoke('admin-list-tickets', {
        body: {
          estado: filtroEstado === 'all' ? undefined : filtroEstado,
          query: searchQuery.trim() || undefined,
          limit: 100,
        },
      })

      if (error) {
        console.error('Error cargando tickets:', error)
        return
      }

      if (data?.ok) {
        setTickets(data.tickets || [])
        setMensajes(data.mensajes || [])
        setStats(data.stats || {})
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [filtroEstado, searchQuery])

  useEffect(() => {
    loadTickets()
    const interval = setInterval(loadTickets, 30000) // Polling cada 30s
    return () => clearInterval(interval)
  }, [loadTickets])

  useEffect(() => {
    if (selectedTicket && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedTicket, mensajes])

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket)
    setShowMobileChat(true)
  }

  const handleBackToList = () => {
    setShowMobileChat(false)
    setSelectedTicket(null)
  }

  const handleSendMessage = async (mensaje) => {
    if (!selectedTicket || sending) return

    setSending(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session) {
        alert('Sesión expirada')
        return
      }

      const { data, error } = await supabase.functions.invoke('admin-send-message-ticket', {
        body: {
          ticket_id: selectedTicket.id,
          mensaje,
          estado: 'en_revision',
        },
      })

      if (error || !data?.ok) {
        alert(data?.error || 'Error enviando mensaje')
        return
      }

      // Recargar tickets para ver el nuevo mensaje
      await loadTickets()
    } catch (err) {
      console.error('Error:', err)
      alert('Error enviando mensaje')
    } finally {
      setSending(false)
    }
  }

  const handleCloseTicket = async () => {
    if (!selectedTicket) return
    if (!confirm('¿Cerrar este ticket? No se podrán agregar más mensajes.')) return

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session) {
        alert('Sesión expirada')
        return
      }

      const { data, error } = await supabase.functions.invoke('admin-close-ticket', {
        body: { ticket_id: selectedTicket.id },
      })

      if (error || !data?.ok) {
        alert(data?.error || 'Error cerrando ticket')
        return
      }

      alert('Ticket cerrado correctamente')
      await loadTickets()
      setSelectedTicket(null)
      setShowMobileChat(false)
    } catch (err) {
      console.error('Error:', err)
      alert('Error cerrando ticket')
    }
  }

  const getEstadoInfo = (estado) => {
    switch (estado) {
      case 'recibido':
        return { icon: Clock, color: 'bg-blue-100 text-blue-800', label: 'Recibido' }
      case 'en_revision':
        return { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800', label: 'En Revisión' }
      case 'respondido':
        return { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Respondido' }
      case 'cerrado':
        return { icon: XCircle, color: 'bg-gray-100 text-gray-800', label: 'Cerrado' }
      default:
        return { icon: AlertCircle, color: 'bg-gray-100 text-gray-800', label: estado }
    }
  }

  const ticketMensajes = selectedTicket
    ? mensajes.filter((m) => m.ticket_id === selectedTicket.id)
    : []

  const isClosed = selectedTicket?.cerrado_at

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Tickets de Soporte</h1>
          <div className="mt-2 flex gap-4 text-sm">
            <span className="text-gray-600">
              Total: <span className="font-semibold">{stats.total || 0}</span>
            </span>
            <span className="text-blue-600">
              Recibidos: <span className="font-semibold">{stats.recibido || 0}</span>
            </span>
            <span className="text-yellow-600">
              En Revisión: <span className="font-semibold">{stats.en_revision || 0}</span>
            </span>
            <span className="text-green-600">
              Respondidos: <span className="font-semibold">{stats.respondido || 0}</span>
            </span>
            <span className="text-gray-600">
              Cerrados: <span className="font-semibold">{stats.cerrado || 0}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Lista de tickets (desktop siempre visible, mobile condicional) */}
        <aside
          className={`w-full md:w-96 bg-white border-r border-gray-200 flex flex-col ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Filtros */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por código, email, asunto..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFiltroEstado('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroEstado === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroEstado('recibido')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroEstado === 'recibido'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Recibidos
              </button>
              <button
                onClick={() => setFiltroEstado('en_revision')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroEstado === 'en_revision'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En Revisión
              </button>
              <button
                onClick={() => setFiltroEstado('cerrado')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroEstado === 'cerrado'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cerrados
              </button>
            </div>
          </div>

          {/* Lista scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Cargando tickets...</div>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <Filter className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No hay tickets con estos filtros</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {tickets.map((ticket) => {
                  const estadoInfo = getEstadoInfo(ticket.estado)
                  const EstadoIcon = estadoInfo.icon
                  const ticketMessages = mensajes.filter((m) => m.ticket_id === ticket.id)
                  const lastMessage = ticketMessages[ticketMessages.length - 1]

                  return (
                    <button
                      key={ticket.id}
                      onClick={() => handleSelectTicket(ticket)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                        selectedTicket?.id === ticket.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {ticket.ticket_codigo}
                          </p>
                          <p className="text-xs text-gray-500">{ticket.email_contacto}</p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${estadoInfo.color}`}
                        >
                          <EstadoIcon className="w-3 h-3" />
                          {estadoInfo.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 font-medium mb-1 line-clamp-1">
                        {ticket.asunto}
                      </p>
                      {lastMessage && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {lastMessage.autor_tipo === 'admin' ? '✓ ' : ''}
                          {lastMessage.mensaje}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(ticket.created_at).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Chat Area */}
        <main
          className={`flex-1 flex flex-col bg-gray-50 ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedTicket ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackToList}
                    className="md:hidden text-gray-600 hover:text-gray-900"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {selectedTicket.ticket_codigo}
                    </p>
                    <p className="text-xs text-gray-500">{selectedTicket.email_contacto}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isClosed && (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Cerrado
                    </span>
                  )}
                  {!isClosed && (
                    <button
                      onClick={handleCloseTicket}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      Cerrar Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Asunto como primer mensaje */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-blue-900 mb-1">Asunto del Ticket</p>
                  <p className="text-sm text-blue-800">{selectedTicket.asunto}</p>
                </div>

                {ticketMensajes.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    autorTipo={msg.autor_tipo}
                    mensaje={msg.mensaje}
                    timestamp={msg.created_at}
                    nombreAdmin={msg.autor_tipo === 'admin' ? 'Admin FOCADES' : null}
                  />
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              {!isClosed && (
                <div className="border-t border-gray-200 bg-white p-4">
                  <ChatInput
                    onSend={handleSendMessage}
                    disabled={sending}
                    placeholder="Escribe tu respuesta al beneficiario..."
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <User className="w-16 h-16 mx-auto mb-3" />
                <p>Selecciona un ticket para ver la conversación</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
