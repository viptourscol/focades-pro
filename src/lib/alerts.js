import Swal from 'sweetalert2';

const BASE_ALERT = {
  confirmButtonColor: '#0f2b54',
};

export const showSuccessAlert = ({ title = 'Proceso completado', text = '', zIndex = 999999 } = {}) =>
  Swal.fire({
    ...BASE_ALERT,
    icon: 'success',
    title,
    text,
    allowOutsideClick: false,
    didOpen: (modal) => {
      modal.parentElement.style.zIndex = zIndex;
    },
  });

export const showErrorAlert = ({ title = 'Ocurrió un error', text = '', zIndex = 999999 } = {}) =>
  Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonColor: '#d8342f',
    allowOutsideClick: false,
    didOpen: (modal) => {
      modal.parentElement.style.zIndex = zIndex;
    },
  });

export const showInfoAlert = ({ title = 'Información', text = '', zIndex = 999999 } = {}) =>
  Swal.fire({
    ...BASE_ALERT,
    icon: 'info',
    title,
    text,
    allowOutsideClick: false,
    didOpen: (modal) => {
      modal.parentElement.style.zIndex = zIndex;
    },
  });

export const showWarningAlert = ({ title = 'Atención', text = '', zIndex = 999999 } = {}) =>
  Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonColor: '#f59e0b',
    allowOutsideClick: false,
    didOpen: (modal) => {
      modal.parentElement.style.zIndex = zIndex;
    },
  });

export const showConfirmAlert = async ({
  title = 'Confirmación',
  text = '',
  confirmButtonText = 'Sí',
  cancelButtonText = 'Cancelar',
  zIndex = 99999,
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
    allowOutsideClick: false,
    didOpen: (modal) => {
      modal.parentElement.style.zIndex = zIndex;
    },
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
