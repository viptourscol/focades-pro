import { useEffect, useState } from 'react';
import { HelpCircle, Plus, Pencil, Trash2, X, GripVertical, Eye, EyeOff } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';

const EMPTY_FORM = { question: '', answer: '', sort_order: 0, is_active: true };

// ── Fila sortable individual ────────────────────────────────────
function SortableFaqRow({ row, onEdit, onDelete, onToggle, isActive }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    position: 'relative',
    zIndex: isDragging ? 0 : 'auto',
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`transition-colors ${isDragging ? '' : 'hover:bg-slate-50'}`}
    >
      {/* Handle — única zona con listeners de arrastre */}
      <td
        {...attributes}
        {...listeners}
        className="px-4 py-3 cursor-grab active:cursor-grabbing select-none touch-none"
        title="Arrastra para reordenar"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors">
          <GripVertical size={16} className={isDragging ? 'text-primary' : 'text-slate-400'} />
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-primary leading-snug line-clamp-2">{row.question}</p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{row.answer}</p>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          title={row.is_active ? 'Activa — click para desactivar' : 'Inactiva — click para activar'}
          onClick={() => onToggle(row)}
          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${
            row.is_active
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {row.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
          {row.is_active ? 'Activa' : 'Oculta'}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            title="Editar"
            onClick={() => onEdit(row)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-primary hover:text-white transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => onDelete(row)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-error hover:text-white transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminFaq() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // id o null
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('portal_faq')
      .select('id, question, answer, sort_order, is_active, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) await showErrorAlert({ title: 'Error al cargar FAQ', text: error.message });
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    const maxOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;
    setForm({ ...EMPTY_FORM, sort_order: maxOrder });
    setEditing(null);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setForm({ question: row.question, answer: row.answer, sort_order: row.sort_order, is_active: row.is_active });
    setEditing(row.id);
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setFormError(''); };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSave = async () => {
    if (!form.question.trim()) { setFormError('La pregunta es obligatoria.'); return; }
    if (!form.answer.trim()) { setFormError('La respuesta es obligatoria.'); return; }
    setSaving(true);
    setFormError('');

    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      sort_order: parseInt(form.sort_order, 10) || 0,
      is_active: form.is_active,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('portal_faq').update(payload).eq('id', editing));
    } else {
      ({ error } = await supabase.from('portal_faq').insert(payload));
    }

    if (error) {
      setFormError(error.message);
    } else {
      await showSuccessAlert({ title: editing ? 'Pregunta actualizada' : 'Pregunta creada', text: '' });
      closeModal();
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async (row) => {
    const ok = await showConfirmAlert({
      title: '¿Eliminar esta pregunta?',
      text: `"${row.question.slice(0, 60)}…" será eliminada permanentemente.`,
      confirmText: 'Sí, eliminar',
    });
    if (!ok) return;
    const { error } = await supabase.from('portal_faq').delete().eq('id', row.id);
    if (error) { await showErrorAlert({ title: 'Error al eliminar', text: error.message }); return; }
    await showSuccessAlert({ title: 'Pregunta eliminada', text: '' });
    await load();
  };

  const toggleActive = async (row) => {
    const { error } = await supabase.from('portal_faq').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) { await showErrorAlert({ title: 'Error', text: error.message }); return; }
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
  };

  // ── Drag-and-drop (@dnd-kit) ──────────────────────────────────
  const [activeRow, setActiveRow] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // evita activar en clicks
    })
  );

  const handleDragStart = ({ active }) => {
    setActiveRow(rows.find((r) => r.id === active.id) ?? null);
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveRow(null);
    if (!over || active.id === over.id) return;
    const fromIdx = rows.findIndex((r) => r.id === active.id);
    const toIdx   = rows.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(rows, fromIdx, toIdx).map((r, i) => ({ ...r, sort_order: i + 1 }));
    setRows(reordered);
    await Promise.all(
      reordered.map((r) => supabase.from('portal_faq').update({ sort_order: r.sort_order }).eq('id', r.id))
    );
  };

  return (
    <div className="space-y-6">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">
            {rows.length} pregunta{rows.length !== 1 ? 's' : ''} en total ·{' '}
            {rows.filter((r) => r.is_active).length} activa{rows.filter((r) => r.is_active).length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2 rounded-xl hover:brightness-110 transition-all"
        >
          <Plus size={16} /> Agregar pregunta
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-slate-500">
          <HelpCircle size={32} className="mx-auto mb-3 text-slate-300" />
          No hay preguntas frecuentes. Crea la primera.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-slate-50">
                <tr>
                  <th className="px-4 py-3 w-14" title="Arrastra para reordenar"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Pregunta</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Acciones</th>
                </tr>
              </thead>
              <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <SortableFaqRow
                      key={row.id}
                      row={row}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onToggle={toggleActive}
                      isActive={activeRow?.id === row.id}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </div>

          {/* Overlay: muestra el ítem flotando mientras se arrastra */}
          <DragOverlay>
            {activeRow ? (
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-white shadow-2xl ring-2 ring-primary/40 rounded-xl opacity-95">
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center w-8 h-8">
                        <GripVertical size={16} className="text-primary" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-primary leading-snug line-clamp-2">{activeRow.question}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{activeRow.answer}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                        activeRow.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {activeRow.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                        {activeRow.is_active ? 'Activa' : 'Oculta'}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-28" />
                  </tr>
                </tbody>
              </table>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modal crear / editar */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-primary" />
                <h2 className="font-bold text-primary text-lg">
                  {editing ? 'Editar pregunta' : 'Nueva pregunta'}
                </h2>
              </div>
              <button type="button" onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Pregunta <span className="text-error">*</span>
                </label>
                <textarea
                  name="question"
                  rows={3}
                  value={form.question}
                  onChange={handleChange}
                  placeholder="¿Cuál es la pregunta que responderás?"
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Respuesta <span className="text-error">*</span>
                </label>
                <textarea
                  name="answer"
                  rows={7}
                  value={form.answer}
                  onChange={handleChange}
                  placeholder="Escribe la respuesta completa. Puedes usar saltos de línea para listas."
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">Los saltos de línea se mostrarán tal como los escribas.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Orden de visualización
                  </label>
                  <input
                    type="number"
                    name="sort_order"
                    min={0}
                    value={form.sort_order}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <p className="text-xs text-slate-400 mt-1">Número menor → aparece primero.</p>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="block text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">
                    Visibilidad
                  </label>
                  <label className="inline-flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={form.is_active}
                      onChange={handleChange}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {form.is_active ? 'Visible en el Landing' : 'Oculta (borrador)'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-primary text-white text-sm font-bold px-5 py-2 rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear pregunta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
