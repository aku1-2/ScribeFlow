import { useMemo, useState, useEffect } from 'react'
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Check,
  Tag,
  GraduationCap,
  EyeOff,
} from 'lucide-react'
import type { Flashcard, RichCardData } from './types'

interface Props {
  card: Flashcard
  index: number
  totalCards?: number
  isStudyMode?: boolean
  isRevealed?: boolean
  onToggleReveal?: (revealed: boolean) => void
  onRate?: (rating: number) => void
  onNext?: () => void
  onPrev?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

export default function HandwrittenCard({
  card,
  index,
  totalCards,
  isStudyMode = false,
  isRevealed,
  onToggleReveal,
  onRate,
  onNext,
  onPrev,
  hasPrev = false,
  hasNext = false,
}: Props) {
  // Support controlled or uncontrolled reveal state per card
  const [localRevealed, setLocalRevealed] = useState(false)
  const revealed = isRevealed !== undefined ? isRevealed : localRevealed

  const handleSetRevealed = (val: boolean) => {
    setLocalRevealed(val)
    onToggleReveal?.(val)
  }

  const [masked, setMasked] = useState(false)
  const [revealedMaskIds, setRevealedMaskIds] = useState<Record<string, boolean>>({})
  const [ratingToast, setRatingToast] = useState<string | null>(null)

  // Reset internal states only when switching to a completely different card identity
  useEffect(() => {
    setLocalRevealed(false)
    setRevealedMaskIds({})
    setRatingToast(null)
  }, [card.id, card.seq_num])

  // Parse rich data or intelligently fallback from answer text
  const data: RichCardData = useMemo(() => {
    if (card.rich_data && typeof card.rich_data === 'object') {
      return card.rich_data
    }

    try {
      const parsed = JSON.parse(card.answer)
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch {}

    const cleanAnswer = (card.answer || '').trim()
    const cleanQuestion = (card.question || '').trim()

    let title = cleanQuestion
      .replace(/^(What is|Explain|Describe|How do(es)?|Why does)\s+/i, '')
      .replace(/\?$/, '')
    if (title.length > 36) title = title.slice(0, 32) + '...'
    if (!title) title = `Concept #${(card.seq_num ?? index + 1)}`

    const sentences = cleanAnswer.split(/(?<=[.!?])\s+/).filter(Boolean)
    const definition = sentences[0] || cleanAnswer
    const important = sentences[1] || card.key_takeaway || ''
    const secondary = sentences.slice(2).join(' ')

    return {
      title,
      definition,
      important: important ? `Key takeaway: ${important}` : undefined,
      comparison_title: secondary ? 'CORE PRINCIPLES & APPLICATIONS' : undefined,
      comparison_text: secondary || undefined,
      rule_boxes: [
        card.key_takeaway || `Core takeaway: ${definition.slice(0, 48)}...`,
      ],
    }
  }, [card, index])

  // Formatted clean text answer for direct reading
  const cleanAnswerText = useMemo(() => {
    if (!card.answer) return data.definition || ''
    const str = card.answer.trim()
    if (str.startsWith('{') && str.endsWith('}')) {
      try {
        const parsed = JSON.parse(str)
        return parsed.definition || parsed.title || str
      } catch {}
    }
    return str
  }, [card.answer, data])

  const toggleMaskReveal = (id: string) => {
    setRevealedMaskIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const isTermMasked = (id: string) => {
    return masked && !revealedMaskIds[id]
  }

  // Difficulty badge colors and descriptions
  const difficulty = (card.difficulty || 'Medium') as 'Easy' | 'Medium' | 'Advanced'
  const diffClass =
    difficulty.toLowerCase() === 'easy'
      ? 'diff-easy'
      : difficulty.toLowerCase() === 'advanced'
      ? 'diff-advanced'
      : 'diff-medium'

  const seqNum = card.seq_num || index + 1
  const cardTopic = card.topic || 'General Concept'
  const cardType = card.card_type || 'Concept'

  const ratingNames: Record<number, { label: string; interval: string; color: string; bg: string }> = {
    1: { label: 'Again', interval: '< 10 min', color: '#dc2626', bg: '#fee2e2' },
    2: { label: 'Hard', interval: '1 day', color: '#d97706', bg: '#fef3c7' },
    3: { label: 'Good', interval: '3 days', color: '#2563eb', bg: '#dbeafe' },
    4: { label: 'Easy', interval: '7 days', color: '#16a34a', bg: '#dcfce7' },
  }

  return (
    <div className={`handwritten-card-wrapper ${isStudyMode ? 'study-mode-active' : ''}`}>
      {/* Top Meta Bar */}
      <div className="card-top-meta">
        <div className="card-meta-left">
          <span className="card-seq-badge">
            <Sparkles size={12} /> CARD #{String(seqNum).padStart(2, '0')}
            {totalCards && <span className="total-of"> / {totalCards}</span>}
          </span>
          <span className={`difficulty-pill ${diffClass}`}>{difficulty}</span>
          <span className="card-type-pill">
            <Tag size={10} style={{ marginRight: 3 }} /> {cardType}
          </span>
          {cardTopic && (
            <span className="card-topic-pill" title={cardTopic}>
              {cardTopic}
            </span>
          )}
        </div>

        <div className="card-meta-right">
          {card.rating && (
            <span
              className="rating-indicator"
              style={{
                background: ratingNames[card.rating]?.bg || '#f1f5f9',
                color: ratingNames[card.rating]?.color || '#475569',
              }}
            >
              <Check size={11} /> Rated: {ratingNames[card.rating]?.label} ({ratingNames[card.rating]?.interval})
            </span>
          )}
          {card.review_count && card.review_count > 0 ? (
            <span className="review-count-badge" title="Number of times reviewed">
              {card.review_count} {card.review_count === 1 ? 'review' : 'reviews'}
            </span>
          ) : null}
        </div>
      </div>

      {/* Main Card Canvas */}
      <div className={`handwritten-paper active-recall-paper ${!revealed ? 'prompt-state' : 'revealed-state'}`}>
        {/* Active Recall Question Prompt */}
        <div className="card-prompt-section">
          <div className="prompt-header-row">
            <span className="prompt-label">ACTIVE RECALL OBJECTIVE</span>
            {card.source_reference && (
              <span className="source-ref-badge" title="Source Excerpt Reference">
                <BookOpen size={11} style={{ marginRight: 4 }} />
                {card.source_reference.length > 55
                  ? card.source_reference.slice(0, 52) + '...'
                  : card.source_reference}
              </span>
            )}
          </div>

          <h2 className="active-recall-question">{card.question}</h2>

          {!revealed && (
            <div className="hidden-answer-callout">
              <div className="recall-cue">
                <AlertCircle size={15} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Active Recall Rule:</strong> Pause and articulate the definition,
                  mechanism, or formula in your mind or on paper before revealing the answer.
                </div>
              </div>

              <div className="reveal-action-bar">
                <button
                  type="button"
                  className="reveal-answer-btn"
                  onClick={() => handleSetRevealed(true)}
                  autoFocus={isStudyMode}
                >
                  <EyeOff size={15} style={{ marginRight: 6 }} />
                  Reveal Answer & Study Sheet
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Revealed Content: Concise Answer + Handwritten GoodNotes Sheet */}
        {revealed && (
          <div className="card-answer-section">
            {/* Concise Self-Contained Answer */}
            <div className="direct-answer-box">
              <div className="answer-box-header">
                <CheckCircle2 size={15} style={{ color: '#059669' }} />
                <span>MODEL ANSWER</span>
              </div>
              <p className="direct-answer-text">{cleanAnswerText}</p>
              {card.key_takeaway && (
                <div className="key-takeaway-highlight">
                  <strong>💡 Key Takeaway:</strong> {card.key_takeaway}
                </div>
              )}
            </div>

            {/* Handwritten GoodNotes Notebook Canvas */}
            <div className="notebook-sheet handwritten-embedded-sheet">
              {/* Header: Royal Blue with hand-drawn wavy underline */}
              <div className="sheet-header">
                <h3 className="handwritten-title">{data.title || cardTopic}</h3>
                <svg className="wavy-underline" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
                  <path
                    d="M2 7 C 30 2, 60 11, 90 6 C 120 1, 150 11, 180 6 C 210 1, 240 10, 270 5 C 285 2, 298 7, 298 7"
                    stroke="#1d4ed8"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5 10 C 35 6, 65 13, 95 9 C 125 5, 155 13, 185 8 C 215 4, 245 12, 275 8 C 288 6, 295 9, 295 9"
                    stroke="#2563eb"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Core Equation / Concept Definition */}
              {data.equation && (
                <div className="equation-block">
                  <div className="math-row">
                    <span
                      className={`formula-main ${isTermMasked('eq-main') ? 'masked-term' : ''}`}
                      onClick={() => toggleMaskReveal('eq-main')}
                    >
                      {data.equation}
                    </span>
                  </div>
                </div>
              )}

              {/* Core Narrative Text / Definition */}
              {data.definition && (
                <p className="narrative-text">
                  {data.definition.split(' ').map((word, i) => {
                    const lower = word.toLowerCase()
                    const isPink =
                      lower.includes('acid') || lower.includes('donor') || lower.includes('algorithm')
                    const isBlue =
                      lower.includes('base') || lower.includes('acceptor') || lower.includes('optimal')
                    const isCyan =
                      lower.includes('conjugate') || lower.includes('complexity') || lower.includes('state')
                    if (isPink)
                      return (
                        <span
                          key={i}
                          className={`ink-pink ${isTermMasked(`def-${i}`) ? 'masked-term' : ''}`}
                          onClick={() => toggleMaskReveal(`def-${i}`)}
                        >
                          {word}{' '}
                        </span>
                      )
                    if (isBlue)
                      return (
                        <span
                          key={i}
                          className={`ink-blue ${isTermMasked(`def-${i}`) ? 'masked-term' : ''}`}
                          onClick={() => toggleMaskReveal(`def-${i}`)}
                        >
                          {word}{' '}
                        </span>
                      )
                    if (isCyan)
                      return (
                        <span
                          key={i}
                          className={`ink-cyan ${isTermMasked(`def-${i}`) ? 'masked-term' : ''}`}
                          onClick={() => toggleMaskReveal(`def-${i}`)}
                        >
                          {word}{' '}
                        </span>
                      )
                    return word + ' '
                  })}
                </p>
              )}

              {/* Examples Section */}
              {data.examples && data.examples.length > 0 && (
                <div className="section-block">
                  <h4 className="section-subtitle">Examples & Applications:</h4>
                  {data.examples.map((ex, i) => (
                    <div key={i} className="example-row">
                      <div
                        className={`example-equation ${isTermMasked(`ex-${i}`) ? 'masked-term' : ''}`}
                        onClick={() => toggleMaskReveal(`ex-${i}`)}
                      >
                        {ex.equation}
                      </div>
                      {ex.note && <div className="example-subnote">{ex.note}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* IMPORTANT Callout Box */}
              {data.important && (
                <div className="important-callout">
                  <span className="important-label">IMPORTANT: </span>
                  <span className="important-body">{data.important}</span>
                </div>
              )}

              {/* Comparison / Distinctions Section */}
              {data.comparison_title && (
                <div className="comparison-section">
                  <h4 className="comparison-heading">
                    <span>{data.comparison_title}</span>
                  </h4>
                  {data.comparison_text && <p className="narrative-text">{data.comparison_text}</p>}
                </div>
              )}

              {/* Highlighted Rule Boxes */}
              {data.rule_boxes && data.rule_boxes.length > 0 && (
                <div className="rule-boxes-container">
                  {data.rule_boxes.map((rule, i) => (
                    <div
                      key={i}
                      className={`teal-rule-box ${isTermMasked(`rule-${i}`) ? 'masked-box' : ''}`}
                      onClick={() => toggleMaskReveal(`rule-${i}`)}
                    >
                      {rule}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Recall 4-Button Rating Bar (Documented Leitner System) */}
            <div className="active-recall-rating-container">
              <div className="rating-prompt-title">
                <GraduationCap size={16} /> How accurately did you recall this concept?
                <span className="leitner-note" title="Documented 4-box Leitner interval review system">
                  (Leitner Spaced Review)
                </span>
              </div>

              <div className="rating-buttons-grid">
                <button
                  type="button"
                  className={`rate-btn rate-again ${card.rating === 1 ? 'selected' : ''}`}
                  onClick={() => {
                    setRatingToast('Saved: Again (< 10 min repeat)')
                    onRate?.(1)
                  }}
                  title="Failed to recall - repeat soon (< 10 min)"
                >
                  <span className="rate-num">1</span>
                  <div className="rate-body">
                    <strong>Again</strong>
                    <span className="rate-interval">&lt; 10 min</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rate-btn rate-hard ${card.rating === 2 ? 'selected' : ''}`}
                  onClick={() => {
                    setRatingToast('Saved: Hard (Review in 1 day)')
                    onRate?.(2)
                  }}
                  title="Recalled with effort - review in 1 day"
                >
                  <span className="rate-num">2</span>
                  <div className="rate-body">
                    <strong>Hard</strong>
                    <span className="rate-interval">1 day</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rate-btn rate-good ${card.rating === 3 ? 'selected' : ''}`}
                  onClick={() => {
                    setRatingToast('Saved: Good (Review in 3 days)')
                    onRate?.(3)
                  }}
                  title="Good recall - review in 3 days"
                >
                  <span className="rate-num">3</span>
                  <div className="rate-body">
                    <strong>Good</strong>
                    <span className="rate-interval">3 days</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rate-btn rate-easy ${card.rating === 4 ? 'selected' : ''}`}
                  onClick={() => {
                    setRatingToast('Saved: Easy (Review in 7 days)')
                    onRate?.(4)
                  }}
                  title="Effortless mastery - review in 7 days"
                >
                  <span className="rate-num">4</span>
                  <div className="rate-body">
                    <strong>Easy</strong>
                    <span className="rate-interval">7 days</span>
                  </div>
                </button>
              </div>

              {/* Rating Feedback Toast & Quick Advance */}
              {card.rating && (
                <div className="rating-feedback-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} style={{ color: ratingNames[card.rating]?.color }} />
                    <span>
                      {ratingToast || `Rated: ${ratingNames[card.rating]?.label} (Review in ${ratingNames[card.rating]?.interval})`}
                    </span>
                  </div>
                  {isStudyMode && (
                    <button
                      type="button"
                      className="advance-next-btn"
                      onClick={onNext}
                      autoFocus
                    >
                      {hasNext ? 'Next Card →' : 'Finish & Summary →'}
                    </button>
                  )}
                </div>
              )}

              <div className="hide-again-row">
                <button
                  type="button"
                  className="hide-answer-subbtn"
                  onClick={() => handleSetRevealed(false)}
                >
                  <RotateCcw size={12} style={{ marginRight: 4 }} /> Re-hide answer
                </button>

                {isStudyMode && (
                  <div className="study-nav-quick">
                    <button
                      type="button"
                      disabled={!hasPrev}
                      onClick={onPrev}
                      className="nav-prev-btn"
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <button
                      type="button"
                      onClick={onNext}
                      className={`nav-next-btn ${card.rating ? 'ready-next' : ''}`}
                      style={card.rating ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : {}}
                    >
                      {hasNext ? 'Next' : 'Summary'} <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
