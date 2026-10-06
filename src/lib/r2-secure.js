/**
 * SECURE R2 Client
 * 
 * ✅ NO CREDENTIALS IN BROWSER
 * ✅ ALL OPERATIONS VIA PRESIGNED URLs (server-signed)
 * ✅ AUTHENTICATION REQUIRED
 * 
 * Replaces: src/lib/r2.js
 */

import { supabase } from './supabase'

const BUCKET_NAME = 'focades-pro'
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || 'https://focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev'

/**
 * Get authentication token - tries multiple methods
 * @returns {Promise<string>} JWT access token
 */
const getAccessToken = async () => {
  console.log('🔍 getAccessToken(): Buscando token...')
  
  // Method 1: Active Supabase session
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    console.log('✅ Using token from active session')
    return session.access_token
  }
  console.log('❌ No active Supabase session')

  // Method 2: Check multiple localStorage keys
  const possibleKeys = [
    'sb-jwifxjzxdxjntbdqbyku-auth-token',
    'SUPABASE_JWT',
    'supabase.auth.token',
  ]
  
  for (const key of possibleKeys) {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        console.log(`  Found key "${key}", parsing...`)
        const parsed = JSON.parse(stored)
        if (parsed.session?.access_token) {
          console.log(`✅ Using token from localStorage (${key})`)
          return parsed.session.access_token
        }
      }
    } catch (e) {
      console.log(`  Key "${key}": No access_token found or JSON parse error`)
    }
  }

  // Method 3: Scan entire localStorage for JWT
  console.log(`📋 Scanning localStorage (${localStorage.length} items)...`)
  const allKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    allKeys.push(key)
  }
  console.log('  localStorage keys:', allKeys)
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const value = localStorage.getItem(key)
    
    // Look for JWT-like strings (starts with ey)
    if (value?.startsWith('ey') && value.includes('.')) {
      console.log(`✅ Found JWT token in localStorage (key: ${key})`)
      return value
    }
    
    // Try parsing as JSON
    try {
      const parsed = JSON.parse(value)
      if (parsed?.session?.access_token) {
        console.log(`✅ Found JWT in JSON localStorage (key: ${key})`)
        return parsed.session.access_token
      }
    } catch (e) {
      // Continue
    }
  }

  console.log('❌ NO TOKEN FOUND IN:')
  console.log('  - Active Supabase session')
  console.log('  - Known localStorage keys')
  console.log('  - localStorage scan')
  throw new Error('User must be authenticated')
}

/**
 * Get presigned URL for uploading a file to R2
 * @param {string} filePath - Target path in R2 (e.g., "soportes/beneficiarios/123/doc.pdf")
 * @param {string} contentType - MIME type (default: "application/pdf")
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<{presignedUrl: string, expiresAt: string}>}
 */
export const getPresignedUploadUrl = async (filePath, contentType = 'application/pdf', expiresIn = 3600) => {
  try {
    // Normalize path
    let normalizedPath = filePath
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`
    }

    const accessToken = await getAccessToken()

    // Call serverless function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-presigned-upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          filePath: normalizedPath,
          contentType,
          expiresIn,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get presigned upload URL')
    }

    const data = await response.json()
    console.log('✅ Presigned upload URL obtained')
    return data
  } catch (error) {
    console.error('❌ Error getting presigned upload URL:', error)
    throw error
  }
}

/**
 * Upload a file to R2 using presigned URL (server-signed)
 * @param {File} file - File object
 * @param {string} filePath - Target path in R2
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadToR2 = async (file, filePath) => {
  try {
    // Normalize path
    let normalizedPath = filePath
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`
    }

    console.log(`📤 Uploading ${file.name} to ${normalizedPath}...`)

    // Get presigned upload URL from server
    const { presignedUrl, expiresAt } = await getPresignedUploadUrl(
      normalizedPath,
      file.type || 'application/pdf'
    )

    console.log(`🔑 Got presigned URL, expires at ${expiresAt}`)

    // Upload using presigned URL
    const arrayBuffer = await file.arrayBuffer()
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/pdf',
      },
      body: new Uint8Array(arrayBuffer),
    })

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
    }

    // Return public URL
    const publicUrl = `${R2_PUBLIC_URL}/${normalizedPath}`
    console.log(`✅ File uploaded to R2: ${publicUrl}`)
    return publicUrl
  } catch (error) {
    console.error('❌ Error uploading to R2:', error)
    throw error
  }
}

/**
 * Get presigned URL for downloading a file from R2
 * @param {string} filePath - File path in R2 (can include or exclude "soportes/" prefix)
 * @param {number} expiresIn - Expiration time in seconds (default: 86400 = 24 hours)
 * @returns {Promise<{presignedUrl: string, expiresAt: string}>}
 */
export const getPresignedDownloadUrl = async (filePath, expiresIn = 86400) => {
  try {
    // Normalize path
    let normalizedPath = filePath
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`
    }

    const accessToken = await getAccessToken()

    // Call serverless function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-presigned-download-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          filePath: normalizedPath,
          expiresIn,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get presigned download URL')
    }

    const data = await response.json()
    console.log(`✅ Presigned download URL obtained, expires at ${data.expiresAt}`)
    return data
  } catch (error) {
    console.error('❌ Error getting presigned download URL:', error)
    throw error
  }
}

/**
 * Get public URL for a file in R2 (with presigned download if bucket is private)
 * Since bucket is now PRIVATE, this returns a presigned URL valid for 24 hours
 * @param {string} filePath - File path in R2 (can include or exclude "soportes/" prefix)
 * @returns {Promise<string>} Presigned download URL
 */
export const getPublicUrlR2 = async (filePath) => {
  if (!filePath) return null

  try {
    const { presignedUrl } = await getPresignedDownloadUrl(filePath, 86400)
    return presignedUrl
  } catch (error) {
    console.error('Error getting public URL:', error)
    return null
  }
}

/**
 * Delete a file from R2 (ADMIN ONLY)
 * @param {string} filePath - File path to delete
 * @param {string} motivo - Optional reason for deletion
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export const deleteFromR2 = async (filePath, motivo = null) => {
  try {
    // Normalize path
    let normalizedPath = filePath
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`
    }

    console.log(`🗑️ Deleting ${normalizedPath}...`)

    const accessToken = await getAccessToken()

    // Call serverless function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-from-r2`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          filePath: normalizedPath,
          motivo,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete file')
    }

    const data = await response.json()
    console.log(`✅ File deleted from R2`)
    return data
  } catch (error) {
    console.error('❌ Error deleting from R2:', error)
    throw error
  }
}

export default {
  uploadToR2,
  getPublicUrlR2,
  deleteFromR2,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
}
