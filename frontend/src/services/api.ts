/**
 * API Client
 * Axios-based HTTP client with Clerk auth integration
 */

import axios, { AxiosError } from 'axios';
import type { ApiError, CreateJobRequest } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

let _getToken: (() => Promise<string | null>) | null = null;
let _authSetup = false;

export function setupApiAuth(getToken: () => Promise<string | null>) {
  if (_authSetup) {
    return;
  }
  _authSetup = true;
  _getToken = getToken;
  api.interceptors.request.use(async (config) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
    }
    return config;
  });
}

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiError>) => {
    const errorData = error.response?.data?.error;

    const apiError = {
      code: errorData?.code || 'NETWORK_ERROR',
      message: errorData?.message || '网络错误，请稍后重试',
      details: errorData?.details,
    };

    if (apiError.code === 'UNAUTHORIZED') {
      window.dispatchEvent(new CustomEvent('auth:required'));
    }

    throw apiError;
  }
);

// ============ API Methods ============

// Voices
export const voicesApi = {
  list: (params?: { provider?: string; gender?: string; premium?: boolean }) =>
    api.get('/voices', { params }),
};

// Jobs
export const jobsApi = {
  create: (data: CreateJobRequest) => api.post('/jobs', data),

  list: (params?: { page?: number; pageSize?: number; contentType?: string }) =>
    api.get('/jobs', { params }),

  getDetail: (id: string) => api.get(`/jobs/${id}`),

  delete: (id: string) => api.delete(`/jobs/${id}`),

  downloadAudio: async (id: string): Promise<Blob> => {
    let token: string | null = null;
    if (_getToken) {
      try {
        token = await _getToken();
      } catch (e) {
        console.error('Failed to get token for download:', e);
      }
    }

    const response = await fetch(`${API_BASE}/jobs/${id}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        code: errorData?.error?.code || 'DOWNLOAD_ERROR',
        message: errorData?.error?.message || '下载失败',
      };
    }

    return response.blob();
  },

  updateScript: (id: string, script: string) => api.put(`/jobs/${id}/script`, { script }),

  synthesize: (id: string) => api.post(`/jobs/${id}/synthesize`),
};

// Quick TTS
export const ttsApi = {
  quick: async (data: {
    text: string;
    voiceId: string;
    speed?: number;
    format?: 'mp3' | 'wav';
  }): Promise<Blob> => {
    let token: string | null = null;
    if (_getToken) {
      try {
        token = await _getToken();
      } catch (e) {
        console.error('Failed to get token for TTS:', e);
      }
    }

    const response = await fetch(`${API_BASE}/tts/quick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        code: errorData?.error?.code || 'TTS_ERROR',
        message: errorData?.error?.message || '语音生成失败',
      };
    }

    return response.blob();
  },
};

// User
export const userApi = {
  getMe: () => api.get('/auth/me'),

  getQuota: () => api.get('/user/quota'),

  getUsage: (params?: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    type?: string;
  }) => api.get('/user/usage', { params }),
};

// SSE stream URL helper
export function getJobStreamUrl(jobId: string, streamToken: string): string {
  return `${API_BASE}/jobs/${jobId}/stream?token=${streamToken}`;
}
