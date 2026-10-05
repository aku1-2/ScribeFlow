export type RichCardData = {
  title?: string
  subtitle?: string
  equation?: string
  equation_labels?: Array<{ text: string; role: string; color: 'pink' | 'blue' | 'coral' | 'cyan' | 'teal' }>
  definition?: string
  examples?: Array<{ equation: string; note?: string; tags?: Array<{ text: string; color: string }> }>
  important?: string
  comparison_title?: string
  comparison_text?: string
  formula_display?: string
  rule_boxes?: string[]
}

export type Flashcard = {
  id?: number | string
  seq_num?: number
  topic?: string
  card_type?: string
  difficulty?: 'Easy' | 'Medium' | 'Advanced' | string
  question: string
  answer: string
  key_takeaway?: string
  source_reference?: string
  rich_data?: RichCardData
  rating?: number | null
  review_count?: number
  last_reviewed?: string | null
}

export function getCardKey(card: Flashcard, fallbackIndex?: number): string {
  if (card.id != null && card.id !== '') return String(card.id)
  if (card.seq_num != null) return `seq-${card.seq_num}`
  if (fallbackIndex != null) return `idx-${fallbackIndex}`
  const cleanQ = (card.question || '').slice(0, 32).replace(/[^a-zA-Z0-9]/g, '_')
  return `q-${cleanQ}`
}

export type FlashcardsSummary = {
  total_cards: number
  difficulty_counts: Record<string, number>
  topic_counts: Record<string, number>
  card_type_counts: Record<string, number>
  challenging_count: number
}

export type StudySet = {
  id?: number
  userId?: string | null
  title: string
  source_name?: string | null
  transcript: string
  notes: string
  topic: string
  confidence?: number | null
  generator_used?: string | null
  marks?: number | null
  flashcards: Flashcard[]
  summary?: FlashcardsSummary
  offlineKey?: string
  savedAt?: string
  isOfflineOnly?: boolean
  hasOfflineCopy?: boolean
}

export type TranscriptionStatus = {
  provider_name: string
  is_available: boolean
  message: string
  configured_mode: string
  has_openai_key: boolean
  has_groq_key: boolean
}
