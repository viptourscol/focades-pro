/**
 * Proxy para uploads a R2 - evita problemas de CORS del navegador
 * El servidor hace el PUT directamente a R2, no el navegador
 */

export async function uploadViaProxy(presignedUrl, file, contentType) {
  // El servidor (Vercel Edge) hace el PUT en lugar del navegador
  // Esto evita completamente los problemas de CORS
  
  const response = await fetch('/api/r2-proxy-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      presignedUrl,
      fileSize: file.size,
      fileName: file.name,
      contentType,
      // Enviar el archivo como base64 para pasar por JSON
      fileData: await fileToBase64(file),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Upload failed')
  }

  return await response.json()
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Extraer solo la parte después de la coma del data URL
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
