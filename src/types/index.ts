export interface PlanStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  order: number;
}

export interface UserTask {
  id: string;
  userId: string;
  title: string;
  summary?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  steps: PlanStep[];
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export type AIResponseType = 'chat' | 'plan' | 'replan' | 'clarification';

export interface AIPlanStep {
  title: string;
  description: string;
}

export interface GeneratePlanResponse {
  type: AIResponseType;
  message: string;
  steps: AIPlanStep[];
}
