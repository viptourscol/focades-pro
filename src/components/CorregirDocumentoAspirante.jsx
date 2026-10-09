import { useState } from 'react';
import Swal from 'sweetalert2';
import { Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  showConfirmAlert,
  showErrorAlert,
  showSuccessAlert,
  showTextareaConfirmAlert,
  showWarningAlert,
} from '../lib/alerts';

const FUNCTION_NAME = 'admin-corregir-documento-aspirante';
const DOCUMENT_PATTERN = /^[A-Za-z0-9-]{4,30}$/;

const showLoading = (title) =>
  Swal.fire({
    title,
    text: 'No cierres esta ventana.',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });

const invokeCorrection = async (body) => {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

  if (error) {
    let message = error.message;
    try {
      const payload = await error.context.json();
      message = payload?.error || message;
    } catch {
      // se conserva el mensaje genérico
    }
    throw new Error(message);
  }

  if (!data?.ok) throw new Error(data?.error || 'No se pudo completar la operación.');
  return data;
};

const CorregirDocumentoAspirante = ({ aspirante, onCorrected }) => {
  const [busy, setBusy] = useState(false);

  const runRegeneration = async () => {
    showLoading('Regenerando documentos...');
    let failure = null;
    try {
      await invokeCorrection({ mode: 'regenerar', inscripcion_id: aspirante.id });
    } catch (error) {
      failure = error;
    }
    Swal.close();

    if (failure) {
      await showErrorAlert({ title: 'No se pudo generar', text: failure.message });
      return false;
    }

    await showSuccessAlert({
      title: 'Documentos regenerados',
      text: 'Los documentos automáticos se generaron con el número corregido.',
    });
    return true;
  };

  const retryRegeneration = async () => {
    for (;;) {
      const retry = await showConfirmAlert({
        title: 'Reintentar generación',
        text: 'Los documentos automáticos aún no se generaron con el número corregido. ¿Reintentar ahora?',
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Más tarde',
      });
      if (!retry) return false;
      if (await runRegeneration()) return true;
    }
  };

  const handleCorrect = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const input = await Swal.fire({
        title: 'Corregir número de documento',
        text: `Radicado ${aspirante.radicado}. Se moverán los archivos y se regenerarán los documentos automáticos con el nuevo número.`,
        input: 'text',
        inputLabel: 'Número de documento correcto',
        inputAttributes: { maxlength: '30', autocomplete: 'off', autocapitalize: 'off' },
        inputValidator: (value) =>
          DOCUMENT_PATTERN.test(String(value || '').trim())
            ? undefined
            : 'Usa entre 4 y 30 letras, números o guiones, sin espacios ni puntos.',
        showCancelButton: true,
        confirmButtonText: 'Revisar cambios',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0f2b54',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false,
      });
      if (!input.isConfirmed) return;
      const nuevoDocumento = String(input.value || '').trim();

      showLoading('Revisando archivos...');
      let preview;
      try {
        preview = await invokeCorrection({
          mode: 'preview',
          inscripcion_id: aspirante.id,
          nuevo_n_documento: nuevoDocumento,
        });
      } finally {
        Swal.close();
      }

      if (preview.bloqueos?.length) {
        await showErrorAlert({ title: 'No se puede aplicar el cambio', text: preview.bloqueos.join(' ') });
        return;
      }

      const aMover = preview.archivos.filter((file) => file.estado === 'mover').length;
      const faltantes = preview.archivos.filter((file) => file.estado === 'faltante').length;
      const motivo = await showTextareaConfirmAlert({
        title: 'Confirmar corrección',
        text:
          `Documento ${preview.documento_actual || 'sin registrar'} → ${nuevoDocumento}. ` +
          `Se moverán ${aMover} archivo(s) en R2, se regenerarán los PDF automáticos y quedará constancia en la bitácora.` +
          (faltantes ? ` ${faltantes} archivo(s) no se encontraron en R2.` : ''),
        inputLabel: 'Motivo de la corrección',
        inputPlaceholder: 'Ej.: El aspirante digitó mal su número de documento.',
        confirmButtonText: 'Corregir documento',
        requiredMessage: 'Debes indicar el motivo de la corrección.',
      });
      if (!motivo) return;

      showLoading('Moviendo archivos y regenerando documentos...');
      let result;
      try {
        result = await invokeCorrection({
          mode: 'apply',
          inscripcion_id: aspirante.id,
          nuevo_n_documento: nuevoDocumento,
          motivo,
        });
      } finally {
        Swal.close();
      }

      if (result.sin_cambios) {
        const regenerate = await showConfirmAlert({
          title: 'Archivos ya actualizados',
          text: 'El documento y los archivos ya estaban actualizados. ¿Quieres regenerar los documentos automáticos con este número? Se creará una versión nueva.',
          confirmButtonText: 'Regenerar',
          cancelButtonText: 'No',
        });
        if (regenerate && !(await runRegeneration())) await retryRegeneration();
        onCorrected?.();
        return;
      }

      const notes = [];
      if (result.resultado?.faltantes) notes.push(`${result.resultado.faltantes} archivo(s) no se encontraron en R2.`);
      if (result.resultado?.pendientes_limpieza?.length) {
        notes.push(`${result.resultado.pendientes_limpieza.length} archivo(s) antiguos quedaron pendientes de eliminar en R2 (registrado en la bitácora).`);
      }
      const regenerationFailed = result.regeneracion?.ok === false;
      if (regenerationFailed) notes.push(`No se regeneraron los documentos automáticos: ${result.regeneracion.error}`);

      if (notes.length) {
        await showWarningAlert({
          title: 'Documento corregido con avisos',
          text: `El número y los archivos ya se actualizaron. ${notes.join(' ')}`,
        });
        if (regenerationFailed) await retryRegeneration();
      } else {
        await showSuccessAlert({
          title: 'Documento corregido',
          text: `Se actualizó el número y se movieron ${result.resultado?.movidos ?? 0} archivo(s).`,
        });
      }

      onCorrected?.();
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo corregir el documento', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCorrect}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Corregir número de documento y mover archivos"
    >
      <Pencil size={12} /> {busy ? 'Procesando...' : 'Corregir documento'}
    </button>
  );
};

export default CorregirDocumentoAspirante;
