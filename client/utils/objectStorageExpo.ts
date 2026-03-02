import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { getApiUrl } from '@/lib/query-client';
import { getAuthToken } from '@/lib/auth-token';

export async function uploadFileToStorage(
  file: File,
  getUploadUrlEndpoint: string = '/api/objects/upload',
): Promise<string> {
  const apiUrl = getApiUrl();
  const uploadUrlEndpoint = new URL(getUploadUrlEndpoint, apiUrl).toString();

  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const presignedUrlResponse = await fetch(uploadUrlEndpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
  });

  if (!presignedUrlResponse.ok) {
    throw new Error(
      `Failed to get presigned URL with status: ${presignedUrlResponse.status}`
    );
  }

  const { uploadURL } = await presignedUrlResponse.json();
  if (!uploadURL) {
    throw new Error('No uploadURL returned from server');
  }

  const uploadResponse = await fetch(uploadURL.toString(), {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Upload to object storage failed with status: ${uploadResponse.status}`
    );
  }

  return uploadURL;
}
