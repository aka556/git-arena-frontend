/**
 * 关卡相关契约类型（对应后端 LevelSummary / LevelDetail / StartLevelResponse / ValidateResponse）。
 */
import type { GitGraph } from './gitGraph'

export interface LevelSummary {
  slug: string
  title: string
  category: string
  difficulty: number
  mode: string
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed'
  attempts: number
  orderIndex: number
}

export interface HintView {
  tier: number
  body: string
  costPoints: number
}

export interface LevelDetail {
  slug: string
  title: string
  description: string | null
  category: string
  difficulty: number
  mode: string
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed'
  attempts: number
  initialGraph: GitGraph
  goalGraph: GitGraph
  hints: HintView[]
}

export interface StartLevelResponse {
  sessionId: string
  slug: string
  graph: GitGraph
  goalGraph: GitGraph
}

export interface ValidateResponse {
  passed: boolean
  reasons: string[]
}
