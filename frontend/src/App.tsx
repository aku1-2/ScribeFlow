import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import {
  AlertCircle,
  BookOpen,
  Check,
  Clock,
  Cloud,
  Download,
  FileAudio2,
  Grid,
  HardDrive,
  HelpCircle,
  Layers3,
  LoaderCircle,
  Menu,
  Mic,
  MicOff,
  Network,
  Plus,
  Rows,
  Sparkles,
  Trash2,
  Upload,
  WifiOff,
  GraduationCap,
  BarChart3,
  RefreshCw,
  RotateCcw,
  ArrowRight,
  Award,
  CheckCircle2,
  Search,
  Pencil,
  Video,
  Youtube,
  X,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import HandwrittenCard from './HandwrittenCard'
import HowItWorks from './HowItWorks'
import { AuthView } from './AuthView'
import { initSupabase, getDevAuth, signOutUser, UserProfile } from './supabaseClient'
import { clearLocalUserData, getOfflineSets, getSetOfflineKey, isSetSavedOffline, removeOffline, saveOffline, updateOfflineCardRating, updateOfflineSetTitle } from './offline'
import { getCardKey, type Flashcard, type StudySet, type TranscriptionStatus } from './types'

const LOCAL_API_ORIGIN = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : ''
const API = (import.meta.env.VITE_API_URL || LOCAL_API_ORIGIN).replace(/\/$/, '')

// Utility to guarantee every card and set has a stable unique ID & consistent metrics
export function normalizeStudySet(set: StudySet): StudySet {
  const setKey = getSetOfflineKey(set)
  const normalizedFlashcards = (set.flashcards || []).map((fc, idx) => {
    const stableId = fc.id != null && fc.id !== '' ? fc.id : `${setKey}-fc-${fc.seq_num ?? idx + 1}`
    return {
      ...fc,
      id: stableId,
      seq_num: fc.seq_num ?? idx + 1,
    }
  })

  const total = normalizedFlashcards.length
  const diffCounts: Record<string, number> = {}
  const topicCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  let challenging = 0

  for (const fc of normalizedFlashcards) {
    const d = fc.difficulty || 'Medium'
    diffCounts[d] = (diffCounts[d] || 0) + 1
    const t = fc.topic || set.topic || 'General'
    topicCounts[t] = (topicCounts[t] || 0) + 1
    const ct = fc.card_type || 'concept'
    typeCounts[ct] = (typeCounts[ct] || 0) + 1
    if (fc.rating === 1 || fc.rating === 2) challenging++
  }

  return {
    ...set,
    offlineKey: setKey,
    flashcards: normalizedFlashcards,
    summary: {
      total_cards: total,
      difficulty_counts: diffCounts,
      topic_counts: topicCounts,
      card_type_counts: typeCounts,
      challenging_count: challenging,
    },
  }
}

// Featured Acid-Base Equilibrium Study Sheet (from student reference photo)
const acidBaseDemoSet: StudySet = {
  id: 1001,
  offlineKey: 'demo-acid-base',
  title: 'Acid-Base Equilibrium & Conjugate Pairs',
  topic: 'Chemistry',
  transcript:
    'Dissociation of a generic acid can be represented by H-A + H2O ⇌ H+ + A-. According to the Brønsted-Lowry definition, the acid is a donor of H+ while the base is an acceptor of H+ in the solution. Examples include CH3COOH + NH3 ⇌ CH3COO- + NH4+. IMPORTANT: Once the acid loses the proton, it becomes a conjugate base. Likewise, when the base accepts the proton from the solution, it becomes the conjugate acid. Strong acids dissociate nearly quantitatively while weak acids dissociate only partially. We describe the extent of this dissociation with the Ka & pKa values. Ka = [products] / [reagents]. Raw Ka values are hard to operate, so we use pKa values instead, where pKa = -log(Ka).',
  notes:
    '• According to the Brønsted-Lowry definition, an acid is a proton donor and a base is a proton acceptor.\n• Acid dissociation forms a conjugate base; base protonation forms a conjugate acid.\n• Strong acids dissociate completely in aqueous solution, whereas weak acids establish an equilibrium.\n• Higher Ka values indicate stronger acid dissociation, while lower pKa indicates higher acidity.',
  flashcards: [
    {
      id: 'demo-acid-1',
      seq_num: 1,
      topic: 'Chemistry',
      card_type: 'Mechanism & Equilibrium',
      difficulty: 'Medium',
      question: 'Acid-Base Equilibrium: How do Brønsted-Lowry conjugate pairs and Ka/pKa determine acid strength?',
      answer: 'Acid-Base Equilibrium determines proton transfer and dissociation strength using Ka and pKa.',
      rich_data: {
        title: 'Acid-Base Equilibrium',
        equation: 'H-A  ⇌  H⁺  +  A⁻',
        definition: 'According to the Brønsted-Lowry definition, the acid is a donor of H⁺ while the base is an acceptor of H⁺ in the solution.',
        examples: [
          {
            equation: 'CH₃-C(=O)O-H  +  :NH₃  ⇌  CH₃-C(=O)O⁻  +  NH₄⁺',
            note: '(acid) + (base)  ⇌  (conjugate base) + (conjugate acid)'
          },
          {
            equation: 'CH₃CH₂-O-CH₂CH₃  +  H-O-SO₃H  ⇌  (CH₃CH₂)₂O-H⁺  +  HSO₄⁻',
            note: '(base) + (acid)  ⇌  (conjugate acid) + (conjugate base)'
          }
        ],
        important: 'Once the acid loses the proton, it becomes a conjugate base. Likewise, when the base accepts the proton from the solution, it becomes the conjugate acid.',
        comparison_title: 'STRONG ACIDS vs WEAK ACIDS',
        comparison_text: 'Strong acids dissociate nearly quantitatively while weak acids dissociate only partially. We describe the extent of this dissociation with the Ka & pKa values.',
        formula_display: 'Ka = [CH₃COO⁻][H⁺] / [CH₃COOH]  =  [products] / [reagents]',
        rule_boxes: [
          'High Ka = strong acid & Low Ka = weak acid',
          'Low pKa = strong acid & High pKa = weak acid'
        ]
      }
    }
  ]
}

const machineLearningDemoSet: StudySet = {
  id: 1002,
  offlineKey: 'demo-machine-learning',
  title: 'Introduction to Supervised Machine Learning',
  topic: 'Computer Science / IT',
  transcript:
    'Machine learning is a field of computer science that enables algorithms to learn patterns from data. Supervised learning uses labeled training examples to fit model weights. The objective is to minimize a loss function using optimization techniques like gradient descent over repeated epochs.',
  notes:
    '• Machine learning discovers structural patterns in empirical data.\n• Supervised learning requires paired input features and known ground-truth labels.\n• Optimization algorithms like gradient descent iteratively minimize the loss function.\n• Training requires clean data separation between training and test sets.',
  flashcards: [
    {
      id: 'demo-ml-1',
      seq_num: 1,
      topic: 'Computer Science / IT',
      card_type: 'Concept & Loss Optimization',
      difficulty: 'Easy',
      question: 'What does supervised learning require to train a model?',
      answer: 'Supervised learning requires paired training data consisting of input features and corresponding ground-truth target labels to calculate prediction errors and update parameters.',
      rich_data: {
        title: 'Supervised Learning Fundamentals',
        equation: 'y = f(X; θ)  →  Loss(y, ŷ) = ½ ∑ (y - ŷ)²',
        definition: 'Supervised learning fits mathematical model parameters θ by evaluating predictions against known ground-truth labels across repeated training iterations.',
        examples: [
          {
            equation: 'Input: Lecture Text Features (TF-IDF)  →  Output: Subject Topic Label',
            note: 'Linear classifier maps vocabulary weights to subject classes.'
          }
        ],
        important: 'Model evaluation must always run on isolated test sets to detect overfitting and evaluate real generalization.',
        comparison_title: 'TRAINING vs GENERALIZATION',
        comparison_text: 'Minimizing training loss without regularization leads to memorization. Proper validation curves ensure the model performs reliably on new unseen lectures.',
        rule_boxes: [
          'Low Test Loss = High Generalization & High Train Accuracy only = Overfitting'
        ]
      }
    }
  ]
}

// Browser SpeechRecognition interface polyfill
interface IWindow extends Window {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

function MarkdownNotes({ content }: { content: string }) {
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(content, { gfm: true, breaks: true }) as string
    } catch {
      return content
    }
  }, [content])

  return (
    <div
      className="notes-text"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  )
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [authRedirectReason, setAuthRedirectReason] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const [sets, setSets] = useState<StudySet[]>([])
  const [active, setActive] = useState<StudySet | null>(null)
  const [revealedCardMap, setRevealedCardMap] = useState<Record<string, boolean>>({})
  const [sessionReviewedKeys, setSessionReviewedKeys] = useState<Record<string, boolean>>({})
  const [sessionRatings, setSessionRatings] = useState<Record<string, number>>({})
  const [restartFeedback, setRestartFeedback] = useState(false)
  const restartTimeoutRef = useRef<any>(null)
  const [title, setTitle] = useState(() => localStorage.getItem('scribeflow_draft_title') || 'Lecture Notes')
  const [transcript, setTranscript] = useState(() => localStorage.getItem('scribeflow_draft_transcript') || '')
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('scribeflow_search_query') || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [isSavedOffline, setIsSavedOffline] = useState(false)
  const [tab, setTab] = useState<'notes' | 'cards' | 'transcript'>('cards')
  const [cardLayout, setCardLayout] = useState<'sheet' | 'compact'>('sheet')
  const [studyViewMode, setStudyViewMode] = useState<'interactive' | 'grid'>('interactive')
  const [studyCardIndex, setStudyCardIndex] = useState(0)
  const [studyFilter, setStudyFilter] = useState<'all' | 'challenging' | 'unreviewed'>('all')
  const [showSummary, setShowSummary] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [currentView, setCurrentView] = useState<'workspace' | 'how-it-works'>('workspace')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [renamingSet, setRenamingSet] = useState<StudySet | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ title: string; message: string; confirmLabel: string } | null>(null)
  const deleteConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null)

  function askDeleteConfirmation(request: { title: string; message: string; confirmLabel: string }): Promise<boolean> {
    setDeleteConfirmation(request)
    return new Promise(resolve => {
      deleteConfirmationResolver.current = resolve
    })
  }

  function resolveDeleteConfirmation(confirmed: boolean) {
    const resolve = deleteConfirmationResolver.current
    deleteConfirmationResolver.current = null
    setDeleteConfirmation(null)
    resolve?.(confirmed)
  }

  useEffect(() => {
    if (deleteConfirmation) {
      setTimeout(() => {
        cancelDeleteButtonRef.current?.focus()
      }, 50)
    }
  }, [deleteConfirmation])

  // Authenticated fetch wrapper injecting Bearer token & handling 401 expiration
  async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers || {})
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`)
    }
    const res = await fetch(url, { ...options, headers })
    if (res.status === 401) {
      setUser(null)
      setAuthToken(null)
      setAuthRedirectReason('Your session has expired. Please sign in again.')
      setAuthModalMode('signin')
      setAuthModalOpen(true)
    }
    return res
  }

  // Route & Action Guard: Requires authentication for protected features
  function requireAuth(action?: () => void, message?: string): boolean {
    if (user && authToken) {
      if (action) action()
      return true
    }
    if (action) {
      setPendingAction(() => action)
    } else {
      setPendingAction(null)
    }
    setAuthRedirectReason(message || 'Please sign in to access your study materials.')
    setAuthModalMode('signin')
    setAuthModalOpen(true)
    return false
  }

  function handleAuthSuccess(newUser: UserProfile, newToken: string) {
    setUser(newUser)
    setAuthToken(newToken)
    setAuthModalOpen(false)
    setAuthRedirectReason(null)
    setNotice(`Signed in as ${newUser.fullName || newUser.email}`)
    setTimeout(() => setNotice(''), 4000)

    refreshStudySets(undefined, newToken, newUser.id)

    if (pendingAction) {
      const act = pendingAction
      setPendingAction(null)
      setTimeout(() => act(), 100)
    }
  }

  async function handleSignOut() {
    const currentUid = user?.id
    await signOutUser(currentUid)
    setUser(null)
    setAuthToken(null)
    setSets([])
    setActive(null)
    setCurrentView('workspace')
    setTitle('Lecture Notes')
    setTranscript('')
    setNotice('Signed out successfully.')
    setTimeout(() => setNotice(''), 3000)
  }

  // Supabase Auth and Session listener initialization
  useEffect(() => {
    let mounted = true
    async function checkAuth() {
      try {
        const client = await initSupabase()
        if (client) {
          const { data } = await client.auth.getSession()
          if (mounted && data.session?.user && data.session.access_token) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || '',
              fullName: data.session.user.user_metadata?.full_name,
              avatarUrl: data.session.user.user_metadata?.avatar_url,
            })
            setAuthToken(data.session.access_token)
            setAuthLoading(false)
            return
          }

          client.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return
            if (session?.user && session.access_token) {
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                fullName: session.user.user_metadata?.full_name,
                avatarUrl: session.user.user_metadata?.avatar_url,
              })
              setAuthToken(session.access_token)
            } else {
              setUser(null)
              setAuthToken(null)
            }
          })
        }

        const devAuth = getDevAuth()
        if (mounted && devAuth) {
          setUser(devAuth.user)
          setAuthToken(devAuth.token)
        }
      } catch (err) {
        console.warn('Auth check warning:', err)
      } finally {
        if (mounted) setAuthLoading(false)
      }
    }

    checkAuth()
    return () => {
      mounted = false
    }
  }, [])

  // Sync library when auth state changes
  useEffect(() => {
    if (user && authToken) {
      refreshStudySets(undefined, authToken, user.id)
    } else {
      setSets([])
      setActive(null)
    }
  }, [user?.id, authToken])

  // Auto-focus and select input when rename dialog opens
  useEffect(() => {
    if (renamingSet) {
      const timer = setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus()
          renameInputRef.current.select()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [renamingSet])

  // Manage body scroll lock and keyboard/resize listeners for mobile drawer and dialogs
  useEffect(() => {
    if (mobileNavOpen || renamingSet || Boolean(deleteConfirmation)) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteConfirmation) {
          resolveDeleteConfirmation(false)
        } else if (renamingSet) {
          setRenamingSet(null)
          setRenameTitle('')
          setRenameError('')
          setRenameSaving(false)
        } else if (mobileNavOpen) {
          setMobileNavOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileNavOpen, renamingSet, deleteConfirmation])


  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 820) {
        setMobileNavOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Persist draft search/transcript, draft title, and search filter across page refreshes
  useEffect(() => {
    localStorage.setItem('scribeflow_draft_title', title)
  }, [title])

  useEffect(() => {
    localStorage.setItem('scribeflow_draft_transcript', transcript)
  }, [transcript])

  useEffect(() => {
    localStorage.setItem('scribeflow_search_query', searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (active) {
      const activeKey = String(active.id ?? active.offlineKey ?? active.title)
      localStorage.setItem('scribeflow_active_set_id', activeKey)
      localStorage.setItem('scribeflow_last_viewed_set_id', activeKey)
    }
  }, [active])

  // Synchronize actual IndexedDB persistence status for active set
  useEffect(() => {
    let isCancelled = false
    if (!active) {
      setIsSavedOffline(false)
      return
    }
    void isSetSavedOffline(active).then(exists => {
      if (!isCancelled) {
        setIsSavedOffline(exists)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [active?.id, active?.title, active?.offlineKey])

  // Reset per-card reveal states and session progress when active set changes
  useEffect(() => {
    setRevealedCardMap({})
    setSessionReviewedKeys({})
    setSessionRatings({})
    setStudyCardIndex(0)
    setShowSummary(false)
  }, [active?.id, active?.title])

  // Exam depth & Subject classification state
  const [marks, setMarks] = useState<number>(3)
  const [selectedTopic, setSelectedTopic] = useState<string>('')
  const [predictedInfo, setPredictedInfo] = useState<{
    topic: string
    confidence: number
    isUncertain: boolean
  } | null>(null)
  const [supportedTopics, setSupportedTopics] = useState<string[]>([
    "English / Literature",
    "Biology / Life Sciences",
    "Chemistry",
    "Computer Science / IT",
    "Economics",
    "Electrical and Electronics Engineering",
    "Engineering (Mechanical, Civil, Chemical)",
    "History",
    "Mathematics",
    "Physics",
    "General Studies",
  ])

  // Transcription & Media states
  const [inputMode, setInputMode] = useState<'paste' | 'audio' | 'video' | 'youtube' | 'mic'>('paste')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoProgressText, setVideoProgressText] = useState<string>('')
  const [youtubeUrl, setYoutubeUrl] = useState<string>('')
  const [youtubeAccessToken, setYoutubeAccessToken] = useState<string>('')
  const [transcribeStatus, setTranscribeStatus] = useState<TranscriptionStatus | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Feature detection for browser speech recognition
  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    const win = window as IWindow
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    void refreshStudySets()
    void fetchTranscriptionStatus()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
    }
  }, [])

  async function fetchTranscriptionStatus() {
    try {
      const resp = await fetch(`${API}/api/transcribe/status`)
      if (resp.ok) {
        const data = await resp.json() as TranscriptionStatus
        setTranscribeStatus(data)
      }
    } catch {
      // Backend may be offline; keep null
    }
  }

  // Live topic prediction debounce when transcript is entered
  useEffect(() => {
    const trimmed = transcript.trim()
    if (trimmed.length < 35) {
      setPredictedInfo(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const resp = await authFetch(`${API}/api/predict-topic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        })
        if (resp.ok) {
          const data = await resp.json()
          setPredictedInfo({
            topic: data.predicted_topic,
            confidence: data.confidence,
            isUncertain: data.is_uncertain,
          })
          if (!selectedTopic || selectedTopic === 'Unknown / choose a subject') {
            setSelectedTopic(data.predicted_topic)
          }
          if (data.supported_subjects) {
            setSupportedTopics(data.supported_subjects)
          }
        }
      } catch {}
    }, 600)
    return () => clearTimeout(timer)
  }, [transcript, authToken])

  async function refreshStudySets(preferredSetId?: string | number, overrideToken?: string, overrideUserId?: string) {
    const effectiveToken = overrideToken !== undefined ? overrideToken : authToken
    const effectiveUserId = overrideUserId !== undefined ? overrideUserId : user?.id

    if (!effectiveToken || !effectiveUserId) {
      setSets([])
      setActive(null)
      return
    }

    const rawLocalSets = await getOfflineSets(effectiveUserId)
    const localSets = rawLocalSets.map(normalizeStudySet)
    const targetSetId = preferredSetId !== undefined ? String(preferredSetId) : localStorage.getItem('scribeflow_active_set_id')

    if (navigator.onLine) {
      try {
        const [setsResp, topicsResp] = await Promise.all([
          fetch(`${API}/api/study-sets`, {
            headers: { Authorization: `Bearer ${effectiveToken}` },
          }),
          fetch(`${API}/api/topics`),
        ])
        if (topicsResp.ok) {
          const topData = await topicsResp.json()
          if (topData.supported_subjects) setSupportedTopics(topData.supported_subjects)
        }
        if (setsResp.ok) {
          const serverSets = (await setsResp.json() as StudySet[]).map(normalizeStudySet)

          // 1. Tag server sets with whether they have been explicitly saved offline in this browser
          const serverSetsWithStatus = serverSets.map(s => {
            const localMatch = localSets.find(l =>
              (l.id != null && s.id != null && Number(l.id) === Number(s.id)) ||
              (l.offlineKey && s.offlineKey && l.offlineKey === s.offlineKey)
            )
            return {
              ...s,
              hasOfflineCopy: !!localMatch,
              isOfflineOnly: false,
              savedAt: localMatch?.savedAt,
            }
          })

          // 2. Preserve and distinguish offline-only study sets (exist locally in IndexedDB but not on server)
          const offlineOnlySets = localSets
            .filter(l => !serverSets.some(s => (s.id != null && l.id != null && Number(s.id) === Number(l.id))))
            .map(l => ({
              ...l,
              hasOfflineCopy: true,
              isOfflineOnly: true,
            }))

          const combined = [...serverSetsWithStatus, ...offlineOnlySets]
          setSets(combined)
          setActive(prev => {
            if (targetSetId === '__new__') return null
            if (targetSetId) {
              const foundTarget = combined.find(s => String(s.id) === targetSetId || String(s.offlineKey) === targetSetId || s.title === targetSetId)
              if (foundTarget) return foundTarget
            }
            if (prev) {
              const foundPrev = combined.find(s => (s.id && prev.id && s.id === prev.id) || s.title === prev.title)
              if (foundPrev) return foundPrev
            }
            return combined[0] || null
          })
          return
        }
      } catch (err) {
        console.warn('Could not fetch study sets from server, using local cache:', err)
      }
    }

    // Offline mode: all accessible local sets for this user
    const offlineSetsWithStatus = localSets.map(l => ({
      ...l,
      hasOfflineCopy: true,
      isOfflineOnly: l.id == null,
    }))
    setSets(offlineSetsWithStatus)
    setActive(prev => {
      if (targetSetId === '__new__') return null
      if (targetSetId) {
        const foundTarget = offlineSetsWithStatus.find(s => String(s.id) === targetSetId || String(s.offlineKey) === targetSetId || s.title === targetSetId)
        if (foundTarget) return foundTarget
      }
      if (prev) {
        const foundPrev = offlineSetsWithStatus.find(s => (s.id && prev.id && s.id === prev.id) || s.title === prev.title)
        if (foundPrev) return foundPrev
      }
      return offlineSetsWithStatus[0] || null
    })
  }

  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) return sets
    const q = searchQuery.toLowerCase().trim()
    return sets.filter(s =>
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.topic && s.topic.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q)) ||
      (s.transcript && s.transcript.toLowerCase().includes(q)) ||
      (s.flashcards && s.flashcards.some(f => f.question?.toLowerCase().includes(q) || f.answer?.toLowerCase().includes(q)))
    )
  }, [sets, searchQuery])

  const wordCount = useMemo(() => {
    const trimmed = transcript.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }, [transcript])

  async function createStudySetFromText() {
    if (!requireAuth(() => createStudySetFromText(), 'Please sign in to create study sets.')) {
      return
    }

    const cleanText = transcript.trim()
    if (cleanText.length < 20) {
      setError('Please provide at least 20 characters of lecture transcript to generate study materials.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await authFetch(`${API}/api/study-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Lecture Notes',
          transcript: cleanText,
          topic: selectedTopic || undefined,
          marks: marks,
        }),
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.detail ?? `Server error (${response.status})`)
      }

      const created = normalizeStudySet(await response.json() as StudySet)
      const activeKey = String(created.id ?? created.offlineKey ?? created.title)
      localStorage.setItem('scribeflow_active_set_id', activeKey)
      localStorage.setItem('scribeflow_last_viewed_set_id', activeKey)
      setTranscript('')
      setTitle('Lecture Notes')
      localStorage.removeItem('scribeflow_draft_transcript')
      localStorage.removeItem('scribeflow_draft_title')
      setActive(created)
      setTab('cards')
      setNotice(`Study set "${created.title}" created successfully and saved to your library!`)
      await refreshStudySets(created.id)
    } catch (err: any) {
      const message = String(err?.message || '')
      setError(message.toLowerCase().includes('fetch')
        ? `Could not reach the ScribeFlow backend at ${API || 'this site'}. Check that the backend is running and open http://127.0.0.1:8000/api/health.`
        : message || 'Could not generate study materials. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAudioUpload(directCreate: boolean = false) {
    if (!requireAuth(() => handleAudioUpload(directCreate), 'Please sign in to transcribe audio recordings.')) {
      return
    }

    if (!audioFile) {
      setError('Please select an audio file (.mp3, .wav, .m4a, .webm, .ogg) to upload.')
      return
    }

    if (audioFile.size > 100 * 1024 * 1024) {
      setError('Audio file exceeds the maximum size limit of 100 MB. Please choose a file under 100 MB.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    const resolvedTitle = (title.trim() && title.trim() !== 'Lecture Notes')
      ? title.trim()
      : audioFile.name.replace(/\.[^/.]+$/, '')

    const formData = new FormData()
    formData.append('file', audioFile)
    if (directCreate) {
      formData.append('title', resolvedTitle)
      if (selectedTopic && selectedTopic !== 'Unknown / choose a subject') {
        formData.append('topic', selectedTopic)
      }
      formData.append('marks', String(marks))
    }

    try {
      const endpoint = directCreate ? `${API}/api/study-sets/from-audio` : `${API}/api/transcribe`
      const resp = await authFetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        if (resp.status === 501) {
          throw new Error(
            errData.detail ||
              'Audio transcription provider is unconfigured. Set OPENAI_API_KEY or GROQ_API_KEY in backend/.env, or paste your transcript directly.'
          )
        }
        throw new Error(errData.detail || `Upload failed with status ${resp.status}`)
      }

      if (directCreate) {
        const createdRaw = await resp.json() as StudySet
        const created = normalizeStudySet(createdRaw)
        const activeKey = String(created.id ?? created.offlineKey ?? created.title)

        localStorage.setItem('scribeflow_active_set_id', activeKey)
        localStorage.setItem('scribeflow_last_viewed_set_id', activeKey)

        setAudioFile(null)
        setTranscript('')
        setTitle('Lecture Notes')
        localStorage.removeItem('scribeflow_draft_transcript')
        localStorage.removeItem('scribeflow_draft_title')

        setActive(created)
        setTab('cards')
        setNotice(`Study set "${created.title}" created successfully and saved to your library!`)

        await refreshStudySets(created.id)
      } else {
        const result = await resp.json() as { transcript: string; filename: string }
        setTranscript(result.transcript)
        if (title === 'Lecture Notes' || !title) {
          setTitle(result.filename.replace(/\.[^/.]+$/, ''))
        }
        setInputMode('paste')
        setNotice('Audio transcribed! You can review or edit the transcript below before creating your study set.')
      }
    } catch (err: any) {
      setNotice('')
      setError(err.message || 'Error processing audio file.')
    } finally {
      setBusy(false)
    }
  }

  async function handleVideoUpload(directCreate: boolean = false) {
    if (!requireAuth(() => handleVideoUpload(directCreate), 'Please sign in to transcribe video lectures.')) {
      return
    }

    if (!videoFile) {
      setError('Please select a video file (.mp4, .mov, .webm, .mkv, .avi) to upload.')
      return
    }

    if (videoFile.size > 200 * 1024 * 1024) {
      setError('Video file exceeds maximum size limit of 200 MB. Please compress or trim the video under 200 MB.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    setVideoProgressText('Uploading video to local server...')

    const resolvedTitle = (title.trim() && title.trim() !== 'Lecture Notes')
      ? title.trim()
      : videoFile.name.replace(/\.[^/.]+$/, '')

    const formData = new FormData()
    formData.append('file', videoFile)
    if (directCreate) {
      formData.append('title', resolvedTitle)
      if (selectedTopic && selectedTopic !== 'Unknown / choose a subject') {
        formData.append('topic', selectedTopic)
      }
      formData.append('marks', String(marks))
    }

    try {
      const endpoint = directCreate ? `${API}/api/study-sets/from-video` : `${API}/api/video/transcribe`
      setVideoProgressText(directCreate ? 'Extracting audio with FFmpeg & generating study set...' : 'Extracting audio with FFmpeg & transcribing speech...')

      const resp = await authFetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        if (resp.status === 501) {
          throw new Error(
            errData.detail ||
              'Audio transcription provider is unconfigured. Set GROQ_API_KEY in backend/.env, or paste your transcript directly.'
          )
        }
        throw new Error(errData.detail || `Video processing failed with status ${resp.status}`)
      }

      if (directCreate) {
        const createdRaw = await resp.json() as StudySet
        const created = normalizeStudySet(createdRaw)
        const activeKey = String(created.id ?? created.offlineKey ?? created.title)

        localStorage.setItem('scribeflow_active_set_id', activeKey)
        localStorage.setItem('scribeflow_last_viewed_set_id', activeKey)

        setVideoFile(null)
        setTranscript('')
        setTitle('Lecture Notes')
        localStorage.removeItem('scribeflow_draft_transcript')
        localStorage.removeItem('scribeflow_draft_title')

        setActive(created)
        setTab('cards')
        setNotice(`Study set "${created.title}" created successfully from video and saved to your library!`)

        await refreshStudySets(created.id)
      } else {
        const result = await resp.json() as { transcript: string; filename: string; duration_seconds?: number }
        setTranscript(result.transcript)
        if (title === 'Lecture Notes' || !title) {
          setTitle(result.filename.replace(/\.[^/.]+$/, ''))
        }
        setInputMode('paste')
        const durHint = result.duration_seconds ? ` (${Math.round(result.duration_seconds)}s)` : ''
        setNotice(`Video${durHint} transcribed! You can review or edit the transcript below before creating your study set.`)
      }
    } catch (err: any) {
      setNotice('')
      setError(err.message || 'Error processing video file. Ensure FFmpeg is installed and your transcription key is valid.')
    } finally {
      setBusy(false)
      setVideoProgressText('')
    }
  }

  async function handleYouTubeImport(directCreate: boolean = false) {
    if (!requireAuth(() => handleYouTubeImport(directCreate), 'Please sign in to import YouTube captions.')) {
      return
    }

    const url = youtubeUrl.trim()
    if (!url) {
      setError('Please enter a YouTube video URL (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...).')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const resp = await authFetch(`${API}/api/youtube/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          access_token: youtubeAccessToken.trim() || undefined,
          title: (title.trim() && title.trim() !== 'Lecture Notes') ? title.trim() : undefined,
          topic: (selectedTopic && selectedTopic !== 'Unknown / choose a subject') ? selectedTopic : undefined,
          marks,
          direct_create: directCreate,
        }),
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.detail || `YouTube import failed with status ${resp.status}`)
      }

      if (directCreate) {
        const createdRaw = await resp.json() as StudySet
        const created = normalizeStudySet(createdRaw)
        const activeKey = String(created.id ?? created.offlineKey ?? created.title)

        localStorage.setItem('scribeflow_active_set_id', activeKey)
        localStorage.setItem('scribeflow_last_viewed_set_id', activeKey)

        setYoutubeUrl('')
        setTranscript('')
        setTitle('Lecture Notes')
        localStorage.removeItem('scribeflow_draft_transcript')
        localStorage.removeItem('scribeflow_draft_title')

        setActive(created)
        setTab('cards')
        setNotice(`Study set "${created.title}" created successfully from YouTube captions!`)

        await refreshStudySets(created.id)
      } else {
        const result = await resp.json() as { transcript: string; video_id: string; filename: string }
        setTranscript(result.transcript)
        if (title === 'Lecture Notes' || !title) {
          setTitle(`YouTube Lecture (${result.video_id})`)
        }
        setInputMode('paste')
        setNotice('YouTube captions imported! Review or edit the transcript below before creating your study set.')
      }
    } catch (err: any) {
      setNotice('')
      setError(err.message || 'Could not import YouTube captions.')
    } finally {
      setBusy(false)
    }
  }

  function toggleMicrophoneDictation() {
    if (!speechSupported) {
      setError('Speech recognition is not supported in this browser. Please use Audio Upload or paste transcript text.')
      return
    }

    const win = window as IWindow
    const SpeechRecClass = win.SpeechRecognition || win.webkitSpeechRecognition

    if (isRecording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      setIsRecording(false)
      return
    }

    try {
      const recognition = new SpeechRecClass()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsRecording(true)
        setError('')
        setNotice('Listening to microphone... Speak clearly. Text will stream into your transcript box.')
      }

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            setTranscript(prev => (prev ? `${prev.trim()} ${piece.trim()}` : piece.trim()))
          }
        }
      }

      recognition.onerror = (event: any) => {
        setIsRecording(false)
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. Allow microphone access in your browser settings to dictate.')
        } else {
          setError(`Speech recognition notice: ${event.error}. You can also type or paste your transcript.`)
        }
      }

      recognition.onend = () => {
        setIsRecording(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err: any) {
      setIsRecording(false)
      setError(`Could not start microphone dictation: ${err.message}`)
    }
  }

  async function keepOffline() {
    if (!active) return
    if (!requireAuth(() => keepOffline(), 'Please sign in to save study sets offline.')) {
      return
    }
    setError('')
    setNotice('')
    try {
      await saveOffline(active, user?.id)
      setIsSavedOffline(true)
      const now = new Date().toISOString()
      setSets(curr =>
        curr.map(s =>
          (s.id != null && active.id != null && s.id === active.id) ||
          (s.offlineKey && active.offlineKey && s.offlineKey === active.offlineKey) ||
          s.title === active.title
            ? { ...s, hasOfflineCopy: true, savedAt: now }
            : s
        )
      )
      setActive(prev => (prev ? { ...prev, hasOfflineCopy: true, savedAt: now } : null))
      setNotice(`"${active.title}" saved to browser IndexedDB! Available offline even when disconnected.`)
    } catch (err: any) {
      setError(err?.message || 'Could not save study set offline.')
    }
  }

  async function handleRemoveOfflineCopy(setToUncache: StudySet) {
    if (!setToUncache) return
    const confirmed = await askDeleteConfirmation({
      title: 'Remove offline copy?',
      message: `Remove the local offline copy of "${setToUncache.title}" from this browser? The study set remains safe and fully accessible in your cloud library.`,
      confirmLabel: 'Remove Offline Copy',
    })
    if (!confirmed) return

    setError('')
    setNotice('')
    try {
      await removeOffline(setToUncache)
      setIsSavedOffline(false)
      setSets(curr =>
        curr.map(s =>
          (s.id != null && setToUncache.id != null && s.id === setToUncache.id) ||
          (s.offlineKey && setToUncache.offlineKey && s.offlineKey === setToUncache.offlineKey) ||
          s.title === setToUncache.title
            ? { ...s, hasOfflineCopy: false }
            : s
        )
      )
      setActive(prev => {
        if (!prev) return null
        if (
          (prev.id != null && setToUncache.id != null && prev.id === setToUncache.id) ||
          (prev.offlineKey && setToUncache.offlineKey && prev.offlineKey === setToUncache.offlineKey) ||
          prev.title === setToUncache.title
        ) {
          return { ...prev, hasOfflineCopy: false }
        }
        return prev
      })
      setNotice(`Removed offline copy of "${setToUncache.title}" from this browser. The study set remains in your server library.`)
    } catch (err: any) {
      setError(err?.message || 'Could not remove offline copy.')
    }
  }

  async function handleNavigateToLibrary() {
    if (!requireAuth(() => void handleNavigateToLibrary(), 'Please sign in to access your study library.')) {
      return
    }

    if (!active) {
      const hasContent = transcript.trim().length > 0 || (title.trim() && title.trim() !== 'Lecture Notes')
      if (hasContent) {
        const confirmed = await askDeleteConfirmation({
          title: 'Return to study library?',
          message: 'You have unsubmitted lecture text in the form. Your draft remains stored locally, but do you want to return to your library now?',
          confirmLabel: 'Return to Library',
        })
        if (!confirmed) return
      }
      setCurrentView('workspace')
      if (sets.length > 0) {
        const savedId = localStorage.getItem('scribeflow_last_viewed_set_id')
        const target = (savedId && sets.find(s => String(s.id) === savedId || s.title === savedId)) || sets[0]
        setActive(target)
        localStorage.setItem('scribeflow_active_set_id', String(target.id ?? target.offlineKey ?? target.title))
      }
      return
    }

    if (currentView === 'how-it-works') {
      setCurrentView('workspace')
    }
  }

  async function handleDelete(setToDelete: StudySet) {
    if (!setToDelete) return
    if (!requireAuth(() => void handleDelete(setToDelete), 'Please sign in to manage study sets.')) {
      return
    }

    // Case 1: Offline-only study set (stored only in IndexedDB, not on server)
    if (setToDelete.isOfflineOnly || !setToDelete.id) {
      const confirmed = await askDeleteConfirmation({
        title: 'Delete offline study set?',
        message: `Permanently delete "${setToDelete.title}" from this browser? This is an offline-only set and cannot be recovered once deleted.`,
        confirmLabel: 'Delete Offline Set',
      })
      if (!confirmed) return

      await removeOffline(setToDelete)
      const updated = sets.filter(s => s !== setToDelete && s.title !== setToDelete.title)
      setSets(updated)
      if (active?.title === setToDelete.title || (active?.id && setToDelete.id && active.id === setToDelete.id)) {
        setIsSavedOffline(false)
        const nextActive = updated[0] ?? null
        setActive(nextActive)
        if (nextActive) {
          localStorage.setItem('scribeflow_active_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
          localStorage.setItem('scribeflow_last_viewed_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
        } else {
          localStorage.setItem('scribeflow_active_set_id', '__new__')
        }
      }
      setNotice(`Offline-only study set "${setToDelete.title}" was deleted from local browser storage.`)
      return
    }

    // Case 2: User is currently offline and attempts to delete a server study set
    if (!navigator.onLine) {
      const confirmRemoveLocal = await askDeleteConfirmation({
        title: 'Remove local offline copy?',
        message: `You are currently offline. ScribeFlow cannot reach the server to delete "${setToDelete.title}". Do you want to remove only its local offline copy from this browser? The server study set will remain safe in your cloud account and reappear when you reconnect.`,
        confirmLabel: 'Remove Local Copy Only',
      })
      if (!confirmRemoveLocal) return

      await removeOffline(setToDelete)
      const updated = sets.filter(s => s !== setToDelete && s.title !== setToDelete.title)
      setSets(updated)
      if (active?.title === setToDelete.title || (active?.id && setToDelete.id && active.id === setToDelete.id)) {
        setIsSavedOffline(false)
        const nextActive = updated[0] ?? null
        setActive(nextActive)
        if (nextActive) {
          localStorage.setItem('scribeflow_active_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
          localStorage.setItem('scribeflow_last_viewed_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
        } else {
          localStorage.setItem('scribeflow_active_set_id', '__new__')
        }
      }
      setNotice(`Removed local offline copy of "${setToDelete.title}". Notice: The server copy was NOT deleted because you are working offline.`)
      return
    }

    // Case 3: Online server study set deletion
    const confirmed = await askDeleteConfirmation({
      title: 'Delete server study set?',
      message: `Permanently delete "${setToDelete.title}" from your cloud account and remove any offline copies from this browser? This action cannot be undone.`,
      confirmLabel: 'Delete Server Set',
    })
    if (!confirmed) return

    try {
      const resp = await authFetch(`${API}/api/study-sets/${setToDelete.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        throw new Error(errJson.detail ?? `Server error (${resp.status})`)
      }
      await removeOffline(setToDelete)
      const updated = sets.filter(s => s !== setToDelete && s.title !== setToDelete.title)
      setSets(updated)
      if (active?.title === setToDelete.title || (active?.id && setToDelete.id && active.id === setToDelete.id)) {
        setIsSavedOffline(false)
        const nextActive = updated[0] ?? null
        setActive(nextActive)
        if (nextActive) {
          localStorage.setItem('scribeflow_active_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
          localStorage.setItem('scribeflow_last_viewed_set_id', String(nextActive.id ?? nextActive.offlineKey ?? nextActive.title))
        } else {
          localStorage.setItem('scribeflow_active_set_id', '__new__')
        }
      }
      setNotice(`Study set "${setToDelete.title}" was permanently deleted from your server library and local storage.`)
    } catch (err: any) {
      setError(`Could not delete "${setToDelete.title}" from the server (${err.message}). The study set was preserved.`)
    }
  }

  function openRenameModal(setToRename: StudySet) {
    if (!requireAuth(() => openRenameModal(setToRename), 'Please sign in to rename study sets.')) {
      return
    }
    setRenamingSet(setToRename)
    setRenameTitle(setToRename.title)
    setRenameError('')
    setRenameSaving(false)
  }

  function closeRenameModal() {
    setRenamingSet(null)
    setRenameTitle('')
    setRenameError('')
    setRenameSaving(false)
  }

  async function handleSaveRename() {
    if (!renamingSet) return
    const cleanTitle = renameTitle.trim()
    if (!cleanTitle) {
      setRenameError('Title cannot be empty.')
      renameInputRef.current?.focus()
      return
    }

    if (cleanTitle === renamingSet.title) {
      closeRenameModal()
      return
    }

    setRenameSaving(true)
    setRenameError('')

    let updatedSet: StudySet = { ...renamingSet, title: cleanTitle }

    if (renamingSet.id && navigator.onLine) {
      try {
        const res = await authFetch(`${API}/api/study-sets/${renamingSet.id}/title`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: cleanTitle }),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          const detailMsg = errData.detail || `Server returned ${res.status}: ${res.statusText}`
          setRenameError(detailMsg)
          setRenameSaving(false)
          return
        }
        const data = await res.json()
        updatedSet = normalizeStudySet({ ...renamingSet, ...data, title: cleanTitle })
      } catch (err: any) {
        console.error('Rename API error:', err)
        setRenameError(err.message || 'Network error occurred while renaming study set.')
        setRenameSaving(false)
        return
      }
    }

    // Update in offline storage if set was saved offline
    try {
      const wasOffline = await isSetSavedOffline(renamingSet)
      if (wasOffline) {
        await updateOfflineSetTitle(renamingSet, cleanTitle)
      }
    } catch (offlineErr) {
      console.warn('Could not sync renamed title to IndexedDB:', offlineErr)
    }

    // Update frontend state
    setSets(prev => prev.map(s => {
      const isTarget = (renamingSet.id && s.id === renamingSet.id) ||
        s.title === renamingSet.title ||
        (renamingSet.offlineKey && s.offlineKey === renamingSet.offlineKey)
      return isTarget ? { ...s, title: cleanTitle } : s
    }))

    if (active && (
      (renamingSet.id && active.id === renamingSet.id) ||
      active.title === renamingSet.title ||
      (renamingSet.offlineKey && active.offlineKey === renamingSet.offlineKey)
    )) {
      setActive(prev => prev ? { ...prev, title: cleanTitle } : prev)
      const storageKey = String(updatedSet.id ?? updatedSet.offlineKey ?? cleanTitle)
      localStorage.setItem('scribeflow_active_set_id', storageKey)
      localStorage.setItem('scribeflow_last_viewed_set_id', storageKey)
    }

    setNotice(`Renamed study set to "${cleanTitle}".`)
    closeRenameModal()
  }


  async function handleRateCard(targetCard: Flashcard, rating: number) {
    if (!active) return
    if (!requireAuth(() => handleRateCard(targetCard, rating), 'Please sign in to rate flashcards and track review progress.')) {
      return
    }

    const targetKey = getCardKey(targetCard)
    const cardId = targetCard.id

    // 1. Update React active state & library sets SYNCHRONOUSLY for instant UX
    const updatedFlashcards = active.flashcards.map((fc, idx) => {
      if (getCardKey(fc, idx) === targetKey) {
        return {
          ...fc,
          rating,
          review_count: (fc.review_count || 0) + 1,
          last_reviewed: new Date().toISOString(),
        }
      }
      return fc
    })

    const total = updatedFlashcards.length
    const diffCounts: Record<string, number> = {}
    const topicCounts: Record<string, number> = {}
    const typeCounts: Record<string, number> = {}
    let challenging = 0

    for (const fc of updatedFlashcards) {
      const d = fc.difficulty || 'Medium'
      diffCounts[d] = (diffCounts[d] || 0) + 1
      const t = fc.topic || active.topic || 'General'
      topicCounts[t] = (topicCounts[t] || 0) + 1
      const ct = fc.card_type || 'concept'
      typeCounts[ct] = (typeCounts[ct] || 0) + 1
      if (fc.rating === 1 || fc.rating === 2) challenging++
    }

    const updatedActive: StudySet = {
      ...active,
      flashcards: updatedFlashcards,
      summary: {
        total_cards: total,
        difficulty_counts: diffCounts,
        topic_counts: topicCounts,
        card_type_counts: typeCounts,
        challenging_count: challenging,
      },
    }

    setActive(updatedActive)
    setSets(prev => prev.map(s => ((s.id && active.id && s.id === active.id) || s.title === active.title ? updatedActive : s)))

    // Keep the rated card revealed so it does not collapse unexpectedly
    setRevealedCardMap(prev => ({ ...prev, [targetKey]: true }))

    // Track that this card has been reviewed in the current session
    setSessionReviewedKeys(prev => ({ ...prev, [targetKey]: true }))
    setSessionRatings(prev => ({ ...prev, [targetKey]: rating }))

    // 2. Persist locally to IndexedDB for offline access
    const setId = active.offlineKey ?? active.id ?? active.title
    try {
      await updateOfflineCardRating(setId, cardId ?? targetKey, rating)
    } catch (e) {
      console.warn('IndexedDB rating sync failed:', e)
    }

    // 3. Sync to backend API if online and card has backend numeric ID
    if (online && typeof cardId === 'number') {
      try {
        await authFetch(`${API}/api/flashcards/${cardId}/rating`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        })
      } catch (e) {
        console.warn('Could not sync rating to backend API, persisting offline in IndexedDB:', e)
      }
    }
  }

  async function handleRegenerateFlashcards() {
    if (!active || !active.id) {
      setError('Cannot regenerate cards: study set must be saved to the database.')
      return
    }
    if (!requireAuth(() => handleRegenerateFlashcards(), 'Please sign in to regenerate flashcards.')) {
      return
    }

    setIsRegenerating(true)
    setError('')
    setNotice('')

    try {
      const resp = await authFetch(`${API}/api/study-sets/${active.id}/regenerate-flashcards`, {
        method: 'POST',
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        throw new Error(errJson.detail || `Server error (${resp.status})`)
      }

      const updated = normalizeStudySet(await resp.json() as StudySet)
      setActive(updated)
      setSets(prev => prev.map(s => (s.id === updated.id ? updated : s)))
      setNotice(`Regenerated ${updated.flashcards.length} varied active-recall cards across the chapter!`)
      setStudyCardIndex(0)
      setShowSummary(false)
      setRevealedCardMap({})
    } catch (err: any) {
      setError(err.message || 'Error regenerating flashcards.')
    } finally {
      setIsRegenerating(false)
    }
  }

  async function handleUpdateTopic(newTopic: string) {
    if (!active || !active.id) return
    if (!requireAuth(() => handleUpdateTopic(newTopic), 'Please sign in to update subject topic.')) {
      return
    }
    try {
      const res = await authFetch(`${API}/api/study-sets/${active.id}/topic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic }),
      })
      if (res.ok) {
        setActive(prev => (prev ? { ...prev, topic: newTopic } : prev))
        setSets(prev => prev.map(s => (s.id === active.id ? { ...s, topic: newTopic } : s)))
        setNotice(`Subject updated to "${newTopic}".`)
      }
    } catch (e: any) {
      setError(e.message || 'Could not update subject.')
    }
  }

  function handleRestartSession() {
    setStudyFilter('all')
    setStudyCardIndex(0)
    setShowSummary(false)
    setSessionRatings({})
    setSessionReviewedKeys({})
    setRevealedCardMap({})
    setRestartFeedback(true)
    setNotice('Review session restarted from Card 1. Session progress is 0%.')
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }
    restartTimeoutRef.current = setTimeout(() => {
      setRestartFeedback(false)
    }, 2500)
  }

  // Active recall metrics
  const activeCards = active?.flashcards || []
  const filteredCards = useMemo(() => {
    if (studyFilter === 'challenging') {
      return activeCards.filter(c => c.rating === 1 || c.rating === 2)
    }
    if (studyFilter === 'unreviewed') {
      return activeCards.filter(c => c.rating === null || c.rating === undefined)
    }
    return activeCards
  }, [activeCards, studyFilter])

  const totalCardsCount = activeCards.length
  const challengingCards = useMemo(() => activeCards.filter(c => c.rating === 1 || c.rating === 2), [activeCards])
  const challengingCount = challengingCards.length
  const unreviewedCount = useMemo(() => activeCards.filter(c => c.rating == null).length, [activeCards])

  // Denominator: Total cards in the active review filter
  const totalSessionCards = filteredCards.length

  // Current study session progress: calculated strictly from ratings assigned in the active session
  const sessionReviewedCards = useMemo(
    () => filteredCards.filter(c => sessionRatings[getCardKey(c)] !== undefined),
    [filteredCards, sessionRatings]
  )
  const sessionReviewedCount = sessionReviewedCards.length

  const sessionMasteredCards = useMemo(
    () => sessionReviewedCards.filter(c => {
      const r = sessionRatings[getCardKey(c)]
      return r === 3 || r === 4
    }),
    [sessionReviewedCards, sessionRatings]
  )
  const sessionMasteredCount = sessionMasteredCards.length

  const sessionChallengingCards = useMemo(
    () => sessionReviewedCards.filter(c => {
      const r = sessionRatings[getCardKey(c)]
      return r === 1 || r === 2
    }),
    [sessionReviewedCards, sessionRatings]
  )
  const sessionChallengingCount = sessionChallengingCards.length
  const sessionUnreviewedCount = Math.max(0, totalSessionCards - sessionReviewedCount)

  const sessionProgressPercent = totalSessionCards > 0
    ? Math.round((sessionReviewedCount / totalSessionCards) * 100)
    : 0
  const sessionMasteredPct = totalSessionCards > 0
    ? Math.round((sessionMasteredCount / totalSessionCards) * 100)
    : 0
  const sessionChallengingPct = totalSessionCards > 0
    ? Math.round((sessionChallengingCount / totalSessionCards) * 100)
    : 0
  const sessionUnreviewedPct = totalSessionCards > 0
    ? Math.round((sessionUnreviewedCount / totalSessionCards) * 100)
    : 0

  // All-time cumulative database metrics across all sessions (kept separate from active session)
  const allTimeMasteredCount = useMemo(
    () => activeCards.filter(c => c.rating === 3 || c.rating === 4).length,
    [activeCards]
  )
  const allTimeChallengingCount = challengingCount
  const allTimeUnreviewedCount = unreviewedCount


  return (
    <div className="app-shell">
      {/* Sidebar */}
      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        id="sidebar-nav"
        aria-label="Study sets and navigation"
        className={`sidebar ${mobileNavOpen ? 'mobile-nav-open' : ''}`}
      >
        <div className="brand">
          <button
            type="button"
            className="brand-logo-btn"
            onClick={() => {
              setCurrentView('workspace')
              setMobileNavOpen(false)
            }}
            title="ScribeFlow Home"
          >
            <span className="brand-mark"><Sparkles size={18} /></span>
            <span>Scribe<span>Flow</span></span>
          </button>
          <button
            type="button"
            className="mobile-drawer-close"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="side-label">WORKSPACE</div>
        <button
          className={`nav-item ${currentView === 'workspace' && active ? 'selected' : ''}`}
          onClick={() => { handleNavigateToLibrary(); setMobileNavOpen(false) }}
        >
          <Layers3 size={17} /> My Library <span className="count">{sets.length}</span>
        </button>
        <button
          className={`nav-item ${currentView === 'how-it-works' ? 'selected' : ''}`}
          onClick={() => { setCurrentView('how-it-works'); setMobileNavOpen(false) }}
          style={{ marginTop: 4 }}
        >
          <HelpCircle size={17} /> How It Works
        </button>

        <div className="side-label recent-label">YOUR STUDY SETS</div>
        <div className="sidebar-search-box">
          <Search size={14} className="sidebar-search-icon" />
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search study sets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="set-list">
          {!user ? (
            <div className="no-sets-found" style={{ textAlign: 'center', padding: '20px 10px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                Sign in to view and search your saved study sets.
              </p>
              <button
                type="button"
                className="nav-sign-in-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setAuthModalMode('signin')
                  setAuthRedirectReason('Sign in to view your saved study sets')
                  setAuthModalOpen(true)
                }}
              >
                <LogIn size={14} /> Sign In
              </button>
            </div>
          ) : filteredSets.length === 0 ? (
            <div className="no-sets-found">
              {searchQuery ? `No sets matching "${searchQuery}"` : 'No study sets yet'}
            </div>
          ) : (
            filteredSets.map((item, i) => {
              const isSelected = currentView === 'workspace' && ((active?.id && item.id && active.id === item.id) || active?.title === item.title)
              return (
                <div
                  key={`${item.id ?? item.title}-${i}`}
                  className={`set-item-wrapper ${isSelected ? 'active' : ''}`}
                >
                  <button
                    className="set-link"
                    onClick={() => {
                      localStorage.setItem('scribeflow_active_set_id', String(item.id ?? item.offlineKey ?? item.title))
                      setActive(item)
                      setCurrentView('workspace')
                      setMobileNavOpen(false)
                      setError('')
                      setNotice('')
                    }}
                    title={item.title}
                  >
                    <span className="set-dot" />
                    <span className="set-title-text">{item.title}</span>
                    {item.isOfflineOnly ? (
                      <span className="set-pill set-pill-offline" title="Stored only in this browser's IndexedDB">Offline</span>
                    ) : item.hasOfflineCopy ? (
                      <span className="set-pill set-pill-saved" title="Offline copy saved in browser">Saved</span>
                    ) : null}
                  </button>
                  <div className="set-item-actions">
                    <button
                      type="button"
                      className="set-action-btn set-rename-btn"
                      onClick={e => {
                        e.stopPropagation()
                        openRenameModal(item)
                      }}
                      title={`Rename "${item.title}"`}
                      aria-label={`Rename "${item.title}"`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="set-action-btn set-delete-btn"
                      onClick={e => {
                        e.stopPropagation()
                        void handleDelete(item)
                      }}
                      title={`Delete "${item.title}"`}
                      aria-label={`Delete "${item.title}"`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <button
          className="new-set"
          onClick={() => {
            requireAuth(() => {
              localStorage.setItem('scribeflow_active_set_id', '__new__')
              setActive(null)
              setCurrentView('workspace')
              setMobileNavOpen(false)
              setError('')
              setNotice('')
            }, 'Please sign in to create new study sets.')
          }}
        >
          <Plus size={16} /> New Study Set
        </button>

        <div className="sidebar-bottom">
          <div className={`connection ${online ? '' : 'offline'}`}>
            <span className="status-dot" />
            {online ? 'Online connection' : 'Offline mode'}
          </div>
          <p>
            {online
              ? 'Connected to API & AI models. Saved sets are backed up.'
              : 'Working offline. Saved study sets remain fully accessible in browser storage.'}
          </p>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileNavOpen}
            aria-controls="sidebar-nav"
            onClick={() => setMobileNavOpen(open => !open)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumb">
            {currentView === 'how-it-works' ? (
              <>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit',
                  }}
                  onClick={() => setCurrentView('workspace')}
                >
                  Workspace
                </button>{' '}
                <span>/</span> <b>How It Works</b>
              </>
            ) : !user ? (
              <>
                ScribeFlow <span>/</span> <b>Welcome</b>
              </>
            ) : (
              <>
                Workspace <span>/</span> <b>{active?.title ?? 'New Study Set'}</b>
              </>
            )}
          </div>
          <div className="top-actions">
            <button
              type="button"
              className={`how-nav-toggle-btn ${currentView === 'how-it-works' ? 'active' : ''}`}
              onClick={() => setCurrentView(currentView === 'how-it-works' ? 'workspace' : 'how-it-works')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
                background: currentView === 'how-it-works' ? '#1e293b' : '#ffffff',
                color: currentView === 'how-it-works' ? '#ffffff' : '#334155',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
              }}
            >
              <HelpCircle size={14} />
              {currentView === 'how-it-works' ? 'Back to Library' : 'How It Works'}
            </button>
            <span className={`network-pill ${online ? '' : 'offline'}`}>
              {online ? <Network size={14} /> : <WifiOff size={14} />}
              {online ? 'Online' : 'Offline (IndexedDB)'}
            </span>
            {user ? (
              <div className="user-badge-container">
                <div className="user-avatar" title={user.email}>
                  {(user.fullName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="user-info-text">
                  <span className="user-display-name">{user.fullName || user.email.split('@')[0]}</span>
                  <span className="user-email-sub">{user.email}</span>
                </div>
                <button
                  type="button"
                  className="sign-out-btn"
                  onClick={handleSignOut}
                  title="Sign out of ScribeFlow"
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="topbar-sign-in-btn"
                onClick={() => {
                  setAuthRedirectReason('Sign in to access your study library and create study materials.')
                  setAuthModalOpen(true)
                }}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {currentView === 'how-it-works' ? (
            <HowItWorks
              onGetStarted={() => {
                if (!user) {
                  requireAuth(() => {
                    setCurrentView('workspace')
                    setActive(null)
                  }, 'Sign in or create an account to start creating study sets.')
                } else {
                  setCurrentView('workspace')
                  setActive(null)
                }
              }}
            />
          ) : !user ? (
            /* Signed-out visitor: Public Landing View */
            <div className="public-landing-view">
              <section className="landing-hero-card">
                <div className="landing-badge">
                  <Sparkles size={14} />
                  <span>AI Lecture Companion</span>
                </div>
                <h1 className="landing-title">
                  Turn messy lectures into <span>brilliant study sets</span>.
                </h1>
                <p className="landing-lead">
                  Upload audio, video, YouTube lectures, or transcripts. ScribeFlow automatically organizes notes, extracts active-recall flashcards, and helps you study efficiently.
                </p>
                <div className="landing-cta-row">
                  <button
                    type="button"
                    className="landing-primary-btn"
                    onClick={() => {
                      setAuthModalMode('signup')
                      setAuthRedirectReason('Create a free account to generate personalized study sets.')
                      setAuthModalOpen(true)
                    }}
                  >
                    <span>Get Started Free</span>
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="landing-secondary-btn"
                    onClick={() => {
                      setAuthModalMode('signin')
                      setAuthRedirectReason('Welcome back! Sign in to access your saved study library.')
                      setAuthModalOpen(true)
                    }}
                  >
                    <LogIn size={16} />
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    className="landing-outline-btn"
                    onClick={() => setCurrentView('how-it-works')}
                  >
                    <HelpCircle size={16} />
                    <span>See How It Works</span>
                  </button>
                </div>
              </section>

              <div className="landing-features-grid">
                <div className="landing-feature-card">
                  <div className="feature-icon-box" style={{ background: '#fef3c7', color: '#b45309' }}>
                    <BookOpen size={22} />
                  </div>
                  <h3>Smart Study Notes</h3>
                  <p>Comprehensive structured summaries, definitions, and lecture concepts formatted with clear headings and key takeaways.</p>
                </div>
                <div className="landing-feature-card">
                  <div className="feature-icon-box" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <Layers3 size={22} />
                  </div>
                  <h3>Active Recall Flashcards</h3>
                  <p>Auto-generated flashcards with Leitner spaced-repetition ratings: Mastered, Review, or Challenging.</p>
                </div>
                <div className="landing-feature-card">
                  <div className="feature-icon-box" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                    <Video size={22} />
                  </div>
                  <h3>Multi-Format Input</h3>
                  <p>Direct support for MP3/WAV audio, MP4/MKV video lecture recordings, and YouTube captions import.</p>
                </div>
                <div className="landing-feature-card">
                  <div className="feature-icon-box" style={{ background: '#dcfce7', color: '#15803d' }}>
                    <HardDrive size={22} />
                  </div>
                  <h3>Offline & Private</h3>
                  <p>Save study materials locally with IndexedDB to study on the train or flight without network access.</p>
                </div>
              </div>

              <div className="landing-preview-banner">
                <span className="preview-badge">Ready to ace your next exam?</span>
                <h3>Join ScribeFlow today</h3>
                <p>Sign in with your email or Google account to unlock your personal lecture workspace.</p>
                <button
                  type="button"
                  className="landing-primary-btn"
                  style={{ padding: '12px 28px', fontSize: 15, margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  onClick={() => {
                    setAuthModalMode('signup')
                    setAuthRedirectReason('Create your free account to start studying.')
                    setAuthModalOpen(true)
                  }}
                >
                  <Sparkles size={16} />
                  <span>Create Free Account</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="error-message" style={{ marginBottom: 18 }}>
                  {error}
                </div>
              )}
              {notice && (
                <div className="notice-bar" style={{
                  marginBottom: 18, padding: '10px 14px', borderRadius: 8, background: '#eef8f2', color: '#166534',
                  border: '1px solid #bbf7d0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                    <span>{notice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotice('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', opacity: 0.7 }}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {!online && (
                <div style={{
                  background: '#fff8f0', border: '1px solid #fae4cd', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: '#874d1a'
                }}>
                  <WifiOff size={16} />
                  <span>
                    <strong>Offline Mode Active:</strong> You can read, review, and quiz with previously saved study sets. Processing new audio or transcripts requires reconnecting to the ScribeFlow server.
                  </span>
                </div>
              )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">AI-ASSISTED STUDY WORKSPACE</div>
              <h1>Study smarter<span>.</span></h1>
              <p>Turn lecture recordings and transcripts into handwritten-style study sheets, topic insights, and flashcards.</p>
            </div>
            <div className="heading-icon">
              <BookOpen size={24} />
            </div>
          </div>

          {!active ? (
            /* Composer view */
            <section className="composer card">
              <div className="section-title">
                <div className="icon-tile lavender"><FileAudio2 size={19} /></div>
                <div>
                  <h2>Create New Study Set</h2>
                  <p>Provide lecture content via transcript text, uploaded audio, or live dictation.</p>
                </div>
              </div>

              {/* Mode Tabs */}
              <div style={{
                display: 'flex', gap: 8, borderBottom: '1px solid #edece6', paddingBottom: 14, marginBottom: 18, flexWrap: 'wrap'
              }}>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  style={{
                    padding: '7px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: inputMode === 'paste' ? '1px solid #7d64c7' : '1px solid #e2e2da',
                    background: inputMode === 'paste' ? '#f3f0fc' : '#fff',
                    color: inputMode === 'paste' ? '#6c53b8' : '#666',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Sparkles size={14} /> Paste Transcript
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('audio')}
                  style={{
                    padding: '7px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: inputMode === 'audio' ? '1px solid #7d64c7' : '1px solid #e2e2da',
                    background: inputMode === 'audio' ? '#f3f0fc' : '#fff',
                    color: inputMode === 'audio' ? '#6c53b8' : '#666',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Upload size={14} /> Upload Audio
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('video')}
                  style={{
                    padding: '7px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: inputMode === 'video' ? '1px solid #7d64c7' : '1px solid #e2e2da',
                    background: inputMode === 'video' ? '#f3f0fc' : '#fff',
                    color: inputMode === 'video' ? '#6c53b8' : '#666',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Video size={14} /> Upload Video
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('youtube')}
                  style={{
                    padding: '7px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: inputMode === 'youtube' ? '1px solid #7d64c7' : '1px solid #e2e2da',
                    background: inputMode === 'youtube' ? '#f3f0fc' : '#fff',
                    color: inputMode === 'youtube' ? '#6c53b8' : '#666',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Youtube size={14} /> Import YouTube Captions
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('mic')}
                  style={{
                    padding: '7px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: inputMode === 'mic' ? '1px solid #7d64c7' : '1px solid #e2e2da',
                    background: inputMode === 'mic' ? '#f3f0fc' : '#fff',
                    color: inputMode === 'mic' ? '#6c53b8' : '#666',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Mic size={14} /> Dictate with Mic
                </button>
              </div>

              {/* Title Input */}
              <label className="field-label" htmlFor="title">Study Set Title</label>
              <input
                id="title"
                className="text-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Acid-Base Equilibrium & Conjugate Pairs"
              />

              {/* Exam Depth / Target Marks Selector */}
              <div style={{ marginTop: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>EXAM ANSWER DEPTH / TARGET MARKS</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>— Scales answer detail and analytical depth</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 8 }}>
                  {[
                    { val: 2, label: '2 Marks', desc: 'Core definition & key premise' },
                    { val: 3, label: '3 Marks', desc: 'Concept + rule / quote' },
                    { val: 5, label: '5 Marks', desc: 'Structured analysis & evidence' },
                    { val: 8, label: '8 Marks', desc: 'Comprehensive essay response' },
                  ].map(item => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setMarks(item.val)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 7,
                        border: marks === item.val ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                        background: marks === item.val ? '#f5f3ff' : '#ffffff',
                        color: marks === item.val ? '#6d28d9' : '#374151',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</div>
                      <div style={{ fontSize: 10, color: marks === item.val ? '#7c3aed' : '#9ca3af', marginTop: 2 }}>{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject / Topic Classification & Review */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      SUBJECT CLASSIFICATION & REVIEW
                    </div>
                    {predictedInfo ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: 20,
                          background: predictedInfo.isUncertain ? '#fef3c7' : '#e0e7ff',
                          color: predictedInfo.isUncertain ? '#92400e' : '#3730a3',
                        }}>
                          {predictedInfo.isUncertain ? '⚠️ Uncertain' : '🎯 Predicted'}: {predictedInfo.topic}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          ({(predictedInfo.confidence * 100).toFixed(1)}% confidence)
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Auto-detects as you type or upload. You can review or override below:
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Subject:</label>
                    <select
                      value={selectedTopic || (predictedInfo?.topic && predictedInfo.topic !== 'Unknown / choose a subject' ? predictedInfo.topic : '')}
                      onChange={e => setSelectedTopic(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        background: '#ffffff',
                        color: '#1e293b',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">Auto-Detect from Transcript</option>
                      {supportedTopics.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {predictedInfo?.isUncertain && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '6px 10px', borderRadius: 5 }}>
                    <strong>Note:</strong> The classifier is uncertain about this subject. Please choose the correct subject above before generating study sheets.
                  </div>
                )}
              </div>

              {/* Input Mode 1 */}
              {inputMode === 'paste' && (
                <>
                  <label className="field-label transcript-label" htmlFor="transcript">
                    Lecture Transcript <span>Required for processing</span>
                  </label>
                  <textarea
                    id="transcript"
                    className="transcript-input"
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="Paste lecture notes or transcript text here (minimum 20 characters)..."
                  />
                  <div className="composer-footer">
                    <span>{wordCount} words entered</span>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void createStudySetFromText()}
                      disabled={busy}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      {busy ? 'Processing Transcript...' : 'Generate Handwritten Study Cards'}
                    </button>
                  </div>
                </>
              )}

              {/* Input Mode 2 */}
              {inputMode === 'audio' && (
                <div style={{ marginTop: 18 }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed #d5d0e8', borderRadius: 9, padding: '28px 20px',
                      textAlign: 'center', background: '#faf9fd', cursor: 'pointer',
                    }}
                  >
                    <input
                      id="audio-file-input"
                      data-testid="audio-file-input"
                      ref={fileInputRef}
                      type="file"
                      accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,.aac,audio/*"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setAudioFile(file)
                          if (!title.trim() || title === 'Lecture Notes') {
                            setTitle(file.name.replace(/\.[^/.]+$/, ''))
                          }
                        }
                      }}
                    />
                    <Upload size={32} style={{ color: '#8873c9', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3c3a44' }}>
                      {audioFile ? audioFile.name : 'Click or drop lecture audio file here'}
                    </div>
                    <div style={{ fontSize: 11, color: '#8d8d85', marginTop: 4 }}>
                      Supported formats: WAV, MP3, M4A, OGG, WEBM, FLAC (Max 100 MB)
                    </div>
                  </div>

                  {audioFile && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px', background: '#f3f0fc', borderRadius: 7,
                      fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span>Selected: <strong>{audioFile.name}</strong> ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      <button
                        type="button"
                        onClick={() => setAudioFile(null)}
                        style={{ border: 0, background: 'none', color: '#a03b3b', cursor: 'pointer', fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {transcribeStatus && transcribeStatus.is_available && (
                    <div style={{
                      marginTop: 14, padding: '10px 14px', background: '#f0fdf4',
                      border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 11, color: '#166534',
                      display: 'flex', gap: 8, alignItems: 'center'
                    }}>
                      <Check size={15} style={{ flexShrink: 0, color: '#16a34a' }} />
                      <div>
                        <strong>Active Provider:</strong> {transcribeStatus.provider_name} — <em>{transcribeStatus.message}</em>
                      </div>
                    </div>
                  )}

                  {transcribeStatus && !transcribeStatus.is_available && (
                    <div style={{
                      marginTop: 14, padding: '10px 14px', background: '#fff9ed',
                      border: '1px solid #f6e2b8', borderRadius: 7, fontSize: 11, color: '#8a5c10',
                      display: 'flex', gap: 8, alignItems: 'flex-start'
                    }}>
                      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <strong>Provider Notice:</strong> {transcribeStatus.message}
                        <div style={{ marginTop: 4 }}>
                          You can switch to <em>"Paste Transcript"</em> to use the system immediately without external keys.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="composer-footer" style={{ marginTop: 18 }}>
                    <button
                      type="button"
                      className="save-button"
                      onClick={() => void handleAudioUpload(false)}
                      disabled={busy || !audioFile}
                    >
                      {busy ? <LoaderCircle className="spin" size={15} /> : <FileAudio2 size={15} />}
                      Transcribe to Text First
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleAudioUpload(true)}
                      disabled={busy || !audioFile}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      {busy ? 'Transcribing & Generating...' : 'Transcribe & Create Study Set'}
                    </button>
                  </div>
                </div>
              )}

              {/* Input Mode 3: Video File Upload */}
              {inputMode === 'video' && (
                <div style={{ marginTop: 18 }}>
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    style={{
                      border: '2px dashed #d5d0e8', borderRadius: 9, padding: '28px 20px',
                      textAlign: 'center', background: '#faf9fd', cursor: 'pointer',
                    }}
                  >
                    <input
                      id="video-file-input"
                      data-testid="video-file-input"
                      ref={videoInputRef}
                      type="file"
                      accept=".mp4,.mov,.webm,.mkv,.avi,video/*"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setVideoFile(file)
                          if (!title.trim() || title === 'Lecture Notes') {
                            setTitle(file.name.replace(/\.[^/.]+$/, ''))
                          }
                        }
                      }}
                    />
                    <Video size={34} style={{ color: '#8873c9', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3c3a44' }}>
                      {videoFile ? videoFile.name : 'Click or drop lecture video file here'}
                    </div>
                    <div style={{ fontSize: 11, color: '#8d8d85', marginTop: 4 }}>
                      Supported formats: MP4, MOV, WEBM, MKV, AVI • Max 200 MB • Up to 120 mins
                    </div>
                  </div>

                  {videoFile && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px', background: '#f3f0fc', borderRadius: 7,
                      fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span>Selected: <strong>{videoFile.name}</strong> ({(videoFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      <button
                        type="button"
                        onClick={() => setVideoFile(null)}
                        style={{ border: 0, background: 'none', color: '#a03b3b', cursor: 'pointer', fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Temporary Processing & Privacy Notice */}
                  <div style={{
                    marginTop: 14, padding: '10px 14px', background: '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 11, color: '#475569',
                    display: 'flex', gap: 8, alignItems: 'flex-start'
                  }}>
                    <Clock size={15} style={{ flexShrink: 0, marginTop: 1, color: '#64748b' }} />
                    <div>
                      <strong>Video Processing:</strong> ScribeFlow extracts the audio track using FFmpeg and sends only the speech audio to the backend transcription provider. Raw video files are deleted immediately after audio extraction and are never stored permanently.
                    </div>
                  </div>

                  {videoProgressText && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px', background: '#eff6ff',
                      border: '1px solid #bfdbfe', borderRadius: 7, fontSize: 12, color: '#1e40af',
                      display: 'flex', gap: 8, alignItems: 'center'
                    }}>
                      <LoaderCircle className="spin" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
                      <span>{videoProgressText}</span>
                    </div>
                  )}

                  <div className="composer-footer" style={{ marginTop: 18 }}>
                    <button
                      type="button"
                      className="save-button"
                      onClick={() => void handleVideoUpload(false)}
                      disabled={busy || !videoFile}
                    >
                      {busy ? <LoaderCircle className="spin" size={15} /> : <FileAudio2 size={15} />}
                      Transcribe to Text First
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleVideoUpload(true)}
                      disabled={busy || !videoFile}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      {busy ? 'Processing Video...' : 'Transcribe & Create Study Set'}
                    </button>
                  </div>
                </div>
              )}

              {/* Input Mode 4: YouTube Captions Import */}
              {inputMode === 'youtube' && (
                <div style={{ marginTop: 18 }}>
                  <label className="field-label" htmlFor="youtube-url">YouTube Video URL</label>
                  <input
                    id="youtube-url"
                    className="text-input"
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                    style={{ marginBottom: 12 }}
                  />

                  {/* Compliance & Policy Explanation Banner */}
                  <div style={{
                    padding: '12px 14px', background: '#fefce8',
                    border: '1px solid #fef08a', borderRadius: 8, fontSize: 11, color: '#854d0e',
                    lineHeight: 1.5, marginBottom: 14
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertCircle size={14} style={{ color: '#ca8a04' }} />
                      YouTube API Compliance & Owner Authorization Notice
                    </div>
                    <div>
                      Under Google's official YouTube Data API v3 policies, caption tracks can only be downloaded via API for videos owned or managed by your authenticated Google/YouTube account (scope: <code>https://www.googleapis.com/auth/youtube.force-ssl</code>). Third-party videos cannot be downloaded via API without owner authorization. ScribeFlow strictly complies with YouTube Terms of Service and does not use scrapers or stream rippers.
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 600 }}>
                      Quick Alternative: Open the video on YouTube, click <strong>"… More" → "Show transcript"</strong>, copy the text, and paste it into ScribeFlow's <em>"Paste Transcript"</em> tab.
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="field-label" htmlFor="youtube-token" style={{ fontSize: 11, color: '#666' }}>
                      Optional: Video Owner Google OAuth Access Token
                    </label>
                    <input
                      id="youtube-token"
                      type="password"
                      className="text-input"
                      value={youtubeAccessToken}
                      onChange={e => setYoutubeAccessToken(e.target.value)}
                      placeholder="Paste your OAuth access token if you own this channel"
                      style={{ fontSize: 11 }}
                    />
                  </div>

                  <div className="composer-footer" style={{ marginTop: 18 }}>
                    <button
                      type="button"
                      className="save-button"
                      onClick={() => setInputMode('paste')}
                    >
                      <Sparkles size={15} />
                      Switch to Paste Transcript
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleYouTubeImport(true)}
                      disabled={busy || !youtubeUrl.trim()}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Youtube size={16} />}
                      {busy ? 'Importing Captions...' : 'Import Captions & Create Study Set'}
                    </button>
                  </div>
                </div>
              )}

              {/* Input Mode 3 */}
              {inputMode === 'mic' && (
                <div style={{ marginTop: 18 }}>
                  <div style={{
                    padding: '20px', borderRadius: 9, background: isRecording ? '#fdf4f4' : '#faf9f6',
                    border: isRecording ? '1px solid #f1c7c7' : '1px solid #e9e8e2', textAlign: 'center'
                  }}>
                    <button
                      type="button"
                      onClick={toggleMicrophoneDictation}
                      style={{
                        width: 58, height: 58, borderRadius: '50%', border: 0, margin: '0 auto 12px',
                        background: isRecording ? '#dc4a4a' : '#7f66c9', color: '#fff',
                        display: 'grid', placeItems: 'center', cursor: 'pointer',
                        boxShadow: isRecording ? '0 0 0 6px #f7dede' : '0 3px 10px rgba(127,102,201,0.25)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>

                    <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                      {isRecording ? 'Listening... Speak into your microphone' : 'Click microphone to start dictating'}
                    </div>

                    <p style={{ fontSize: 11, color: '#888', maxWidth: 460, margin: '6px auto 0' }}>
                      Uses browser speech recognition. Requires microphone permissions. Speech streams directly into the transcript box below.
                    </p>
                  </div>

                  <label className="field-label transcript-label" htmlFor="mic-transcript" style={{ marginTop: 16 }}>
                    Live Transcript Preview <span>Editable</span>
                  </label>
                  <textarea
                    id="mic-transcript"
                    className="transcript-input"
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="Dictated text will stream here..."
                    style={{ height: 130 }}
                  />

                  <div className="composer-footer">
                    <span>{wordCount} words dictated</span>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void createStudySetFromText()}
                      disabled={busy || wordCount < 4}
                    >
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      Generate Handwritten Study Cards
                    </button>
                  </div>
                </div>
              )}

              <div className="privacy-note">
                <Cloud size={15} /> All processing runs through your local ScribeFlow API. API keys stay securely on the backend.
              </div>
            </section>
          ) : (
            /* Study Set Result Viewer */
            <>
              <section className="result-banner card">
                <div className="result-main">
                  <div className="icon-tile mint"><BookOpen size={19} /></div>
                  <div>
                    <div className="result-kicker">STUDY SET</div>
                    <div className="result-title-row">
                      <h2>{active.title}</h2>
                      <button
                        type="button"
                        className="title-rename-trigger"
                        onClick={() => openRenameModal(active)}
                        title={`Rename "${active.title}"`}
                        aria-label={`Rename "${active.title}"`}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                    <div className="meta-line" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span
                          className="topic-tag"
                          style={{
                            background: active.topic.includes('Unknown') ? '#fffbeb' : undefined,
                            color: active.topic.includes('Unknown') ? '#b45309' : undefined,
                            border: active.topic.includes('Unknown') ? '1px dashed #f59e0b' : undefined,
                          }}
                        >
                          {active.topic}
                        </span>
                        <select
                          value={active.topic}
                          onChange={e => void handleUpdateTopic(e.target.value)}
                          style={{
                            fontSize: 11,
                            padding: '1px 5px',
                            borderRadius: 4,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                          title="Review & change subject"
                        >
                          {supportedTopics.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      {active.marks && (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          🎯 {active.marks} Marks Target
                        </span>
                      )}
                      {active.generator_used && (
                        <span style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          ✨ {active.generator_used}
                        </span>
                      )}
                      <span>•</span>
                      {active.isOfflineOnly ? (
                        <span className="storage-badge storage-badge-offline-only" title="Stored only in this browser's IndexedDB">
                          <HardDrive size={11} /> Offline Only
                        </span>
                      ) : (isSavedOffline || active.hasOfflineCopy) ? (
                        <span className="storage-badge storage-badge-saved" title="Offline copy saved in browser IndexedDB">
                          <Check size={11} /> Saved Offline
                        </span>
                      ) : (
                        <span className="storage-badge storage-badge-server" title="Stored in online server library">
                          <Cloud size={11} /> Server Library
                        </span>
                      )}
                      <span>•</span>
                      <span>{active.flashcards.length} handwritten study sheets</span>
                      <span>•</span>
                      <span>{active.transcript.split(/\s+/).length} words</span>
                      {active.source_name && (
                        <>
                          <span>•</span>
                          <span>Source: {active.source_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="rename-button"
                    onClick={() => openRenameModal(active)}
                    title={`Rename "${active.title}"`}
                    aria-label={`Rename "${active.title}"`}
                  >
                    <Pencil size={14} />
                    <span>Rename</span>
                  </button>

                  {/* Offline copy / Save offline controls */}
                  {active.isOfflineOnly ? (
                    <span
                      className="offline-only-chip"
                      title="This study set is stored only in this browser's IndexedDB"
                      aria-label="Offline-only study set"
                    >
                      <HardDrive size={13} />
                      <span>Offline Only</span>
                    </span>
                  ) : (isSavedOffline || active.hasOfflineCopy) ? (
                    <button
                      type="button"
                      className="remove-offline-button"
                      onClick={() => void handleRemoveOfflineCopy(active)}
                      title="Remove local offline copy from this browser's IndexedDB (server study set remains safe)"
                      aria-label={`Remove offline copy of "${active.title}"`}
                    >
                      <HardDrive size={14} />
                      <span>Remove Offline Copy</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="save-button"
                      onClick={() => void keepOffline()}
                      title="Save to browser IndexedDB for offline access"
                      aria-label={`Save "${active.title}" offline`}
                    >
                      <Download size={14} />
                      <span>Save Offline</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="delete-set-button"
                    onClick={() => void handleDelete(active)}
                    title={active.isOfflineOnly ? `Delete offline study set "${active.title}"` : `Delete study set "${active.title}"`}
                    aria-label={`Delete study set "${active.title}"`}
                  >
                    <Trash2 size={14} />
                    <span>Delete Set</span>
                  </button>
                </div>
              </section>

              {/* Study Material Tabs */}
              <section className="study-card card">
                <div className="tabs" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {(['cards', 'notes', 'transcript'] as const).map(item => (
                      <button
                        key={item}
                        className={`tab ${tab === item ? 'current' : ''}`}
                        onClick={() => setTab(item)}
                      >
                        {item === 'cards' && `Handwritten Study Cards (${active.flashcards.length})`}
                        {item === 'notes' && 'Study Notes'}
                        {item === 'transcript' && 'Full Transcript'}
                      </button>
                    ))}
                  </div>

                  {tab === 'cards' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* View Mode Toggle: Interactive Study Mode vs Grid View */}
                      <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setStudyViewMode('interactive')
                            setShowSummary(false)
                          }}
                          style={{
                            background: studyViewMode === 'interactive' ? '#ffffff' : 'none',
                            border: studyViewMode === 'interactive' ? '1px solid #cbd5e1' : '1px solid transparent',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: studyViewMode === 'interactive' ? '#6d28d9' : '#64748b',
                            boxShadow: studyViewMode === 'interactive' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <GraduationCap size={14} /> Active Recall Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudyViewMode('grid')}
                          style={{
                            background: studyViewMode === 'grid' ? '#ffffff' : 'none',
                            border: studyViewMode === 'grid' ? '1px solid #cbd5e1' : '1px solid transparent',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: studyViewMode === 'grid' ? '#6d28d9' : '#64748b',
                            boxShadow: studyViewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Grid size={14} /> Sheet Grid View
                        </button>
                      </div>

                      {/* Regenerate AI Flashcards button */}
                      <button
                        type="button"
                        onClick={() => void handleRegenerateFlashcards()}
                        disabled={isRegenerating || !online || !active.id}
                        title="Regenerate fresh active-recall flashcards using Groq AI"
                        style={{
                          background: '#f5f3ff',
                          border: '1px solid #ddd6fe',
                          borderRadius: 8,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: isRegenerating || !online || !active.id ? 'not-allowed' : 'pointer',
                          color: '#6d28d9',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          opacity: isRegenerating || !online || !active.id ? 0.5 : 1,
                        }}
                      >
                        <RefreshCw size={12} className={isRegenerating ? 'spin' : ''} />
                        {isRegenerating ? 'Generating...' : 'Regenerate Cards'}
                      </button>

                      {studyViewMode === 'grid' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => setCardLayout('sheet')}
                            style={{
                              background: cardLayout === 'sheet' ? '#f3f0fc' : 'none',
                              border: cardLayout === 'sheet' ? '1px solid #dcd4f0' : '1px solid transparent',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              cursor: 'pointer',
                              color: cardLayout === 'sheet' ? '#6b51b8' : '#888',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Rows size={13} /> Full Sheet
                          </button>
                          <button
                            type="button"
                            onClick={() => setCardLayout('compact')}
                            style={{
                              background: cardLayout === 'compact' ? '#f3f0fc' : 'none',
                              border: cardLayout === 'compact' ? '1px solid #dcd4f0' : '1px solid transparent',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              cursor: 'pointer',
                              color: cardLayout === 'compact' ? '#6b51b8' : '#888',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Grid size={13} /> 2-Column
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="tab-content">
                  {/* Handwritten Study Cards (Active-Recall Interactive Mode & Grid) */}
                  {tab === 'cards' && (
                    <div>
                      {/* Active Recall Interactive Study Mode */}
                      {studyViewMode === 'interactive' ? (
                        <div>
                          {/* Study Mode Progress & Filter Header */}
                          <div className="study-mode-header-bar">
                            <div className="study-progress-info">
                              <div className="progress-text-row">
                                <span>
                                  {totalSessionCards === 0
                                    ? 'No cards in this filter'
                                    : studyCardIndex < totalSessionCards
                                    ? `Card ${studyCardIndex + 1} of ${totalSessionCards}`
                                    : 'All Cards Completed!'}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {restartFeedback && (
                                    <span className="restart-pill-toast" role="status" aria-live="polite">
                                      Session Reset
                                    </span>
                                  )}
                                  <span>{sessionProgressPercent}% Reviewed</span>
                                </span>
                              </div>
                              <div className="progress-track">
                                <div
                                  className="progress-fill"
                                  style={{
                                    width: `${sessionProgressPercent}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Filter by review status */}
                            <div className="study-filter-group">
                              <button
                                type="button"
                                className={`filter-btn ${studyFilter === 'all' ? 'active' : ''}`}
                                onClick={() => {
                                  setStudyFilter('all')
                                  setStudyCardIndex(0)
                                  setShowSummary(false)
                                }}
                              >
                                All ({totalCardsCount})
                              </button>
                              <button
                                type="button"
                                className={`filter-btn ${studyFilter === 'challenging' ? 'active' : ''}`}
                                onClick={() => {
                                  setStudyFilter('challenging')
                                  setStudyCardIndex(0)
                                  setShowSummary(false)
                                }}
                                style={challengingCount > 0 ? { borderColor: '#fca5a5', color: '#b91c1c' } : {}}
                              >
                                Challenging ({challengingCount})
                              </button>
                              <button
                                type="button"
                                className={`filter-btn ${studyFilter === 'unreviewed' ? 'active' : ''}`}
                                onClick={() => {
                                  setStudyFilter('unreviewed')
                                  setStudyCardIndex(0)
                                  setShowSummary(false)
                                }}
                              >
                                Unreviewed ({unreviewedCount})
                              </button>
                              <button
                                type="button"
                                className={`filter-btn ${restartFeedback ? 'restart-btn-feedback' : ''}`}
                                onClick={handleRestartSession}
                                title="Restart review session from 0%"
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                aria-label="Restart review session"
                              >
                                <RotateCcw size={13} /> {restartFeedback ? 'Restarted! (0%)' : 'Restart (0%)'}
                              </button>
                              <button
                                type="button"
                                className={`filter-btn ${showSummary ? 'active' : ''}`}
                                onClick={() => {
                                  setShowSummary(value => !value)
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                aria-expanded={showSummary}
                                aria-label="Toggle study session summary"
                              >
                                <BarChart3 size={13} /> Summary
                              </button>
                            </div>
                          </div>

                          {/* Render Summary First, or Empty Filter State, or Active Recall Card */}
                          {showSummary || (filteredCards.length > 0 && studyCardIndex >= filteredCards.length) ? (
                            /* End-of-Set Summary Card */
                            <div className="study-summary-card">
                              <div className="summary-hero-row">
                                <div
                                  className="summary-badge-icon"
                                  style={sessionReviewedCount === 0 ? { background: '#f1f5f9', color: '#64748b' } : {}}
                                >
                                  {sessionReviewedCount === 0 ? (
                                    <Clock size={30} />
                                  ) : sessionReviewedCount < totalSessionCards ? (
                                    <BarChart3 size={30} />
                                  ) : (
                                    <Award size={30} />
                                  )}
                                </div>
                                <div className="summary-title-col">
                                  <h2>
                                    {totalSessionCards === 0
                                      ? 'Summary: Filter Empty'
                                      : sessionReviewedCount === 0
                                      ? 'Current Session Overview (Not Started)'
                                      : sessionReviewedCount < totalSessionCards
                                      ? 'Current Session In Progress'
                                      : 'Current Session Completed'}
                                  </h2>
                                  <p>
                                    {totalSessionCards === 0
                                      ? `The current filter "${studyFilter}" has 0 cards. Select "All (${totalCardsCount})" to study all cards.`
                                      : `This session: ${sessionReviewedCount} of ${totalSessionCards} cards reviewed in ${active.title} (${active.topic}).`}
                                  </p>
                                </div>
                              </div>

                              {/* Stat Tiles with consistent denominators strictly from this session */}
                              <div className="summary-stats-grid">
                                <div className="stat-tile">
                                  <div className="stat-tile-val">{totalSessionCards}</div>
                                  <div className="stat-tile-lbl">Cards in This Session</div>
                                </div>
                                <div className="stat-tile">
                                  <div className="stat-tile-val" style={{ color: '#059669' }}>
                                    {sessionReviewedCount} / {totalSessionCards}
                                  </div>
                                  <div className="stat-tile-lbl">
                                    Reviewed ({sessionProgressPercent}%)
                                  </div>
                                </div>
                                <div className="stat-tile">
                                  <div className="stat-tile-val" style={{ color: '#2563eb' }}>
                                    {sessionMasteredCount} / {totalSessionCards}
                                  </div>
                                  <div className="stat-tile-lbl">
                                    Mastered ({sessionMasteredPct}%)
                                  </div>
                                </div>
                                <div className="stat-tile">
                                  <div className="stat-tile-val" style={{ color: sessionChallengingCount > 0 ? '#dc2626' : '#64748b' }}>
                                    {sessionChallengingCount} / {totalSessionCards}
                                  </div>
                                  <div className="stat-tile-lbl">
                                    Challenging ({sessionChallengingPct}%)
                                  </div>
                                </div>
                              </div>

                              {/* Difficulty & Topic Breakdowns */}
                              <div className="breakdown-row">
                                {/* Difficulty Breakdown */}
                                <div className="breakdown-box">
                                  <h4>Difficulty Breakdown</h4>
                                  <div className="breakdown-list">
                                    {(['Easy', 'Medium', 'Advanced'] as const).map(d => {
                                      const count = activeCards.filter(c => (c.difficulty || 'Medium') === d).length
                                      const pct = totalCardsCount > 0 ? Math.round((count / totalCardsCount) * 100) : 0
                                      const colorClass =
                                        d === 'Easy' ? 'diff-easy' : d === 'Advanced' ? 'diff-advanced' : 'diff-medium'
                                      return (
                                        <div key={d} className="breakdown-item">
                                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className={`difficulty-pill ${colorClass}`}>{d}</span>
                                          </span>
                                          <span className="breakdown-count">
                                            {count} of {totalCardsCount} cards ({pct}%)
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>

                                {/* Topic & Subtopic Breakdown */}
                                <div className="breakdown-box">
                                  <h4>Topic Breakdown</h4>
                                  <div className="breakdown-list">
                                    {Object.entries(
                                      activeCards.reduce((acc, c) => {
                                        const t = c.topic || active.topic || 'General'
                                        acc[t] = (acc[t] || 0) + 1
                                        return acc
                                      }, {} as Record<string, number>)
                                    ).map(([topName, count]) => {
                                      const pct = totalCardsCount > 0 ? Math.round((count / totalCardsCount) * 100) : 0
                                      return (
                                        <div key={topName} className="breakdown-item">
                                          <span title={topName}>{topName}</span>
                                          <span className="breakdown-count">
                                            {count} of {totalCardsCount} cards ({pct}%)
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>

                              {/* Dedicated Lifetime / All-Time Library Status (All Previous Sessions) */}
                              <div className="breakdown-box" style={{ marginBottom: 20 }}>
                                <h4>All-Time Library Status (All Previous Sessions)</h4>
                                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px' }}>
                                  Lifetime statistics across all {totalCardsCount} cards in this study set, kept separate from current session progress:
                                </p>
                                <div className="breakdown-list">
                                  <div className="breakdown-item">
                                    <span>Historical Mastered (Rated Good/Easy)</span>
                                    <span className="breakdown-count" style={{ color: '#2563eb', fontWeight: 600 }}>
                                      {allTimeMasteredCount} of {totalCardsCount} cards ({totalCardsCount > 0 ? Math.round((allTimeMasteredCount / totalCardsCount) * 100) : 0}%)
                                    </span>
                                  </div>
                                  <div className="breakdown-item">
                                    <span>Historical Challenging (Rated Again/Hard)</span>
                                    <span className="breakdown-count" style={{ color: allTimeChallengingCount > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                      {allTimeChallengingCount} of {totalCardsCount} cards ({totalCardsCount > 0 ? Math.round((allTimeChallengingCount / totalCardsCount) * 100) : 0}%)
                                    </span>
                                  </div>
                                  <div className="breakdown-item">
                                    <span>Never Reviewed Yet</span>
                                    <span className="breakdown-count" style={{ color: '#64748b', fontWeight: 600 }}>
                                      {allTimeUnreviewedCount} of {totalCardsCount} cards ({totalCardsCount > 0 ? Math.round((allTimeUnreviewedCount / totalCardsCount) * 100) : 0}%)
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Challenging Cards in Current Session Section */}
                              {sessionReviewedCount === 0 ? (
                                <div
                                  style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 14,
                                    padding: '16px 20px',
                                    marginBottom: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    color: '#475569',
                                    fontSize: 13,
                                  }}
                                >
                                  <HelpCircle size={20} />
                                  <span>
                                    <strong>No cards rated in this session yet.</strong> Flip and rate cards during your session to track your active recall progress.
                                  </span>
                                </div>
                              ) : sessionChallengingCount > 0 ? (
                                <div className="challenging-section">
                                  <h3>
                                    <AlertCircle size={16} /> Challenging Cards in This Session ({sessionChallengingCount})
                                  </h3>
                                  <div className="challenging-cards-list">
                                    {sessionChallengingCards.map((card, i) => {
                                      const sessRating = sessionRatings[getCardKey(card)]
                                      return (
                                        <div key={i} className="challenging-card-item">
                                          <div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                                              <span className="card-seq-badge">#{card.seq_num || i + 1}</span>
                                              <span
                                                className={`difficulty-pill ${
                                                  card.difficulty === 'Easy'
                                                    ? 'diff-easy'
                                                    : card.difficulty === 'Advanced'
                                                    ? 'diff-advanced'
                                                    : 'diff-medium'
                                                }`}
                                              >
                                                {card.difficulty || 'Medium'}
                                              </span>
                                              <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                                                {sessRating === 1 ? 'Rated this session: Again' : 'Rated this session: Hard'}
                                              </span>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
                                              {card.question}
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            className="filter-btn"
                                            onClick={() => {
                                              const originalIdx = activeCards.indexOf(card)
                                              setStudyFilter('all')
                                              setStudyCardIndex(originalIdx >= 0 ? originalIdx : 0)
                                              setShowSummary(false)
                                            }}
                                            style={{ whiteSpace: 'nowrap' }}
                                          >
                                            Practice Card →
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: 14,
                                    padding: '16px 20px',
                                    marginBottom: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    color: '#15803d',
                                    fontSize: 13,
                                  }}
                                >
                                  <CheckCircle2 size={20} />
                                  <span>
                                    <strong>Excellent Recall!</strong> None of the cards reviewed in this session were marked as challenging.
                                  </span>
                                </div>
                              )}

                              {/* Summary Actions Bar */}
                              <div className="summary-actions-bar">
                                {sessionChallengingCount > 0 && (
                                  <button
                                    type="button"
                                    className="summary-action-btn btn-primary-summary"
                                    onClick={() => {
                                      setStudyFilter('challenging')
                                      setStudyCardIndex(0)
                                      setShowSummary(false)
                                    }}
                                  >
                                    <RotateCcw size={15} /> Review Challenging Cards ({sessionChallengingCount})
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="summary-action-btn btn-secondary-summary"
                                  onClick={handleRestartSession}
                                >
                                  <RotateCcw size={15} /> Review All from Beginning
                                </button>

                                <button
                                  type="button"
                                  className="summary-action-btn btn-secondary-summary"
                                  onClick={() => setStudyViewMode('grid')}
                                >
                                  <Grid size={15} /> View Sheet Grid
                                </button>
                              </div>
                            </div>
                          ) : filteredCards.length === 0 ? (
                            /* Render Empty State when Filter has 0 Cards and Summary is closed */
                            <div className="empty-filter-state card">
                              <div className={`empty-filter-icon ${studyFilter === 'challenging' ? 'green' : 'blue'}`}>
                                {studyFilter === 'challenging' ? <CheckCircle2 size={30} /> : <BookOpen size={30} />}
                              </div>
                              <h3>
                                {studyFilter === 'challenging'
                                  ? 'No challenging cards yet'
                                  : studyFilter === 'unreviewed'
                                  ? 'All cards reviewed'
                                  : 'No cards in this study set'}
                              </h3>
                              <p>
                                {studyFilter === 'challenging'
                                  ? 'None of the cards in this study set are currently rated as Challenging ("Again" or "Hard"). Rate cards during review to flag concepts that need extra practice.'
                                  : studyFilter === 'unreviewed'
                                  ? `You have already reviewed all ${totalCardsCount} cards in this study set. You can practice all cards again or review challenging ones.`
                                  : 'No flashcards available in this study set.'}
                              </p>
                              <button
                                type="button"
                                className="filter-return-btn"
                                onClick={() => {
                                  setStudyFilter('all')
                                  setStudyCardIndex(0)
                                  setShowSummary(false)
                                }}
                              >
                                ← Return to All Cards ({totalCardsCount})
                              </button>
                            </div>
                          ) : (
                            /* Active Recall Card in Study Mode */
                            (() => {
                              const currentCard = filteredCards[studyCardIndex]
                              if (!currentCard) return null
                              const currentKey = getCardKey(currentCard, studyCardIndex)
                              return (
                                <HandwrittenCard
                                  key={currentKey}
                                  card={currentCard}
                                  index={studyCardIndex}
                                  totalCards={filteredCards.length}
                                  isStudyMode={true}
                                  isRevealed={Boolean(revealedCardMap[currentKey])}
                                  onToggleReveal={(rev) =>
                                    setRevealedCardMap(prev => ({ ...prev, [currentKey]: rev }))
                                  }
                                  hasPrev={studyCardIndex > 0}
                                  hasNext={studyCardIndex < filteredCards.length - 1}
                                  onPrev={() => setStudyCardIndex(i => Math.max(0, i - 1))}
                                  onNext={() => setStudyCardIndex(i => i + 1)}
                                  onRate={rating => {
                                    void handleRateCard(currentCard, rating)
                                  }}
                                />
                              )
                            })()
                          )}
                        </div>
                      ) : filteredCards.length === 0 ? (
                        /* Sheet Grid View Empty State */
                        <div className="empty-filter-state card">
                          <div className={`empty-filter-icon ${studyFilter === 'challenging' ? 'green' : 'blue'}`}>
                            {studyFilter === 'challenging' ? <CheckCircle2 size={30} /> : <BookOpen size={30} />}
                          </div>
                          <h3>
                            {studyFilter === 'challenging'
                              ? 'No challenging cards yet'
                              : studyFilter === 'unreviewed'
                              ? 'All cards reviewed'
                              : 'No cards in this study set'}
                          </h3>
                          <p>
                            {studyFilter === 'challenging'
                              ? 'None of the cards in this study set are currently rated as Challenging ("Again" or "Hard"). Rate cards during review to flag concepts that need extra practice.'
                              : studyFilter === 'unreviewed'
                              ? `You have already reviewed all ${totalCardsCount} cards in this study set.`
                              : 'No flashcards available in this study set.'}
                          </p>
                          <button
                            type="button"
                            className="filter-return-btn"
                            onClick={() => {
                              setStudyFilter('all')
                              setStudyCardIndex(0)
                              setShowSummary(false)
                              setSessionReviewedKeys({})
                            }}
                          >
                            ← Return to All Cards ({totalCardsCount})
                          </button>
                        </div>
                      ) : (
                        /* Sheet Grid View */
                        <div
                          className="flashcards-container"
                          style={
                            cardLayout === 'compact'
                              ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24 }
                              : {}
                          }
                        >
                          {filteredCards.map((card, i) => {
                            const cardKey = getCardKey(card, i)
                            return (
                              <HandwrittenCard
                                key={cardKey}
                                card={card}
                                index={i}
                                totalCards={filteredCards.length}
                                isStudyMode={false}
                                isRevealed={Boolean(revealedCardMap[cardKey])}
                                onToggleReveal={(rev) =>
                                  setRevealedCardMap(prev => ({ ...prev, [cardKey]: rev }))
                                }
                                onRate={rating => {
                                  void handleRateCard(card, rating)
                                }}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comprehensive Study & Revision Notes */}
                  {tab === 'notes' && (
                    <>
                      <div className="content-kicker"><Sparkles size={15} /> COMPREHENSIVE STUDY & REVISION NOTES</div>
                      <MarkdownNotes content={active.notes} />
                    </>
                  )}

                  {/* Verbatim Transcript */}
                  {tab === 'transcript' && (
                    <div>
                      <div className="content-kicker"><FileAudio2 size={15} /> VERBATIM TRANSCRIPT</div>
                      <div className="transcript-view">{active.transcript}</div>
                    </div>
                  )}
                </div>
              </section>

              <div className="offline-hint">
                <HardDrive size={15} />
                <span>
                  This study set can be saved locally in IndexedDB so you can review handwritten notes and flashcards anytime without internet.
                </span>
              </div>
            </>
          )}
            </>
          )}

          <footer>Made for curious minds <span>✳</span> ScribeFlow</footer>
        </div>
      </main>

      {/* Rename Study Set Modal Dialog */}
      {deleteConfirmation && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => resolveDeleteConfirmation(false)}
        >
          <div
            className="modal-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-message"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-text">
                <h3 id="delete-confirm-title">{deleteConfirmation.title}</h3>
                <p id="delete-confirm-message">{deleteConfirmation.message}</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => resolveDeleteConfirmation(false)}
                aria-label="Close confirmation dialog"
              >
                ✕
              </button>
            </div>
            <div className="modal-footer">
              <button
                ref={cancelDeleteButtonRef}
                type="button"
                className="secondary-button"
                onClick={() => resolveDeleteConfirmation(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => resolveDeleteConfirmation(true)}
              >
                {deleteConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {renamingSet && (
        <div
          className="modal-backdrop"
          onClick={closeRenameModal}
          role="presentation"
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-text">
                <h3 id="rename-modal-title">Rename Study Set</h3>
                <p>Enter a new name for this study set.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeRenameModal}
                aria-label="Close dialog"
                title="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault()
                void handleSaveRename()
              }}
            >
              <div className="modal-body">
                <label htmlFor="rename-input" className="field-label">
                  Study Set Title
                </label>
                <input
                  id="rename-input"
                  ref={renameInputRef}
                  type="text"
                  className={`text-input ${renameError ? 'input-error' : ''}`}
                  value={renameTitle}
                  onChange={e => {
                    setRenameTitle(e.target.value)
                    if (renameError) setRenameError('')
                  }}
                  placeholder="e.g. Acid-Base Equilibrium"
                  aria-invalid={!!renameError}
                  aria-describedby={renameError ? 'rename-error-msg' : undefined}
                  disabled={renameSaving}
                  maxLength={200}
                />
                {renameError && (
                  <div id="rename-error-msg" className="modal-error-message" role="alert">
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    <span>{renameError}</span>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeRenameModal}
                  disabled={renameSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={renameSaving}
                >
                  {renameSaving ? (
                    <>
                      <LoaderCircle className="spin" size={15} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Authentication Modal */}
      {authModalOpen && (
        <AuthView
          initialMode={authModalMode}
          onCancel={() => setAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
          redirectMessage={authRedirectReason || undefined}
        />
      )}
    </div>
  )
}
