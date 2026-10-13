// R2 Upload Helper - Reutilizable en todas las funciones serverless
// Importar con: import { uploadToR2, deleteFromR2 } from '../_shared/r2-helper.ts'

import { AwsClient } from 'https://esm.sh/aws4fetch@1'

export interface R2Config {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
}

export function getR2Config(): R2Config {
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const endpoint = Deno.env.get('R2_ENDPOINT')
  const bucket = Deno.env.get('R2_BUCKET')

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error('Missing R2 environment variables: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET')
  }

  return { accessKeyId, secretAccessKey, endpoint, bucket }
}

export async function uploadToR2(
  fileBuffer: Uint8Array,
  filePath: string,
  contentType: string = 'application/pdf'
): Promise<string> {
  const config = getR2Config()
  
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: 'auto',
    service: 's3',
  })

  const r2Url = `${config.endpoint}/${config.bucket}/${filePath}`
  
  const uploadRequest = new Request(r2Url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: fileBuffer,
  })

  const signedRequest = await aws.sign(uploadRequest)
  const uploadResponse = await fetch(signedRequest)

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload to R2: ${uploadResponse.status} ${uploadResponse.statusText}`
    )
  }

  return filePath
}

export async function deleteFromR2(filePath: string): Promise<void> {
  const config = getR2Config()
  
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: 'auto',
    service: 's3',
  })

  const r2Url = `${config.endpoint}/${config.bucket}/${filePath}`
  
  const deleteRequest = new Request(r2Url, {
    method: 'DELETE',
  })

  const signedRequest = await aws.sign(deleteRequest)
  const deleteResponse = await fetch(signedRequest)

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(
      `Failed to delete from R2: ${deleteResponse.status} ${deleteResponse.statusText}`
    )
  }
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64.split(',')[1] || base64)
  const buffer = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i)
  }
  return buffer
}
