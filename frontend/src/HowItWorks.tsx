import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileAudio,
  HardDrive,
  Mic,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react'

const LOCAL_API_ORIGIN = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : ''
const API = (import.meta.env.VITE_API_URL || LOCAL_API_ORIGIN).replace(/\/$/, '')

interface Props {
  onGetStarted: () => void
}

interface ModelInfo {
  classes: string[]
  supported_subjects: string[]
  samples: number
  accuracy: number
  trained_at?: string
  confidence_threshold?: number
}

export default function HowItWorks({ onGetStarted }: Props) {
  const [activeStep, setActiveStep] = useState<number>(1)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

  useEffect(() => {
    let isCancelled = false
    fetch(`${API}/api/health`)
      .then(res => res.json())
      .then(data => {
        if (!isCancelled && data?.model) {
          setModelInfo(data.model)
        }
      })
      .catch(() => {})
    return () => {
      isCancelled = true
    }
  }, [])

  const subjectCount = modelInfo?.supported_subjects?.length || 11
  const sampleCount = modelInfo?.samples || 1182
  const accuracyPct = modelInfo?.accuracy ? (modelInfo.accuracy * 100).toFixed(1) : '83.1'

  return (
    <div className="how-it-works-page">
      {/* Hero Header */}
      <section className="how-hero">
        <h1 className="hero-main-title">
          Study smarter with active recall & structured notes
        </h1>
        <p className="hero-sub-title">
          Transform raw lecture transcripts and audio into handwritten-style study sheets, verified subject topics, and interactive flashcards.
        </p>

        {/* Top 3 Value Proposition Cards */}
        <div className="value-cards-grid">
          <div className="value-card">
            <h3>Find key concepts in seconds</h3>
            <p>
              Jump directly to definitions, formulas, and takeaways instead of sifting through pages of unstructured lecture notes.
            </p>
          </div>

          <div className="value-card">
            <h3>Retain more with active recall</h3>
            <p>
              Self-test your knowledge with GoodNotes-style cards and track memory retention with 4-level rating (Again, Hard, Good, Easy).
            </p>
          </div>

          <div className="value-card">
            <h3>100% offline-ready in browser</h3>
            <p>
              Save study sets directly to browser IndexedDB storage so you can study on commutes or flights without an internet connection.
            </p>
          </div>
        </div>
      </section>

      {/* 3-Step Walkthrough Section */}
      <section className="walkthrough-section">
        <div className="walkthrough-header">
          <h2>How ScribeFlow Works</h2>
          <p>
            From raw lecture recordings to structured study sheets and active-recall testing in three simple steps.
          </p>
        </div>

        <div className="walkthrough-steps-container">
          {/* Step 1 Card */}
          <div
            className={`step-column ${activeStep === 1 ? 'step-active' : ''}`}
            onClick={() => setActiveStep(1)}
          >
            <div className="step-mockup-box">
              <div className="mockup-header-row">
                <div className="mockup-title-flex">
                  <span className="box-icon">🎙️</span>
                  <strong>Input Lecture Material</strong>
                </div>
              </div>
              <div className="mockup-caption">
                Provide lecture content using the method most convenient for your study routine.
              </div>

              <div className="mockup-dropzone">
                <Upload size={28} className="dropzone-icon" />
                <div className="dropzone-main-text">3 flexible input options</div>
                <div className="dropzone-sub-text">Paste transcript • Audio file upload • Live mic</div>
                <div className="format-tags">
                  <span>MP3</span>
                  <span>WAV</span>
                  <span>M4A</span>
                  <span>WEBM</span>
                  <span>OGG</span>
                  <span>• Max 100 MB</span>
                </div>
              </div>
            </div>

            <div className="step-footer-info">
              <div className="step-badge-row">
                <span className="step-circle-badge">1</span>
                <h3>Provide lecture content</h3>
              </div>
              <p>
                Paste your verbatim transcript, upload an audio recording, or dictate live notes directly in your browser.
              </p>
            </div>
          </div>

          {/* Orange Chevron Connector 1 */}
          <div className="step-chevron-divider">
            <ChevronRight size={28} />
          </div>

          {/* Step 2 Card */}
          <div
            className={`step-column ${activeStep === 2 ? 'step-active' : ''}`}
            onClick={() => setActiveStep(2)}
          >
            <div className="step-mockup-box">
              <div className="mockup-header-row">
                <strong>AI Processing & Topic Detection</strong>
                <div className="mockup-actions-pill">
                  <span className="mini-btn-black">⚡ Whisper AI</span>
                  <span className="mini-btn-outline">{subjectCount} Subjects</span>
                </div>
              </div>

              <div className="mockup-lecture-list">
                <div className="lecture-item-row">
                  <div className="item-meta">
                    <FileAudio size={14} className="file-icon" />
                    <div>
                      <div className="item-name">Lecture Transcription</div>
                      <div className="item-size">Hosted Whisper cloud processing</div>
                    </div>
                  </div>
                  <div className="status-chips">
                    <span className="chip-green">✓ Ready</span>
                  </div>
                </div>

                <div className="lecture-item-row">
                  <div className="item-meta">
                    <Cpu size={14} className="file-icon" />
                    <div>
                      <div className="item-name">Subject Classifier</div>
                      <div className="item-size">{sampleCount} samples • {accuracyPct}% test accuracy</div>
                    </div>
                  </div>
                  <div className="status-chips">
                    <span className="chip-purple">Automatic + Manual</span>
                  </div>
                </div>

                <div className="lecture-item-row">
                  <div className="item-meta">
                    <Zap size={14} className="file-icon" />
                    <div>
                      <div className="item-name">Exam Depth Control</div>
                      <div className="item-size">Target depth: 1 to 5 marks</div>
                    </div>
                  </div>
                  <div className="status-chips">
                    <span className="chip-green">Customizable</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="step-footer-info">
              <div className="step-badge-row">
                <span className="step-circle-badge">2</span>
                <h3>Transcribe & classify topic</h3>
              </div>
              <p>
                Speech is transcribed with low-latency Whisper AI, and ScribeFlow's machine learning model detects the subject with confidence scoring.
              </p>
            </div>
          </div>

          {/* Orange Chevron Connector 2 */}
          <div className="step-chevron-divider">
            <ChevronRight size={28} />
          </div>

          {/* Step 3 Card */}
          <div
            className={`step-column ${activeStep === 3 ? 'step-active' : ''}`}
            onClick={() => setActiveStep(3)}
          >
            <div className="step-mockup-box">
              <div className="mockup-content-preview">
                <div className="preview-heading">Handwritten Card & Active Recall:</div>
                <ul className="preview-bullets">
                  <li>Color-coded formula and mechanism diagrams</li>
                  <li>Clear definitions with exam-focused takeaways</li>
                  <li>Teal rule-of-thumb comparison boxes</li>
                </ul>

                <div className="timestamp-callout">
                  Active recall self-rating:
                  <span className="timestamp-pill">Again • Hard • Good • Easy</span>
                </div>

                <div className="mockup-prompt-bar">
                  <div className="prompt-inner-box">
                    <span>IndexedDB offline backup with session progress</span>
                    <span className="send-arrow">✓</span>
                  </div>
                  <div className="prompt-disclaimer">Review anytime, anywhere with complete privacy</div>
                </div>
              </div>
            </div>

            <div className="step-footer-info">
              <div className="step-badge-row">
                <span className="step-circle-badge">3</span>
                <h3>Study & master the material</h3>
              </div>
              <p>
                Review comprehensive structured notes, practice flashcards with active-recall ratings, and focus on challenging cards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Features Showcase */}
      <section className="bottom-tools-section">
        <h2 className="tools-heading">Study Tools Built for Authentic Learning</h2>
        <p className="tools-sub">Everything you need to master your syllabus in one unified workspace.</p>

        <div className="tools-grid">
          <div className="tool-card">
            <div className="tool-icon-circle purple">
              <Sparkles size={20} />
            </div>
            <h4>GoodNotes-Style Study Sheets</h4>
            <p>
              Cards formatted like clean student handwriting with highlighted equations, key takeaway tags, and teal rule-of-thumb callout boxes.
            </p>
          </div>

          <div className="tool-card">
            <div className="tool-icon-circle blue">
              <Cpu size={20} />
            </div>
            <h4>Trained {subjectCount}-Subject Classifier</h4>
            <p>
              Trained on {sampleCount} authentic papers ({accuracyPct}% held-out test accuracy). Automatically identifies STEM and humanities subjects with uncertainty flagging and manual override.
            </p>
          </div>

          <div className="tool-card">
            <div className="tool-icon-circle teal">
              <HardDrive size={20} />
            </div>
            <h4>100% Offline Access via IndexedDB</h4>
            <p>
              Save study sets locally to your browser storage. Review flashcards and lecture notes seamlessly even when disconnected from the internet.
            </p>
          </div>

          <div className="tool-card">
            <div className="tool-icon-circle green">
              <Zap size={20} />
            </div>
            <h4>Video Ingestion via FFmpeg</h4>
            <p>
              Upload MP4, MOV, WEBM, MKV, or AVI lecture recordings (up to 200 MB, up to 120 mins). Audio tracks are extracted on the local backend and raw video files are immediately purged.
            </p>
          </div>
        </div>

        {/* Media & Privacy Policy Section */}
        <div style={{
          marginTop: 36, padding: '24px 28px', background: '#faf9fd',
          border: '1px solid #e9e5f5', borderRadius: 12, textAlign: 'left'
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#312e43', marginBottom: 12 }}>
            Video Processing & YouTube Compliance Policies
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, fontSize: 12, color: '#555', lineHeight: 1.6 }}>
            <div>
              <strong style={{ color: '#1e1b2e', display: 'block', marginBottom: 4 }}>
                📹 User-Uploaded Video Processing
              </strong>
              <p>
                ScribeFlow accepts lecture videos in standard formats (MP4, MOV, WEBM, MKV, AVI) up to 200 MB and 120 minutes. The backend extracts the speech audio track using local FFmpeg and deletes the raw video file immediately. Extracted audio is forwarded to ScribeFlow's configured Whisper provider, and all temporary audio segments are erased upon completion. Raw video files are never permanently stored.
              </p>
            </div>

            <div>
              <strong style={{ color: '#1e1b2e', display: 'block', marginBottom: 4 }}>
                📺 YouTube Captions & Compliance
              </strong>
              <p>
                ScribeFlow strictly adheres to Google's YouTube Data API v3 Terms of Service and does not deploy stream rippers, downloaders, or scrapers. Under YouTube API policy, downloading caption tracks via API requires OAuth 2.0 authorization from the channel owner. For third-party lectures, you can use the quick, compliant alternative: open the video on YouTube, click <em>"Show transcript"</em>, copy the text, and paste it into ScribeFlow.
              </p>
            </div>

            <div>
              <strong style={{ color: '#1e1b2e', display: 'block', marginBottom: 4 }}>
                🔒 Data Privacy & Secret Isolation
              </strong>
              <p>
                All external API keys (Groq Whisper, OpenAI, Google OAuth) reside exclusively on the server backend inside <code>backend/.env</code> and are never leaked or exposed to the client browser. No video media or API keys are ever transmitted directly from the browser to third-party endpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Roadmap Section */}
        <div className="roadmap-section">
          <div className="roadmap-header">
            <span className="roadmap-pill">FEATURE STATUS</span>
            <h3>Media Ingestion & Upcoming Roadmap</h3>
            <p>Active and planned capabilities in ScribeFlow.</p>
          </div>
          <div className="roadmap-grid">
            <div className="roadmap-card">
              <div className="roadmap-badge active" style={{ background: '#ecfdf5', color: '#065f46' }}>Available Now</div>
              <h4>Video File Upload (FFmpeg)</h4>
              <p>Extract speech audio from MP4, MOV, WEBM, MKV, and AVI recordings with automatic temporary-file cleanup.</p>
            </div>
            <div className="roadmap-card">
              <div className="roadmap-badge active" style={{ background: '#ecfdf5', color: '#065f46' }}>Available Now</div>
              <h4>Compliant YouTube Caption Importer</h4>
              <p>Strict YouTube URL validation with official Data API v3 caption integration and quick transcript paste support.</p>
            </div>
            <div className="roadmap-card">
              <div className="roadmap-badge planned">Planned</div>
              <h4>Export to Anki & PDF</h4>
              <p>Export flashcards to Anki-compatible decks (.apkg) or download study notes as printable PDFs.</p>
            </div>
          </div>
        </div>

        {/* Call to action */}
        <div className="how-cta-banner">
          <div>
            <h3>Ready to transform your lecture recordings?</h3>
            <p>Paste a transcript, upload audio/video, or import captions to generate your first study sheet.</p>
          </div>
          <button
            type="button"
            className="how-cta-btn"
            onClick={onGetStarted}
          >
            Create a Study Set Now <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}
