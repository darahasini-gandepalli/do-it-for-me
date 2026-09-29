import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Static serving for uploaded task images
app.use('/uploads', express.static(db.UPLOADS_DIR));

// Initialize Gemini SDK with User-Agent as required by AI Studio guidelines
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Auth Middleware
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  const session = db.findSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
  const user = db.findUserById(session.userId);
  if (!user) {
    db.deleteSession(token);
    return res.status(401).json({ error: 'Account session expired. Please log in again.' });
  }
  (req as any).user = { id: session.userId, username: user.username };
  next();
};

// Multer storage for task images
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, db.UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanName = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, cleanName);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload a JPG, JPEG, PNG, or WEBP image.'));
    }
  },
});

// ========================
// AUTHENTICATION ROUTES
// ========================

// POST /api/auth/register
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const rawUser = req.body.username || req.body.email || req.body.user || '';
    const password = req.body.password;

    if (!rawUser || typeof rawUser !== 'string' || rawUser.trim().length < 2) {
      return res.status(400).json({ error: 'Username or email must be at least 2 characters.' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const trimmedUsername = rawUser.trim();
    const existing = db.findUserByUsername(trimmedUsername);
    if (existing) {
      return res.status(400).json({
        error: `Username "${trimmedUsername}" is already registered. Please log in instead.`,
        alreadyExists: true,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newUser = {
      id: userId,
      username: trimmedUsername,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    db.createUser(newUser);

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    db.createSession({
      token,
      userId,
      username: trimmedUsername,
      createdAt: new Date().toISOString(),
    });

    return res.json({
      user: { id: userId, username: trimmedUsername },
      token,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const rawUser = req.body.username || req.body.email || req.body.user || '';
    const password = req.body.password;

    if (!rawUser || !password) {
      return res.status(400).json({ error: 'Please enter both your username/email and password.' });
    }

    const trimmedUsername = String(rawUser).trim();
    const user = db.findUserByUsername(trimmedUsername);
    if (!user) {
      return res.status(401).json({
        error: `No account found for "${trimmedUsername}". Would you like to create an account?`,
        notFound: true,
      });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please verify and try again.' });
    }

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    db.createSession({
      token,
      userId: user.id,
      username: user.username,
      createdAt: new Date().toISOString(),
    });

    return res.json({
      user: { id: user.id, username: user.username },
      token,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to log in. Please try again.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ user });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    db.deleteSession(token);
  }
  return res.json({ success: true });
});

// ========================
// TASKS ROUTES (Persistent & User-Specific)
// ========================

// GET /api/tasks (Returns only authenticated user's tasks)
app.get('/api/tasks', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const tasks = db.getTasksByUserId(userId);
  return res.json({ tasks });
});

// POST /api/tasks (Creates a task for authenticated user)
app.post('/api/tasks', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { title, steps, imageUrl, summary } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const newTask = {
    id: taskId,
    userId,
    title: title.trim(),
    summary: summary ? String(summary).trim() : null,
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: Array.isArray(steps) ? steps : [],
  };

  db.createTask(newTask);
  return res.status(201).json({ task: newTask });
});

// PUT /api/tasks/:id (Updates task owned by authenticated user)
app.put('/api/tasks/:id', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const taskId = req.params.id;
  const { title, steps, imageUrl, summary } = req.body;

  const updates: any = {};
  if (title !== undefined) updates.title = String(title).trim();
  if (steps !== undefined && Array.isArray(steps)) updates.steps = steps;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (summary !== undefined) updates.summary = summary ? String(summary).trim() : null;

  const updated = db.updateTask(taskId, userId, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Task not found or unauthorized.' });
  }

  return res.json({ task: updated });
});

// DELETE /api/tasks/:id (Deletes task owned by authenticated user)
app.delete('/api/tasks/:id', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const taskId = req.params.id;

  const task = db.getTaskById(taskId);
  if (task && task.userId === userId && task.imageUrl && task.imageUrl.startsWith('/uploads/')) {
    const filename = path.basename(task.imageUrl);
    const filepath = path.join(db.UPLOADS_DIR, filename);
    try {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch (_) {}
  }

  const deleted = db.deleteTask(taskId, userId);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found or unauthorized.' });
  }

  return res.json({ success: true });
});

// ========================
// TASK IMAGE UPLOAD & REMOVE
// ========================

// POST /api/tasks/:id/image
app.post('/api/tasks/:id/image', authenticate, (req: Request, res: Response) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image file too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please select an image file to upload.' });
    }

    const taskId = req.params.id;
    const userId = (req as any).user.id;
    const task = db.getTaskById(taskId);

    if (!task || task.userId !== userId) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }

    // Delete old image if existed
    if (task.imageUrl && task.imageUrl.startsWith('/uploads/')) {
      const oldFilename = path.basename(task.imageUrl);
      const oldPath = path.join(db.UPLOADS_DIR, oldFilename);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (_) {}
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const updated = db.updateTask(taskId, userId, { imageUrl });

    return res.json({ imageUrl, task: updated });
  });
});

// DELETE /api/tasks/:id/image
app.delete('/api/tasks/:id/image', authenticate, (req: Request, res: Response) => {
  const taskId = req.params.id;
  const userId = (req as any).user.id;
  const task = db.getTaskById(taskId);

  if (!task || task.userId !== userId) {
    return res.status(404).json({ error: 'Task not found or unauthorized.' });
  }

  if (task.imageUrl && task.imageUrl.startsWith('/uploads/')) {
    const filename = path.basename(task.imageUrl);
    const filepath = path.join(db.UPLOADS_DIR, filename);
    try {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch (_) {}
  }

  const updated = db.updateTask(taskId, userId, { imageUrl: null });
  return res.json({ success: true, task: updated });
});

// ========================
// GEMINI AI PLANNING ROUTES
// ========================

interface AIPlanStep {
  title: string;
  description: string;
}

interface AIResponseData {
  type: 'chat' | 'plan' | 'replan' | 'clarification';
  message: string;
  steps: AIPlanStep[];
}

function extractTextFromAiResponse(response: any): string {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.text === 'function') {
    try {
      const res = response.text();
      if (typeof res === 'string') return res;
    } catch (_) {}
  }

  // Handle Gemini candidates envelope
  if (response.candidates && Array.isArray(response.candidates) && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
      const texts = candidate.content.parts
        .map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p.text === 'string') return p.text;
          return '';
        })
        .filter(Boolean);
      if (texts.length > 0) return texts.join('\n');
    }
  }

  if (response.response) {
    return extractTextFromAiResponse(response.response);
  }
  if (response.output) {
    return typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  }
  if (response.data) {
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }
  if (response.result) {
    return typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
  }

  return '';
}

function extractJsonFromText(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') return null;

  let text = rawText.trim();

  // Strip markdown code fences if present: ```json ... ``` or ``` ... ```
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // Direct parse attempt
  try {
    return JSON.parse(text);
  } catch (_) {
    // Search for outermost { ... }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerErr) {
        console.warn('Failed to parse candidate JSON substring:', innerErr);
      }
    }

    // Search for outermost [ ... ] if AI returned array of steps
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const candidate = text.substring(firstBracket, lastBracket + 1);
      try {
        const arr = JSON.parse(candidate);
        if (Array.isArray(arr)) {
          return {
            type: 'plan',
            message: 'Here is your step-by-step action plan:',
            steps: arr,
          };
        }
      } catch (innerErr) {
        console.warn('Failed to parse candidate JSON array:', innerErr);
      }
    }
  }
  return null;
}

const UNIFIED_AI_SYSTEM_INSTRUCTION = `
You are the core intelligence engine for "DO IT FOR ME" — an AI agent that plans, acts, tracks, and adapts.
You receive user inputs ranging from greetings and general questions to initial task goals, replanning requests, and timeline changes.

Analyze the user's intent and classify it into one of these 4 types:
1. "chat" - Casual greetings (e.g. "Hi", "Hello"), polite remarks, or general questions about your capabilities (e.g. "What can you do?").
2. "plan" - A new task, event, habit, or project the user wants to accomplish (e.g. "Plan a Garba Night", "Build a portfolio", "Prep for marathon").
3. "replan" - An update, new constraint, time adjustment, or modification to an existing plan (e.g. "I have only 2 days left", "Make it cheaper", "I already finished step 1").
4. "clarification" - Ambiguous or unclear inputs that require more context before a meaningful plan can be constructed.

STRICT JSON SCHEMA:
You MUST respond strictly with valid JSON conforming to this schema:
{
  "type": "chat" | "plan" | "replan" | "clarification",
  "message": "A friendly, conversational explanation, direct answer, or plan overview for the user.",
  "steps": [
    {
      "title": "Concise step title (3 to 7 words)",
      "description": "Clear, practical, actionable instructions for executing this step."
    }
  ]
}

TYPE GUIDELINES:
- "chat": Provide an engaging, clear answer explaining what you can do and invite the user to plan a task. "steps" MUST be an empty array [].
- "plan": In "message", provide an inspiring overview of the plan. In "steps", provide 4 to 7 realistic, sequential, practical steps.
- "replan": In "message", acknowledge the change (e.g. "Got it! Since you only have 2 days left, I've adjusted the timeline into an urgent sprint:"). In "steps", provide the revised, prioritized sequential steps.
- "clarification": In "message", ask 1-2 focused questions to clarify what they need. "steps" MUST be an empty array [].

CRITICAL: Output ONLY the valid JSON object. Do not include markdown code fences.
`;

// Track model rate limits / quota exhaustion so we don't repeatedly hit exhausted models
const modelCooldowns = new Map<string, number>();

function isQuotaExhaustedError(err: any): boolean {
  if (!err) return false;
  const str = (typeof err === 'string' ? err : err.message || JSON.stringify(err)).toLowerCase();
  return (
    str.includes('429') ||
    str.includes('resource_exhausted') ||
    str.includes('quota exceeded') ||
    str.includes('quota_exhausted') ||
    str.includes('rate_limit') ||
    str.includes('generate_content_free_tier_requests')
  );
}

function getAvailableGeminiModels(): string[] {
  // Priority: gemini-3.1-flash-lite (high free quota, fast), then gemini-flash-latest, then gemini-3.8-flash
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  const now = Date.now();

  const available = candidateModels.filter((m) => {
    const cd = modelCooldowns.get(m);
    return !cd || cd <= now;
  });

  if (available.length > 0) {
    return available;
  }

  // If all are cooling down, return the one closest to cooldown expiry
  return [...candidateModels].sort((a, b) => (modelCooldowns.get(a) || 0) - (modelCooldowns.get(b) || 0));
}

function recordModelError(model: string, err: any): void {
  if (isQuotaExhaustedError(err)) {
    // Cooldown this model for 3 minutes so subsequent requests immediately use a working model
    modelCooldowns.set(model, Date.now() + 3 * 60 * 1000);
    console.warn(`Model ${model} reached quota limit (429 RESOURCE_EXHAUSTED). Entering cooldown.`);
  } else {
    console.warn(`Model ${model} issue:`, (err?.message || String(err)).slice(0, 100));
  }
}

function cleanErrorMessage(rawError: any): string {
  if (!rawError) return 'An unexpected error occurred.';
  const msg = rawError.message || String(rawError);
  let resolvedMsg = msg;
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) {
      resolvedMsg = parsed.error.message;
    }
  } catch (_) {}

  if (
    resolvedMsg.includes('Quota exceeded') ||
    resolvedMsg.includes('RESOURCE_EXHAUSTED') ||
    resolvedMsg.includes('429') ||
    resolvedMsg.includes('generate_content_free_tier_requests')
  ) {
    return 'The AI planning service is currently experiencing high demand or quota limits. Please retry in a moment.';
  }

  return resolvedMsg;
}

async function callGeminiAI(userPrompt: string): Promise<AIResponseData> {
  if (!ai) {
    throw new Error('Gemini API key is not configured on the server. Please set GEMINI_API_KEY.');
  }

  const models = getAvailableGeminiModels();
  let lastError: any = null;

  for (const model of models) {
    const isModelCoolingDown = (modelCooldowns.get(model) || 0) > Date.now();
    if (isModelCoolingDown) continue;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: UNIFIED_AI_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        });

        // 1. Extract raw text from response envelope
        const rawText = extractTextFromAiResponse(response);
        if (!rawText || !rawText.trim()) {
          throw new Error('Empty response received from AI model.');
        }

        // 2. Parse JSON
        const parsed = extractJsonFromText(rawText);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error(`Failed to parse AI output as JSON. Output was: ${rawText.slice(0, 150)}`);
        }

        // 3. Normalize schema
        const type: 'chat' | 'plan' | 'replan' | 'clarification' =
          ['chat', 'plan', 'replan', 'clarification'].includes(parsed.type)
            ? parsed.type
            : (Array.isArray(parsed.steps) && parsed.steps.length > 0 ? 'plan' : 'chat');

        const message =
          String(parsed.message || '').trim() ||
          (type === 'plan' ? 'Here is your action plan:' : '');

        const steps: AIPlanStep[] = Array.isArray(parsed.steps)
          ? parsed.steps
              .filter((s: any) => s)
              .map((s: any) => {
                if (typeof s === 'string') {
                  return { title: s.trim(), description: '' };
                }
                return {
                  title: String(s.title || s.name || s.step || 'Step').trim(),
                  description: String(s.description || s.details || s.action || '').trim(),
                };
              })
              .filter((s: AIPlanStep) => s.title.length > 0)
          : [];

        // If classified as plan or replan but no steps were generated
        if ((type === 'plan' || type === 'replan') && steps.length === 0) {
          if (message) {
            return { type: 'clarification', message, steps: [] };
          }
          throw new Error('AI model did not generate actionable steps for this plan.');
        }

        return { type, message, steps };
      } catch (err: any) {
        lastError = err;
        recordModelError(model, err);

        // If quota exhausted on this model, immediately move to the next model without retrying
        if (isQuotaExhaustedError(err)) {
          break;
        }

        const errMsg = cleanErrorMessage(err);
        if (errMsg.includes('high demand') || errMsg.includes('503')) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          break;
        }
      }
    }
  }

  throw new Error(cleanErrorMessage(lastError) || 'Failed to process AI request. Please try again.');
}

// POST /api/generate-plan
app.post('/api/generate-plan', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Please enter a task, goal, or question.' });
  }

  try {
    const aiData = await callGeminiAI(`User input: "${prompt.trim()}"`);
    return res.json(aiData);
  } catch (error: any) {
    console.error('Error in /api/generate-plan:', error);
    return res.status(500).json({
      error: cleanErrorMessage(error) || 'Failed to generate plan. Please try again.',
    });
  }
});

// POST /api/update-plan
app.post('/api/update-plan', async (req: Request, res: Response) => {
  const { taskTitle, currentSteps, userInstruction } = req.body;

  if (!userInstruction || typeof userInstruction !== 'string' || !userInstruction.trim()) {
    return res.status(400).json({ error: 'Please enter instructions for updating the plan.' });
  }

  const promptContent = `
Task: "${taskTitle || 'My Task'}"
Existing Steps:
${(currentSteps || []).map((s: any, i: number) => `${i + 1}. ${s.title}: ${s.description}`).join('\n')}

User update instruction:
"${userInstruction.trim()}"
`;

  try {
    const aiData = await callGeminiAI(promptContent);
    return res.json(aiData);
  } catch (error: any) {
    console.error('Error in /api/update-plan:', error);
    return res.status(500).json({
      error: cleanErrorMessage(error) || 'Failed to update plan. Please try again.',
    });
  }
});

// ========================
// N8N AI AGENT & FALLBACK CHAT
// ========================

function extractReplyFromN8n(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data.trim();

  // If array of items: [{ output: "..." }] or [{ json: { text: "..." } }]
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    const candidate =
      first?.output ||
      first?.text ||
      first?.response ||
      first?.message ||
      first?.json?.output ||
      first?.json?.text ||
      first?.json?.response ||
      first?.json?.message;
    if (candidate && typeof candidate === 'string') return candidate.trim();
    if (typeof first === 'string') return first.trim();
  }

  // Object candidates
  const candidate =
    data.output ||
    data.text ||
    data.response ||
    data.message ||
    data.data?.output ||
    data.data?.text ||
    data.data?.message ||
    data.result;

  if (candidate && typeof candidate === 'string') return candidate.trim();
  return null;
}

async function callGeminiChat(message: string): Promise<string> {
  if (!ai) {
    return "I'm the built-in AI assistant. To connect directly to your n8n workflow, please ensure your workflow is set to Active in the n8n editor.";
  }

  const models = getAvailableGeminiModels();
  for (const model of models) {
    const isModelCoolingDown = (modelCooldowns.get(model) || 0) > Date.now();
    if (isModelCoolingDown) continue;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction: `You are the AI assistant for "DO IT FOR ME" — an intelligent productivity and action planning application.
The user is chatting with you. Your job is to help them plan tasks, break goals down, answer questions, and provide actionable advice.
Respond in a friendly, concise, and helpful tone.`,
          temperature: 0.7,
        },
      });

      if (response.text) return response.text.trim();
    } catch (err: any) {
      recordModelError(model, err);
      continue;
    }
  }

  return "I'm ready to help you plan and execute your tasks! What would you like to achieve today?";
}

// POST /api/n8n-test
app.post('/api/n8n-test', async (req: Request, res: Response) => {
  const { webhookUrl } = req.body;
  const targetUrl =
    webhookUrl && typeof webhookUrl === 'string' && webhookUrl.trim()
      ? webhookUrl.trim()
      : 'https://sbhandhavi21.app.n8n.cloud/webhook/845861b4-d675-4c88-8109-02a5e7acef3d/chat';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'ping',
        chatInput: 'ping',
        message: 'ping',
      }),
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { text: responseText };
    }

    if (response.ok) {
      return res.json({
        status: 'active',
        message: 'n8n Webhook is active and responding successfully!',
      });
    }

    const isInactive =
      response.status === 404 &&
      (data?.hint?.includes('active') || data?.message?.includes('not registered'));

    return res.json({
      status: isInactive ? 'inactive' : 'error',
      statusCode: response.status,
      message: data.message || `Returned HTTP status ${response.status}`,
      hint: data.hint,
    });
  } catch (err: any) {
    return res.json({
      status: 'unreachable',
      message: err.message || 'Unable to connect to the webhook URL.',
    });
  }
});

// POST /api/n8n-chat
app.post('/api/n8n-chat', async (req: Request, res: Response) => {
  const { message, sessionId, webhookUrl, useGeminiDirect } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  const cleanMessage = message.trim();

  // If user explicitly chose direct Gemini AI mode
  if (useGeminiDirect) {
    try {
      const reply = await callGeminiChat(cleanMessage);
      return res.json({ reply, source: 'gemini' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'AI service error.' });
    }
  }

  const targetUrl =
    webhookUrl && typeof webhookUrl === 'string' && webhookUrl.trim()
      ? webhookUrl.trim()
      : 'https://sbhandhavi21.app.n8n.cloud/webhook/845861b4-d675-4c88-8109-02a5e7acef3d/chat';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000); // 14s timeout

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'sendMessage',
        sessionId: sessionId || `session_${Date.now()}`,
        chatInput: cleanMessage,
        message: cleanMessage,
        query: cleanMessage,
        text: cleanMessage,
      }),
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { text: responseText };
    }

    if (response.ok) {
      const reply =
        extractReplyFromN8n(data) ||
        (typeof data === 'string' ? data : JSON.stringify(data, null, 2));

      return res.json({
        reply,
        source: 'n8n',
        raw: data,
      });
    }

    // When n8n is inactive or returns 404/500, fallback gracefully to Gemini AI
    const isInactive =
      response.status === 404 &&
      (data?.hint?.includes('active') || data?.message?.includes('not registered'));
    const hint =
      data.hint ||
      (isInactive
        ? 'The workflow must be active in n8n for this webhook to respond.'
        : undefined);

    let fallbackReply = '';
    try {
      fallbackReply = await callGeminiChat(cleanMessage);
    } catch {
      fallbackReply = 'Your n8n workflow is currently paused in n8n editor. Please activate it to chat with your custom agent.';
    }

    return res.json({
      reply: fallbackReply,
      source: 'gemini-fallback',
      n8nError: data.message || `Webhook returned status ${response.status}`,
      hint,
      isInactiveWorkflow: isInactive,
    });
  } catch (error: any) {
    console.warn('n8n request failed, executing Gemini fallback:', error?.message);

    try {
      const fallbackReply = await callGeminiChat(cleanMessage);
      return res.json({
        reply: fallbackReply,
        source: 'gemini-fallback',
        n8nError: error.message || 'Network timeout or unreachable webhook.',
        hint: 'Check that your n8n cloud instance is active and reachable.',
      });
    } catch {
      return res.status(502).json({
        error: 'Unable to reach the n8n AI agent webhook.',
        details: error.message,
      });
    }
  }
});


// 404 handler for any unhandled /api/* routes - ALWAYS return JSON, NEVER HTML!
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler for /api/* routes - ALWAYS return JSON, NEVER HTML!
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl?.startsWith('/api/')) {
    console.error('API Error:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  }
  next(err);
});

// Vite Server (Dev) or Static Build (Prod)
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DO IT FOR ME server running on port ${PORT}`);
  });
}

// Only listen directly when not running in Vercel Serverless environment
if (process.env.VERCEL !== '1' && !process.env.NOW_REGION) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { app };
export default app;
