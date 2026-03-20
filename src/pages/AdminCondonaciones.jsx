import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, FileCheck2, FileText, FileX2, RefreshCcw, ScrollText, ShieldAlert, X } from 'lucide-react';
import { showConfirmAlert, showErrorAlert, showSuccessAlert, showTextareaConfirmAlert } from '../lib/alerts';
import { supabase } from '../lib/supabase';
import {
  CERTIFICATE_SIGNATURE_ROLES,
  loadActiveCertificateSignatures,
  openPazYSalvoPrintView,
} from '../lib/certificadoPazYSalvo';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO');
};

const semestralStateClass = (estado) => {
  if (estado === 'condonada') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  if (estado === 'no_condonada') return 'bg-rose-100 text-rose-700 ring-rose-200';
  return 'bg-amber-100 text-amber-700 ring-amber-200';
};

const finalStateClass = (estado) => {
  if (estado === 'aprobada_admin') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  if (estado === 'rechazada_admin') return 'bg-rose-100 text-rose-700 ring-rose-200';
  if (estado === 'preaprobada_sistema') return 'bg-blue-100 text-blue-700 ring-blue-200';
  return 'bg-amber-100 text-amber-700 ring-amber-200';
};

const certStateClass = (estado) => {
  if (estado === 'vigente') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  return 'bg-slate-200 text-slate-700 ring-slate-300';
};

const docStateClass = (estado) => {
  if (estado === 'aprobado') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  if (estado === 'rechazado') return 'bg-rose-100 text-rose-700 ring-rose-200';
  return 'bg-amber-100 text-amber-700 ring-amber-200';
};

const getDocFileName = (doc) => String(doc?.nombre_original || doc?.storage_path || '').toLowerCase();

const isPdfDocument = (doc) => getDocFileName(doc).endsWith('.pdf');

const isImageDocument = (doc) => /\.(png|jpg|jpeg|webp|gif)$/i.test(getDocFileName(doc));

const AdminCondonaciones = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [semestrales, setSemestrales] = useState([]);
  const [finales, setFinales] = useState([]);
  const [docsFinales, setDocsFinales] = useState([]);
  const [certificados, setCertificados] = useState([]);
  const [firmasConfig, setFirmasConfig] = useState({});
  const [firmasFiles, setFirmasFiles] = useState({});
  const [firmasSavingCargo, setFirmasSavingCargo] = useState('');
  const [finalDetailFilter, setFinalDetailFilter] = useState('todos');
  const [expandedDocId, setExpandedDocId] = useState(null);
  const [finalDetail, setFinalDetail] = useState({
    open: false,
    row: null,
    docs: [],
    loadingDocs: false,
  });

  const defaultFirmaState = useMemo(() => {
    const next = {};
    CERTIFICATE_SIGNATURE_ROLES.forEach((role) => {
      next[role.cargo] = {
        cargo: role.cargo,
        nombre_firmante: role.defaultName,
        titulo_firmante: role.defaultTitle,
        firma_storage_path: null,
        firma_url: null,
      };
    });
    return next;
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [semRes, finalRes, docsRes, certRes] = await Promise.all([
      supabase
        .from('portal_condonacion_semestral')
        .select('id,beneficiario_id,pago_id,actualizacion_id,semestre_texto,monto_desembolsado,promedio_reportado,estado_condonacion,motivo_no_condonada,revisado_at,created_at,portal_beneficiarios(id,nombre_completo,n_documento,email)')
        .order('created_at', { ascending: false })
        .limit(1200),
      supabase
        .from('portal_condonacion_final')
        .select('id,beneficiario_id,estado,observacion_admin,preaprobado_at,revisado_at,created_at,portal_beneficiarios(id,nombre_completo,n_documento,email)')
        .order('created_at', { ascending: false })
        .limit(1200),
      supabase
        .from('portal_condonacion_final_documentos')
        .select('id,beneficiario_id,tipo_documento,nombre_original,storage_path,estado_validacion,observacion_admin,created_at,revisado_at')
        .order('created_at', { ascending: false })
        .limit(2500),
      supabase
        .from('portal_condonacion_certificados')
        .select('id,beneficiario_id,condonacion_semestral_id,codigo_certificado,estado,hash_integridad,emitido_por_user_id,created_at,revocado_at,revocado_motivo,portal_beneficiarios(id,nombre_completo,n_documento,email)')
        .order('created_at', { ascending: false })
        .limit(1500),
    ]);

    if (semRes.error || finalRes.error || docsRes.error || certRes.error) {
      const message = semRes.error?.message || finalRes.error?.message || docsRes.error?.message || certRes.error?.message || 'No se pudo cargar condonaciones.';
      await showErrorAlert({ title: 'Error al cargar', text: message });
    }

    setSemestrales(Array.isArray(semRes.data) ? semRes.data : []);
    setFinales(Array.isArray(finalRes.data) ? finalRes.data : []);
    setDocsFinales(Array.isArray(docsRes.data) ? docsRes.data : []);
    setCertificados(Array.isArray(certRes.data) ? certRes.data : []);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    loadFirmasConfig();
  }, []);

  const loadFirmasConfig = async () => {
    const activeSignatures = await loadActiveCertificateSignatures(supabase);
    setFirmasConfig({
      ...defaultFirmaState,
      ...activeSignatures,
    });
  };

  const certByCondonacionId = useMemo(() => {
    const map = new Map();
    certificados.forEach((c) => {
      if (!map.has(c.condonacion_semestral_id)) map.set(c.condonacion_semestral_id, c);
    });
    return map;
  }, [certificados]);

  const docsByBenefId = useMemo(() => {
    const map = new Map();
    docsFinales.forEach((d) => {
      if (!map.has(d.beneficiario_id)) map.set(d.beneficiario_id, []);
      map.get(d.beneficiario_id).push(d);
    });
    return map;
  }, [docsFinales]);

  const semestralById = useMemo(() => {
    const map = new Map();
    semestrales.forEach((s) => {
      map.set(s.id, s);
    });
    return map;
  }, [semestrales]);

  const buildFinalDocsSummary = (docs) => ({
    total: docs.length,
    aprobados: docs.filter((doc) => doc.estado_validacion === 'aprobado').length,
    rechazados: docs.filter((doc) => doc.estado_validacion === 'rechazado').length,
    pendientes: docs.filter((doc) => doc.estado_validacion === 'pendiente').length,
  });

  const finalDetailSummary = useMemo(
    () => buildFinalDocsSummary(finalDetail.docs || []),
    [finalDetail.docs],
  );

  const filteredFinalDetailDocs = useMemo(() => {
    if (finalDetailFilter === 'todos') return finalDetail.docs || [];
    return (finalDetail.docs || []).filter((doc) => doc.estado_validacion === finalDetailFilter);
  }, [finalDetail.docs, finalDetailFilter]);

  const expandedDocIndex = useMemo(
    () => filteredFinalDetailDocs.findIndex((doc) => doc.id === expandedDocId),
    [filteredFinalDetailDocs, expandedDocId],
  );

  const expandedDoc = expandedDocIndex >= 0 ? filteredFinalDetailDocs[expandedDocIndex] : null;

  useEffect(() => {
    if (expandedDocId && expandedDocIndex === -1) {
      setExpandedDocId(null);
    }
  }, [expandedDocId, expandedDocIndex]);

  const q = search.trim().toLowerCase();
  const matchesQ = (row) => {
    if (!q) return true;
    const benef = row.portal_beneficiarios || {};
    return [benef.nombre_completo, benef.n_documento, benef.email, row.semestre_texto, row.estado, row.estado_condonacion]
      .map((x) => String(x || '').toLowerCase())
      .some((x) => x.includes(q));
  };

  const semestralesFiltradas = semestrales.filter(matchesQ);
  const finalesFiltradas = finales.filter(matchesQ);
  const certFiltrados = certificados.filter(matchesQ);

  const metricas = useMemo(() => ({
    semPendientes: semestrales.filter((x) => x.estado_condonacion === 'pendiente_admin').length,
    finalPendientes: finales.filter((x) => x.estado === 'preaprobada_sistema' || x.estado === 'pendiente_documentos').length,
    certificadosVigentes: certificados.filter((x) => x.estado === 'vigente').length,
    certificadosRevocados: certificados.filter((x) => x.estado === 'revocado').length,
  }), [semestrales, finales, certificados]);

  const withSaving = async (fn) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };

  const revisarSemestral = async (row, aprobar) => {
    await withSaving(async () => {
      let motivo = null;
      if (!aprobar) {
        motivo = await showTextareaConfirmAlert({
          title: 'Rechazar condonación semestral',
          text: 'Registra el motivo por el cual esta solicitud no será condonada.',
          inputLabel: 'Motivo de no condonación',
          inputPlaceholder: 'Escribe el motivo del rechazo...',
          inputValue: row.motivo_no_condonada || '',
          confirmButtonText: 'Guardar rechazo',
          requiredMessage: 'Debes indicar motivo para no condonar.',
        });
        if (!motivo) return;
      }

      const { data, error } = await supabase.rpc('admin_revisar_condonacion_semestral', {
        p_condonacion_id: row.id,
        p_aprobar: aprobar,
        p_motivo_no_condonada: motivo,
      });

      if (error || !data?.ok) {
        await showErrorAlert({ title: 'No se pudo revisar', text: error?.message || data?.message || 'Error al actualizar condonación semestral.' });
        return;
      }

      await showSuccessAlert({ title: 'Condonación semestral actualizada', text: `Estado: ${data.estado}` });
      await loadData();
    });
  };

  const generarCertificado = async (row) => {
    await withSaving(async () => {
      const { data, error } = await supabase.rpc('crear_certificado_condonacion_semestral', {
        p_condonacion_id: row.id,
      });

      if (error) {
        await showErrorAlert({ title: 'No se pudo generar certificado', text: error.message || 'Error desconocido.' });
        return;
      }

      const cert = Array.isArray(data) ? data[0] : null;
      await showSuccessAlert({
        title: 'Certificado generado',
        text: cert?.codigo_certificado ? `Código: ${cert.codigo_certificado}` : 'El certificado fue generado/reutilizado correctamente.',
      });

      await loadData();
    });
  };

  const revisarDocumentoFinal = async (doc, aprobar) => {
    await withSaving(async () => {
      let observacion = null;
      if (!aprobar) {
        observacion = await showTextareaConfirmAlert({
          title: 'Rechazar documento',
          text: 'Indica la observación administrativa del rechazo del soporte.',
          inputLabel: 'Observación del rechazo',
          inputPlaceholder: 'Escribe la observación del documento...',
          inputValue: doc.observacion_admin || '',
          confirmButtonText: 'Guardar rechazo',
          requiredMessage: 'Debes indicar observación al rechazar documento.',
        });
        if (!observacion) return;
      }

      const { data, error } = await supabase.rpc('admin_revisar_documento_condonacion_final', {
        p_documento_id: doc.id,
        p_aprobar: aprobar,
        p_observacion: observacion,
      });

      if (error || !data?.ok) {
        await showErrorAlert({ title: 'No se pudo revisar documento', text: error?.message || data?.message || 'Error al actualizar documento final.' });
        return;
      }

      await showSuccessAlert({ title: 'Documento actualizado', text: `Nuevo estado: ${data.estado_documento}` });
      await loadData();

      if (finalDetail.open) {
        setFinalDetail((prev) => ({
          ...prev,
          docs: prev.docs.map((item) => (
            item.id === doc.id
              ? {
                  ...item,
                  estado_validacion: data.estado_documento,
                  observacion_admin: observacion || item.observacion_admin,
                  revisado_at: new Date().toISOString(),
                }
              : item
          )),
        }));
      }
    });
  };

  const revisarFinal = async (row, aprobar) => {
    await withSaving(async () => {
      let observacion = null;
      if (!aprobar) {
        observacion = await showTextareaConfirmAlert({
          title: 'Rechazar condonación final',
          text: 'Registra el motivo administrativo del rechazo de la solicitud final.',
          inputLabel: 'Motivo del rechazo',
          inputPlaceholder: 'Escribe el motivo del rechazo final...',
          inputValue: row.observacion_admin || '',
          confirmButtonText: 'Guardar rechazo',
          requiredMessage: 'Debes indicar motivo para rechazar condonación final.',
        });
        if (!observacion) return;
      }

      const { data, error } = await supabase.rpc('admin_revisar_condonacion_final', {
        p_beneficiario_id: row.beneficiario_id,
        p_aprobar: aprobar,
        p_observacion: observacion,
      });

      if (error || !data?.ok) {
        await showErrorAlert({ title: 'No se pudo revisar', text: error?.message || data?.message || 'Error al actualizar condonación final.' });
        return;
      }

      await showSuccessAlert({ title: 'Condonación final actualizada', text: `Estado: ${data.estado}` });
      await loadData();

      if (finalDetail.open && finalDetail.row?.id === row.id) {
        setFinalDetail((prev) => ({
          ...prev,
          row: {
            ...prev.row,
            estado: data.estado,
            observacion_admin: observacion || prev.row?.observacion_admin,
          },
        }));
      }
    });
  };

  const openFinalDetail = async (row) => {
    const docs = docsByBenefId.get(row.beneficiario_id) || [];
    setFinalDetailFilter('todos');

    setFinalDetail({
      open: true,
      row,
      docs: docs.map((doc) => ({ ...doc, signed_url: null })),
      loadingDocs: true,
    });

    const docsWithUrls = await Promise.all(docs.map(async (doc) => {
      if (!doc.storage_path) {
        return { ...doc, signed_url: null };
      }

      const { data } = await supabase.storage
        .from('soportes')
        .createSignedUrl(doc.storage_path, 60 * 60);

      return {
        ...doc,
        signed_url: data?.signedUrl || null,
      };
    }));

    setFinalDetail({
      open: true,
      row,
      docs: docsWithUrls,
      loadingDocs: false,
    });
  };

  const closeFinalDetail = () => {
    setFinalDetailFilter('todos');
    setExpandedDocId(null);
    setFinalDetail({
      open: false,
      row: null,
      docs: [],
      loadingDocs: false,
    });
  };

  const revocarCertificado = async (cert) => {
    await withSaving(async () => {
      const confirm = await showConfirmAlert({
        title: '¿Revocar certificado?',
        text: `Código ${cert.codigo_certificado}. Esta acción quedará auditada.`,
        confirmButtonText: 'Revocar',
        cancelButtonText: 'Cancelar',
      });
      if (!confirm) return;

      const motivo = await showTextareaConfirmAlert({
        title: 'Revocar certificado',
        text: 'Registra el motivo administrativo de la revocación del certificado.',
        inputLabel: 'Motivo de revocación',
        inputPlaceholder: 'Escribe el motivo de la revocación...',
        inputValue: cert.revocado_motivo || '',
        confirmButtonText: 'Confirmar revocación',
        requiredMessage: 'Debes registrar motivo de revocación.',
      });
      if (!motivo) return;

      const { data, error } = await supabase.rpc('admin_revocar_certificado_condonacion', {
        p_certificado_id: cert.id,
        p_motivo: motivo,
      });

      if (error || !data?.ok) {
        await showErrorAlert({ title: 'No se pudo revocar', text: error?.message || data?.message || 'Error al revocar certificado.' });
        return;
      }

      await showSuccessAlert({ title: 'Certificado revocado', text: `Código ${cert.codigo_certificado} revocado.` });
      await loadData();
    });
  };

  const guardarFirmaCargo = async (cargo) => {
    setFirmasSavingCargo(cargo);
    try {
      const current = firmasConfig[cargo] || defaultFirmaState[cargo];
      let storagePath = current?.firma_storage_path || null;
      const selectedFile = firmasFiles[cargo] || null;

      if (selectedFile) {
        const safeName = String(selectedFile.name || 'firma.png').replace(/[^a-zA-Z0-9._-]/g, '_');
        storagePath = `firmas-certificados/${cargo}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('soportes')
          .upload(storagePath, selectedFile, {
            upsert: true,
            contentType: selectedFile.type || 'image/png',
          });

        if (uploadError) {
          const uploadMessage = String(uploadError.message || '').toLowerCase();
          if (uploadMessage.includes('row-level security') || uploadMessage.includes('policy') || uploadMessage.includes('permission')) {
            throw new Error('No tienes permisos de Storage para firmas. Falta aplicar la migracion de politicas 202603170003_storage_firmas_certificados_policies.sql.');
          }
          throw new Error(uploadError.message || 'No se pudo subir la firma.');
        }
      }

      const { data, error } = await supabase.rpc('admin_upsert_certificado_firma', {
        p_cargo: cargo,
        p_nombre_firmante: String(current?.nombre_firmante || '').trim(),
        p_titulo_firmante: String(current?.titulo_firmante || '').trim(),
        p_firma_storage_path: storagePath,
        p_activo: true,
      });

      if (error || !data?.ok) {
        const rpcMessageRaw = String(error?.message || data?.message || '');
        const rpcMessage = rpcMessageRaw.toLowerCase();
        if (rpcMessage.includes('404') || rpcMessage.includes('not found') || rpcMessage.includes('no route matched')) {
          throw new Error('Tu entorno no tiene aun el backend de firmas. Aplica las migraciones 202603170001 y 202603170002 para habilitar esta funcionalidad.');
        }
        throw new Error(error?.message || data?.message || 'No se pudo guardar configuracion de firma.');
      }

      setFirmasFiles((prev) => ({ ...prev, [cargo]: null }));
      await loadFirmasConfig();
      await showSuccessAlert({ title: 'Firma actualizada', text: 'La firma del certificado fue guardada correctamente.' });
    } catch (error) {
      await showErrorAlert({ title: 'Error de firma', text: error?.message || 'No se pudo guardar la firma.' });
    } finally {
      setFirmasSavingCargo('');
    }
  };

  const imprimirPazYSalvo = async (cert, semestralRow = null) => {
    try {
      const semestral = semestralRow || semestralById.get(cert.condonacion_semestral_id) || null;
      const beneficiario = cert.portal_beneficiarios || semestral?.portal_beneficiarios || {};

      openPazYSalvoPrintView({
        codigo_certificado: cert.codigo_certificado,
        verify_url: `${window.location.origin}/verificar-certificado?code=${encodeURIComponent(cert.codigo_certificado)}`,
        beneficiario_nombre: beneficiario.nombre_completo || 'No disponible',
        beneficiario_documento: beneficiario.n_documento || 'No disponible',
        semestre_texto: semestral?.semestre_texto || 'No disponible',
        monto_condonado: semestral?.monto_desembolsado || 0,
        fecha_emision: cert.created_at,
        estado: cert.estado,
        hash_integridad: cert.hash_integridad || 'No disponible',
        signatures: firmasConfig,
      });
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo imprimir', text: error?.message || 'Error al abrir el paz y salvo.' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-border rounded-2xl p-6">
        <h1 className="text-2xl font-black text-primary">Condonaciones y Certificados</h1>
        <p className="text-sm text-slate-600 mt-1">
          Revisión administrativa de condonación semestral/final y auditoría visual de certificados emitidos y revocados.
        </p>

        <div className="mt-4 grid md:grid-cols-4 gap-3">
          <Metric title="Semestrales pendientes" value={metricas.semPendientes} tone="bg-amber-50" icon={<ShieldAlert size={16} className="text-amber-700" />} />
          <Metric title="Finales pendientes" value={metricas.finalPendientes} tone="bg-blue-50" icon={<FileCheck2 size={16} className="text-blue-700" />} />
          <Metric title="Certificados vigentes" value={metricas.certificadosVigentes} tone="bg-emerald-50" icon={<CheckCircle2 size={16} className="text-emerald-700" />} />
          <Metric title="Certificados revocados" value={metricas.certificadosRevocados} tone="bg-slate-100" icon={<FileX2 size={16} className="text-slate-700" />} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento, email o estado"
            className="w-full md:w-[420px] border border-border rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={loadData}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw size={14} /> Recargar
          </button>
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-black text-primary">Firmas del Paz y Salvo</h2>
        <p className="text-sm text-slate-600 mt-1">
          Administra las firmas oficiales que apareceran en los certificados. Si cambia el alcalde o el secretario,
          actualiza aqui su nombre, cargo y firma.
        </p>

        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {CERTIFICATE_SIGNATURE_ROLES.map((role) => {
            const item = firmasConfig[role.cargo] || defaultFirmaState[role.cargo];
            const isSavingThis = firmasSavingCargo === role.cargo;
            return (
              <div key={role.cargo} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-black text-slate-800 uppercase tracking-wide">{role.label}</p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Nombre firmante</label>
                  <input
                    type="text"
                    value={item?.nombre_firmante || ''}
                    onChange={(e) => setFirmasConfig((prev) => ({
                      ...prev,
                      [role.cargo]: {
                        ...(prev[role.cargo] || defaultFirmaState[role.cargo]),
                        nombre_firmante: e.target.value,
                      },
                    }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    placeholder={role.defaultName}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Titulo / cargo</label>
                  <input
                    type="text"
                    value={item?.titulo_firmante || ''}
                    onChange={(e) => setFirmasConfig((prev) => ({
                      ...prev,
                      [role.cargo]: {
                        ...(prev[role.cargo] || defaultFirmaState[role.cargo]),
                        titulo_firmante: e.target.value,
                      },
                    }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    placeholder={role.defaultTitle}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Archivo de firma (PNG/JPG)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => setFirmasFiles((prev) => ({ ...prev, [role.cargo]: e.target.files?.[0] || null }))}
                    className="block w-full text-xs"
                  />
                  {item?.firma_url ? (
                    <img src={item.firma_url} alt={`Firma ${role.label}`} className="h-14 object-contain border border-slate-200 rounded bg-slate-50 px-2" />
                  ) : (
                    <p className="text-xs text-slate-400">Sin firma cargada</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => guardarFirmaCargo(role.cargo)}
                  disabled={isSavingThis}
                  className="px-3 py-2 rounded-lg bg-secondary text-white text-xs font-bold hover:bg-secondary/90 disabled:opacity-60"
                >
                  {isSavingThis ? 'Guardando...' : 'Guardar firma'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-black text-primary">Condonación Semestral</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="text-slate-500 border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Beneficiario</th>
                <th className="text-left py-2 pr-3">Semestre</th>
                <th className="text-left py-2 pr-3">Monto</th>
                <th className="text-left py-2 pr-3">Estado</th>
                <th className="text-left py-2 pr-3">Certificado</th>
                <th className="text-right py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">Cargando...</td></tr>
              )}
              {!loading && semestralesFiltradas.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No hay registros semestrales.</td></tr>
              )}
              {semestralesFiltradas.map((row) => {
                const benef = row.portal_beneficiarios || {};
                const cert = certByCondonacionId.get(row.id);
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-800">{benef.nombre_completo || 'Sin nombre'}</p>
                      <p className="text-xs text-slate-500">{benef.n_documento || '—'} · {benef.email || '—'}</p>
                    </td>
                    <td className="py-3 pr-3">{row.semestre_texto || '—'}</td>
                    <td className="py-3 pr-3">{formatCurrency(row.monto_desembolsado)}</td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${semestralStateClass(row.estado_condonacion)}`}>
                        {row.estado_condonacion}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {cert ? (
                        <div>
                          <p className="font-mono text-xs text-slate-700">{cert.codigo_certificado}</p>
                          <p className="text-xs text-slate-500">{cert.estado}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">Sin emitir</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        {row.estado_condonacion === 'pendiente_admin' && (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => revisarSemestral(row, true)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60"
                            >
                              Aprobar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => revisarSemestral(row, false)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-60"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {row.estado_condonacion === 'condonada' && (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => generarCertificado(row)}
                              className="px-3 py-1.5 rounded-lg border border-secondary text-secondary text-xs font-bold hover:bg-secondary hover:text-white disabled:opacity-60"
                            >
                              Emitir/Reemitir certificado
                            </button>
                            {cert && (
                              <button
                                type="button"
                                onClick={() => imprimirPazYSalvo(cert, row)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                              >
                                Imprimir paz y salvo PDF
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-black text-primary">Condonación Final</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-slate-500 border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Beneficiario</th>
                <th className="text-left py-2 pr-3">Estado final</th>
                <th className="text-left py-2 pr-3">Documentos</th>
                <th className="text-left py-2 pr-3">Observación</th>
                <th className="text-right py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">Cargando...</td></tr>
              )}
              {!loading && finalesFiltradas.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">No hay registros finales.</td></tr>
              )}
              {finalesFiltradas.map((row) => {
                const benef = row.portal_beneficiarios || {};
                const docs = docsByBenefId.get(row.beneficiario_id) || [];
                const docsSummary = buildFinalDocsSummary(docs);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 align-top cursor-pointer hover:bg-slate-50/70"
                    onClick={() => openFinalDetail(row)}
                  >
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-800">{benef.nombre_completo || 'Sin nombre'}</p>
                      <p className="text-xs text-slate-500">{benef.n_documento || '—'} · {benef.email || '—'}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${finalStateClass(row.estado)}`}>
                        {row.estado}
                      </span>
                      <p className="text-xs text-slate-500 mt-2">Preaprobado: {formatDateTime(row.preaprobado_at)}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 min-w-[220px]">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resumen</p>
                        {docs.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-400">Sin documentos</p>
                        ) : (
                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            <p>Total: <span className="font-bold text-slate-800">{docsSummary.total}</span></p>
                            <p>Aprobados: <span className="font-bold text-emerald-700">{docsSummary.aprobados}</span></p>
                            <p>Pendientes: <span className="font-bold text-amber-700">{docsSummary.pendientes}</span></p>
                            <p>Rechazados: <span className="font-bold text-rose-700">{docsSummary.rechazados}</span></p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600 max-w-[260px]">{row.observacion_admin || 'Sin observación'}</td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openFinalDetail(row);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
                        >
                          <Eye size={14} /> Ver detalle
                        </button>
                        <button
                          type="button"
                          disabled={saving || docsSummary.pendientes > 0}
                          onClick={(event) => {
                            event.stopPropagation();
                            revisarFinal(row, true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                          title={docsSummary.pendientes > 0 ? 'Debes aprobar o rechazar todos los documentos pendientes antes de aprobar la solicitud final.' : 'Aprobar solicitud final'}
                        >
                          Aprobar final
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(event) => {
                            event.stopPropagation();
                            revisarFinal(row, false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-60"
                        >
                          Rechazar final
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {finalDetail.open && finalDetail.row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 bg-slate-50">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Solicitud de condonación final</p>
                <h3 className="mt-1 text-2xl font-black text-primary">
                  {finalDetail.row.portal_beneficiarios?.nombre_completo || 'Beneficiario'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {finalDetail.row.portal_beneficiarios?.n_documento || '—'} · {finalDetail.row.portal_beneficiarios?.email || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFinalDetail}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-white hover:text-slate-800"
                aria-label="Cerrar detalle"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado final</p>
                  <span className={`mt-3 inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${finalStateClass(finalDetail.row.estado)}`}>
                    {finalDetail.row.estado}
                  </span>
                  <p className="mt-3 text-xs text-slate-500">Preaprobado: {formatDateTime(finalDetail.row.preaprobado_at)}</p>
                  <p className="mt-1 text-xs text-slate-500">Creado: {formatDateTime(finalDetail.row.created_at)}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Observación administrativa</p>
                  <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {finalDetail.row.observacion_admin || 'Sin observación registrada.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-black text-slate-900">Documentos cargados</h4>
                  <p className="text-sm text-slate-500">Revisa y valida cada soporte desde este detalle.</p>
                  <p className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    Mostrando {filteredFinalDetailDocs.length} de {finalDetail.docs.length} documento(s)
                  </p>
                  {finalDetailSummary.pendientes > 0 && (
                    <p className="mt-2 text-xs font-bold text-amber-700">
                      Hay {finalDetailSummary.pendientes} documento(s) pendiente(s). Debes aprobarlos o rechazarlos antes de aprobar la solicitud final.
                    </p>
                  )}
                </div>
                <div className="inline-flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving || finalDetailSummary.pendientes > 0}
                    onClick={() => revisarFinal(finalDetail.row, true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    title={finalDetailSummary.pendientes > 0 ? 'Debes aprobar o rechazar todos los documentos pendientes antes de aprobar la solicitud final.' : 'Aprobar solicitud final'}
                  >
                    Aprobar final
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => revisarFinal(finalDetail.row, false)}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-60"
                  >
                    Rechazar final
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'todos', label: `Todos (${finalDetailSummary.total})` },
                  { key: 'pendiente', label: `Pendientes (${finalDetailSummary.pendientes})` },
                  { key: 'aprobado', label: `Aprobados (${finalDetailSummary.aprobados})` },
                  { key: 'rechazado', label: `Rechazados (${finalDetailSummary.rechazados})` },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setFinalDetailFilter(filter.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${finalDetailFilter === filter.key ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {finalDetail.loadingDocs ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Cargando documentos de la solicitud...
                </div>
              ) : finalDetail.docs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Esta solicitud no tiene documentos cargados.
                </div>
              ) : filteredFinalDetailDocs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No hay documentos que coincidan con el filtro seleccionado.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredFinalDetailDocs.map((doc) => (
                    <div key={doc.id} className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-800 capitalize">{String(doc.tipo_documento || '').replaceAll('_', ' ')}</p>
                          <p className="text-xs text-slate-500 break-all mt-1">{doc.nombre_original || doc.storage_path || 'Sin archivo'}</p>
                        </div>
                        <FileText size={18} className="text-slate-400 shrink-0" />
                      </div>

                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${docStateClass(doc.estado_validacion)}`}>
                        {doc.estado_validacion}
                      </span>

                      <div className="text-xs text-slate-500 space-y-1">
                        <p>Cargado: {formatDateTime(doc.created_at)}</p>
                        <p>Revisado: {formatDateTime(doc.revisado_at)}</p>
                      </div>

                      <div
                        className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
                        title={doc.signed_url ? 'Doble clic para abrir el documento a tamaño completo' : 'Vista previa no disponible'}
                      >
                        {!doc.signed_url ? (
                          <div className="h-52 flex items-center justify-center px-4 text-center text-xs text-slate-400">
                            No fue posible generar vista previa del documento.
                          </div>
                        ) : isPdfDocument(doc) ? (
                          <>
                            <iframe
                              src={doc.signed_url}
                              title={`Vista previa de ${doc.nombre_original || doc.tipo_documento}`}
                              className="h-64 w-full bg-white"
                            />
                            <div
                              className="absolute inset-0 cursor-zoom-in"
                              onDoubleClick={() => setExpandedDocId(doc.id)}
                            />
                          </>
                        ) : isImageDocument(doc) ? (
                          <div
                            className="h-64 bg-white flex items-center justify-center p-3 cursor-zoom-in"
                            onDoubleClick={() => setExpandedDocId(doc.id)}
                          >
                            <img
                              src={doc.signed_url}
                              alt={doc.nombre_original || doc.tipo_documento}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="h-52 flex items-center justify-center px-4 text-center text-xs text-slate-500">
                            Vista previa no disponible para este formato. Usa Ver documento para abrir el archivo.
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 min-h-[72px]">
                        <p className="font-bold uppercase tracking-wide text-slate-500 mb-1">Observación</p>
                        <p>{doc.observacion_admin || 'Sin observación registrada.'}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={doc.signed_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className={`px-3 py-2 rounded-lg text-xs font-bold border ${doc.signed_url ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-slate-200 text-slate-400 pointer-events-none'}`}
                        >
                          Ver documento
                        </a>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => revisarDocumentoFinal(doc, true)}
                          className="px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Aprobar doc
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => revisarDocumentoFinal(doc, false)}
                          className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-50 disabled:opacity-60"
                        >
                          Rechazar doc
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {expandedDoc && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/75 p-5">
                <div className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Visor ampliado</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {expandedDoc.nombre_original || expandedDoc.storage_path || expandedDoc.tipo_documento}
                      </p>
                      <p className="text-xs text-slate-500">
                        Documento {expandedDocIndex + 1} de {filteredFinalDetailDocs.length}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={expandedDocIndex <= 0}
                        onClick={() => setExpandedDocId(filteredFinalDetailDocs[expandedDocIndex - 1]?.id || null)}
                        className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Documento anterior"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        disabled={expandedDocIndex < 0 || expandedDocIndex >= filteredFinalDetailDocs.length - 1}
                        onClick={() => setExpandedDocId(filteredFinalDetailDocs[expandedDocIndex + 1]?.id || null)}
                        className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Documento siguiente"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <a
                        href={expandedDoc.signed_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${expandedDoc.signed_url ? 'border-slate-300 text-slate-700 hover:bg-white' : 'border-slate-200 text-slate-400 pointer-events-none'}`}
                      >
                        Abrir aparte
                      </a>
                      <button
                        type="button"
                        onClick={() => setExpandedDocId(null)}
                        className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-white"
                        aria-label="Cerrar visor"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-100 p-4">
                    {!expandedDoc.signed_url ? (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                        No fue posible cargar el documento ampliado.
                      </div>
                    ) : isPdfDocument(expandedDoc) ? (
                      <iframe
                        src={expandedDoc.signed_url}
                        title={`Documento ampliado ${expandedDoc.nombre_original || expandedDoc.tipo_documento}`}
                        className="h-full w-full rounded-2xl bg-white"
                      />
                    ) : isImageDocument(expandedDoc) ? (
                      <div className="flex h-full items-center justify-center rounded-2xl bg-white p-4">
                        <img
                          src={expandedDoc.signed_url}
                          alt={expandedDoc.nombre_original || expandedDoc.tipo_documento}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                        Vista ampliada no disponible para este formato. Usa Abrir aparte para revisarlo.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-black text-primary inline-flex items-center gap-2">
          <ScrollText size={18} /> Auditoría de Certificados
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Seguimiento de certificados emitidos y revocados con trazabilidad de estado y motivo.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="text-slate-500 border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Código</th>
                <th className="text-left py-2 pr-3">Beneficiario</th>
                <th className="text-left py-2 pr-3">Estado</th>
                <th className="text-left py-2 pr-3">Emitido</th>
                <th className="text-left py-2 pr-3">Revocado</th>
                <th className="text-left py-2 pr-3">Motivo</th>
                <th className="text-right py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-500">Cargando...</td></tr>
              )}
              {!loading && certFiltrados.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay certificados registrados.</td></tr>
              )}
              {certFiltrados.map((cert) => {
                const benef = cert.portal_beneficiarios || {};
                return (
                  <tr key={cert.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-mono text-xs text-slate-800">{cert.codigo_certificado}</td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-800">{benef.nombre_completo || 'Sin nombre'}</p>
                      <p className="text-xs text-slate-500">{benef.n_documento || '—'} · {benef.email || '—'}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${certStateClass(cert.estado)}`}>
                        {cert.estado}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">
                      <p>{formatDateTime(cert.created_at)}</p>
                      <p className="text-slate-500">por: {cert.emitido_por_user_id || '—'}</p>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">{formatDateTime(cert.revocado_at)}</td>
                    <td className="py-3 pr-3 text-xs text-slate-600 max-w-[240px]">{cert.revocado_motivo || '—'}</td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => imprimirPazYSalvo(cert)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                        >
                          Imprimir paz y salvo PDF
                        </button>
                        {cert.estado === 'vigente' ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => revocarCertificado(cert)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 disabled:opacity-60"
                          >
                            Revocar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Sin acción</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(saving || loading) && (
        <div className="fixed bottom-5 right-5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm shadow-lg">
          {loading ? 'Cargando condonaciones...' : 'Procesando acción...'}
        </div>
      )}
    </div>
  );
};

const Metric = ({ title, value, icon, tone }) => (
  <div className={`${tone} rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
    <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">{icon}</div>
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

export default AdminCondonaciones;
