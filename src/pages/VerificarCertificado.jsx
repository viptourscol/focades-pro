import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(numeric);
};

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const VerificarCertificado = () => {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const verify = async (inputCode) => {
    const normalized = String(inputCode || '').trim();
    if (!normalized) {
      setError('Ingresa un codigo de certificado.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const { data, error: rpcError } = await supabase.rpc('verify_condonacion_certificado_publico', {
      p_codigo: normalized,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message || 'No fue posible validar el certificado.');
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      setError('El servicio no devolvio informacion de verificacion.');
      return;
    }

    setResult(row);
  };

  useEffect(() => {
    const initial = searchParams.get('code');
    if (initial) {
      verify(initial);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 md:px-6">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">Verificacion Publica</p>
        <h1 className="mt-2 text-3xl font-black text-primary">Certificados de Condonacion</h1>
        <p className="mt-2 text-sm text-slate-600">
          Consulta la validez de un certificado ingresando su codigo unico o usando el enlace desde el QR.
        </p>

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ej: COND-20260316-00000001"
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-secondary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => verify(code)}
            disabled={loading}
            className="rounded-xl bg-secondary px-5 py-3 text-sm font-bold text-white hover:bg-secondary/90 disabled:opacity-60"
          >
            {loading ? 'Validando...' : 'Validar certificado'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {result && (
          <div
            className={`mt-6 rounded-2xl border p-5 ${
              result.es_valido
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <p className="text-lg font-black">{result.es_valido ? 'Certificado valido' : 'Certificado no valido'}</p>
            <p className="mt-1 text-sm">{result.mensaje}</p>

            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="font-bold">Codigo</dt>
                <dd>{result.codigo_certificado || 'No disponible'}</dd>
              </div>
              <div>
                <dt className="font-bold">Estado</dt>
                <dd>{result.estado || 'No disponible'}</dd>
              </div>
              <div>
                <dt className="font-bold">Beneficiario</dt>
                <dd>{result.beneficiario_nombre || 'No disponible'}</dd>
              </div>
              <div>
                <dt className="font-bold">Documento</dt>
                <dd>{result.beneficiario_documento || 'No disponible'}</dd>
              </div>
              <div>
                <dt className="font-bold">Semestre / Periodo</dt>
                <dd>{result.semestre_texto || 'No disponible'}</dd>
              </div>
              <div>
                <dt className="font-bold">Monto condonado</dt>
                <dd>{formatCurrency(result.monto_condonado)}</dd>
              </div>
              <div>
                <dt className="font-bold">Fecha de emision</dt>
                <dd>{formatDateTime(result.fecha_emision)}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Portal FOCADES. Si tienes dudas sobre un resultado, comunicate con la Secretaria de Educacion.
          <div className="mt-2">
            <Link to="/registro" className="font-bold text-secondary hover:underline">
              Ir al portal principal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificarCertificado;
