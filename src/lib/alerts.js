import Swal from 'sweetalert2';

const BASE_ALERT = {
  confirmButtonColor: '#0f2b54',
};

export const showSuccessAlert = ({ title = 'Proceso completado', text = '' } = {}) =>
  Swal.fire({
    ...BASE_ALERT,
    icon: 'success',
    title,
    text,
  });

export const showErrorAlert = ({ title = 'Ocurrió un error', text = '' } = {}) =>
  Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonColor: '#d8342f',
  });

export const showInfoAlert = ({ title = 'Información', text = '' } = {}) =>
  Swal.fire({
    ...BASE_ALERT,
    icon: 'info',
    title,
    text,
  });

export const showWarningAlert = ({ title = 'Atención', text = '' } = {}) =>
  Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonColor: '#f59e0b',
  });

export const showConfirmAlert = async ({
  title = 'Confirmación',
  text = '',
  confirmButtonText = 'Sí',
  cancelButtonText = 'Cancelar',
} = {}) => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: '#0f2b54',
    cancelButtonColor: '#64748b',
  });

  return result.isConfirmed;
};

export const showTextareaConfirmAlert = async ({
  title = 'Escribe una observación',
  text = '',
  inputLabel = 'Observación',
  inputPlaceholder = 'Escribe aquí...',
  inputValue = '',
  confirmButtonText = 'Guardar',
  cancelButtonText = 'Cancelar',
  requiredMessage = 'Este campo es obligatorio.',
} = {}) => {
  const result = await Swal.fire({
    title,
    text,
    input: 'textarea',
    inputLabel,
    inputPlaceholder,
    inputValue,
    inputAttributes: {
      'aria-label': inputLabel,
      maxlength: '2000',
    },
    inputValidator: (value) => {
      if (!String(value || '').trim()) {
        return requiredMessage;
      }
      return undefined;
    },
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: '#0f2b54',
    cancelButtonColor: '#64748b',
  });

  if (!result.isConfirmed) return null;
  return String(result.value || '').trim();
};
