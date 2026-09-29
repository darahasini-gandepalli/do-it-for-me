import type { UserTask, PlanStep, AuthResponse, AuthUser, GeneratePlanResponse, AIResponseType } from '../types/index';

const TOKEN_KEY = 'do_it_for_me_auth_token';

function getAuthHeaders(isJson = true): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function safeFetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(
      `Network failure connecting to ${url}: ${netErr.message || 'Please check your connection.'}`
    );
  }

  // Handle 401 Unauthorized globally
  if (res.status === 401) {
    authService.clearToken();
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');

  // Check HTTP response text before JSON parsing
  const rawText = await res.text();

  // 1. Check for empty response
  if (!rawText || !rawText.trim()) {
    if (!res.ok) {
      throw new Error(`Server returned an empty error response (HTTP ${res.status} ${res.statusText}) from ${url}.`);
    }
    throw new Error(`Server returned an empty response from ${url}. Expected JSON.`);
  }

  // 2. Check for HTML response (e.g. 404 falling back to index.html or 500 error page)
  const isHtml =
    contentType.toLowerCase().includes('text/html') ||
    rawText.includes('<!DOCTYPE') ||
    rawText.includes('<!doctype') ||
    rawText.includes('<html') ||
    rawText.includes('<body');

  if (isHtml) {
    throw new Error(
      `Server returned an HTML page instead of JSON (HTTP ${res.status} ${res.statusText}) from ${url}. Please inspect the backend route, server errors, and API configuration.`
    );
  }

  // 3. Verify Content-Type
  if (!isJson) {
    throw new Error(
      `Expected application/json response but received "${contentType || 'non-JSON content'}" (HTTP ${res.status} ${res.statusText}) from ${url}: ${rawText.slice(0, 150)}`
    );
  }

  // 4. Safe JSON parse with malformed JSON handling
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (jsonErr: any) {
    throw new Error(`Malformed JSON response from ${url}: ${jsonErr.message}. Output was: ${rawText.slice(0, 150)}`);
  }

  // 5. Check HTTP status code
  if (!res.ok) {
    const errorMsg =
      data?.error || data?.message || `Request to ${url} failed with status ${res.status} ${res.statusText}`;
    const err: any = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    err.notFound = data?.notFound;
    err.alreadyExists = data?.alreadyExists;
    throw err;
  }

  return data as T;
}

export const authService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    const data = await safeFetchJson<AuthResponse>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    const data = await safeFetchJson<AuthResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const data = await safeFetchJson<{ user: AuthUser }>('/api/auth/me', {
        headers: getAuthHeaders(false),
      });
      return data.user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(false),
      });
    } catch (e) {
      console.warn('Logout request failed', e);
    } finally {
      this.clearToken();
    }
  },
};

export const taskService = {
  async getTasks(): Promise<UserTask[]> {
    const data = await safeFetchJson<{ tasks: UserTask[] }>('/api/tasks', {
      headers: getAuthHeaders(false),
    });
    return data.tasks || [];
  },

  async createTask(
    title: string,
    steps: PlanStep[] = [],
    summary?: string | null
  ): Promise<UserTask> {
    const data = await safeFetchJson<{ task: UserTask }>('/api/tasks', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ title, steps, summary }),
    });
    return data.task;
  },

  async updateTask(
    taskId: string,
    updates: Partial<UserTask>
  ): Promise<UserTask> {
    const data = await safeFetchJson<{ task: UserTask }>(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });
    return data.task;
  },

  async deleteTask(taskId: string): Promise<void> {
    await safeFetchJson<{ success: boolean }>(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false),
    });
  },

  async uploadTaskImage(taskId: string, file: File): Promise<{ imageUrl: string; task: UserTask }> {
    const formData = new FormData();
    formData.append('image', file);

    const token = authService.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return safeFetchJson<{ imageUrl: string; task: UserTask }>(`/api/tasks/${taskId}/image`, {
      method: 'POST',
      headers,
      body: formData,
    });
  },

  async deleteTaskImage(taskId: string): Promise<UserTask> {
    const data = await safeFetchJson<{ success: boolean; task: UserTask }>(`/api/tasks/${taskId}/image`, {
      method: 'DELETE',
      headers: getAuthHeaders(false),
    });
    return data.task;
  },
};

export const aiService = {
  async generatePlan(prompt: string): Promise<GeneratePlanResponse> {
    const cleanPrompt = prompt ? prompt.trim() : '';
    if (!cleanPrompt) {
      throw new Error('Please enter a goal, task, or question for the AI agent.');
    }

    const data = await safeFetchJson<GeneratePlanResponse>('/api/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: cleanPrompt }),
    });

    if (!data || typeof data !== 'object') {
      throw new Error('Received an invalid or empty response from the AI planning service.');
    }

    const type: AIResponseType = ['chat', 'plan', 'replan', 'clarification'].includes(data.type)
      ? data.type
      : (Array.isArray(data.steps) && data.steps.length > 0 ? 'plan' : 'chat');

    const message = String(data.message || '').trim();
    const steps = Array.isArray(data.steps) ? data.steps : [];

    return { type, message, steps };
  },

  async updatePlan(
    taskTitle: string,
    currentSteps: PlanStep[],
    userInstruction: string
  ): Promise<GeneratePlanResponse> {
    const cleanInstruction = userInstruction ? userInstruction.trim() : '';
    if (!cleanInstruction) {
      throw new Error('Please enter your update instructions or constraints.');
    }

    const data = await safeFetchJson<GeneratePlanResponse>('/api/update-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskTitle: taskTitle || 'My Task',
        currentSteps: currentSteps || [],
        userInstruction: cleanInstruction,
      }),
    });

    if (!data || typeof data !== 'object') {
      throw new Error('Received an invalid or empty response from the AI planning service.');
    }

    const type: AIResponseType = ['chat', 'plan', 'replan', 'clarification'].includes(data.type)
      ? data.type
      : (Array.isArray(data.steps) && data.steps.length > 0 ? 'replan' : 'chat');

    const message = String(data.message || '').trim();
    const steps = Array.isArray(data.steps) ? data.steps : [];

    return { type, message, steps };
  },
};

export interface N8nChatResponse {
  reply?: string;
  source?: 'n8n' | 'gemini-fallback' | 'gemini';
  error?: string;
  hint?: string;
  n8nError?: string;
  isInactiveWorkflow?: boolean;
}

export interface N8nTestResponse {
  status: 'active' | 'inactive' | 'error' | 'unreachable';
  message: string;
  hint?: string;
  statusCode?: number;
}

export const n8nService = {
  async sendMessage(
    message: string,
    sessionId?: string,
    webhookUrl?: string,
    useGeminiDirect?: boolean
  ): Promise<N8nChatResponse> {
    const res = await fetch('/api/n8n-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, webhookUrl, useGeminiDirect }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.reply) {
      return {
        error: data.error || `Server error (${res.status})`,
        hint: data.hint,
        isInactiveWorkflow: data.isInactiveWorkflow,
      };
    }

    return {
      reply: data.reply || 'No response text received from agent.',
      source: data.source || 'n8n',
      hint: data.hint,
      n8nError: data.n8nError,
      isInactiveWorkflow: data.isInactiveWorkflow,
    };
  },

  async testWebhook(webhookUrl?: string): Promise<N8nTestResponse> {
    const res = await fetch('/api/n8n-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      status: data.status || (res.ok ? 'active' : 'error'),
      message: data.message || 'Test completed',
      hint: data.hint,
      statusCode: data.statusCode || res.status,
    };
  },
};

