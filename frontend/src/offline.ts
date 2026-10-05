import { openDB } from 'idb'
import type { StudySet } from './types'

const DB_NAME = 'scribeflow'
const DB_VERSION = 1
const STORE_NAME = 'study-sets'

const database = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'offlineKey' })
    }
  },
})

export function getSetOfflineKey(set: { id?: number | string; title: string; offlineKey?: string }): string {
  if (set.id != null && set.id !== '') return String(set.id)
  if (set.offlineKey && String(set.offlineKey).trim()) return String(set.offlineKey)
  const slug = (set.title || 'untitled').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `set-${slug}`
}

export async function isSetSavedOffline(set: { id?: number | string; title: string; offlineKey?: string } | null | undefined): Promise<boolean> {
  if (!set) return false
  try {
    const db = await database
    const key = getSetOfflineKey(set)
    const item = await db.get(STORE_NAME, key)
    if (item) return true
    if (set.id != null) {
      const byId = await db.get(STORE_NAME, String(set.id))
      if (byId) return true
    }
    const slug = (set.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (slug) {
      const bySlug = await db.get(STORE_NAME, `set-${slug}`)
      if (bySlug) return true
    }
    return false
  } catch {
    return false
  }
}

export async function saveOffline(set: StudySet, userId?: string | null): Promise<StudySet> {
  try {
    const db = await database
    const offlineKey = getSetOfflineKey(set)
    const normalizedFlashcards = (set.flashcards || []).map((fc, i) => {
      const cardId = fc.id != null && fc.id !== '' ? fc.id : `${offlineKey}-card-${fc.seq_num ?? i + 1}`
      return { ...fc, id: cardId }
    })
    const record: StudySet = {
      ...set,
      userId: userId || set.userId || null,
      offlineKey,
      flashcards: normalizedFlashcards,
      savedAt: new Date().toISOString(),
    }
    await db.put(STORE_NAME, record)

    // Clean up any stale duplicate under slug key if primary key is now numeric id
    if (set.id != null) {
      const slug = (set.title || 'untitled').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const slugKey = `set-${slug}`
      if (slugKey !== offlineKey) {
        try {
          await db.delete(STORE_NAME, slugKey)
        } catch {}
      }
    }
    return record
  } catch (err: any) {
    console.error('saveOffline error:', err)
    throw new Error(err.message || 'IndexedDB storage is unavailable or quota exceeded.')
  }
}

export async function getOfflineSets(userId?: string | null): Promise<StudySet[]> {
  try {
    const db = await database
    const items = (await db.getAll(STORE_NAME)) as StudySet[]
    if (!userId) {
      // When unauthenticated, do not expose any user-scoped offline study sets
      return items.filter((s) => !s.userId)
    }
    return items.filter((s) => s.userId === userId)
  } catch (err) {
    console.error('getOfflineSets error:', err)
    return []
  }
}

export async function clearUserOfflineData(userId?: string | null) {
  try {
    const db = await database
    const items = (await db.getAll(STORE_NAME)) as StudySet[]
    for (const item of items) {
      if (!userId || item.userId === userId) {
        if (item.offlineKey) {
          await db.delete(STORE_NAME, item.offlineKey)
        }
      }
    }
  } catch (err) {
    console.error('clearUserOfflineData error:', err)
  }
}

export async function clearLocalUserData(userId?: string | null) {
  try {
    // Clear localStorage drafts and active state
    localStorage.removeItem('scribeflow_draft_title')
    localStorage.removeItem('scribeflow_draft_transcript')
    localStorage.removeItem('scribeflow_active_set_id')
    localStorage.removeItem('scribeflow_last_viewed_set_id')
    localStorage.removeItem('scribeflow_search_query')
    localStorage.removeItem('scribeflow_dev_auth_token')
    localStorage.removeItem('scribeflow_dev_auth_user')

    // Clear IndexedDB study data scoped to this user
    await clearUserOfflineData(userId)
  } catch (err) {
    console.error('clearLocalUserData error:', err)
  }
}

export async function removeOffline(set: StudySet) {
  try {
    const db = await database
    const offlineKey = getSetOfflineKey(set)
    await db.delete(STORE_NAME, offlineKey)
    if (set.offlineKey && set.offlineKey !== offlineKey) {
      await db.delete(STORE_NAME, set.offlineKey)
    }
    if (set.id != null) {
      await db.delete(STORE_NAME, String(set.id))
      try {
        await db.delete(STORE_NAME, Number(set.id))
      } catch {}
    }
    const slug = (set.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (slug) {
      await db.delete(STORE_NAME, `set-${slug}`)
    }
  } catch (err) {
    console.error('removeOffline error:', err)
  }
}

export async function updateOfflineSetTitle(set: StudySet, newTitle: string): Promise<StudySet> {
  const db = await database
  const oldKey = getSetOfflineKey(set)
  const updated: StudySet = {
    ...set,
    title: newTitle,
  }
  const newKey = getSetOfflineKey(updated)
  updated.offlineKey = newKey

  // Preserve existing cards and ratings exactly as they are
  await db.put(STORE_NAME, updated)

  // If key changed because it was a slug-based key without numeric ID, clean up old record
  if (oldKey !== newKey) {
    try {
      await db.delete(STORE_NAME, oldKey)
    } catch {}
  }
  return updated
}


export async function updateOfflineCardRating(
  setId: string | number,
  cardId: number | string,
  rating: number
): Promise<StudySet | null> {
  const db = await database
  const keyStr = String(setId)

  // Direct lookup by primary key
  let set = (await db.get(STORE_NAME, keyStr)) as StudySet | undefined

  // Fallback search across stored items
  if (!set) {
    const all = (await db.getAll(STORE_NAME)) as StudySet[]
    set = all.find(
      (s) =>
        String(s.offlineKey) === keyStr ||
        String(s.id) === keyStr ||
        s.title.trim().toLowerCase() === keyStr.trim().toLowerCase()
    )
  }

  if (!set || !set.flashcards) return null

  // Find card strictly by stable card id or key
  const cardIdStr = String(cardId)
  const card = set.flashcards.find(
    (c) => String(c.id) === cardIdStr || (c.seq_num != null && String(c.seq_num) === cardIdStr)
  )

  if (card) {
    card.rating = rating
    card.review_count = (card.review_count ?? 0) + 1
    card.last_reviewed = new Date().toISOString()

    // Recalculate summary metrics strictly from individual card states
    const total = set.flashcards.length
    const diffCounts: Record<string, number> = {}
    const topicCounts: Record<string, number> = {}
    const typeCounts: Record<string, number> = {}
    let challenging = 0

    for (const fc of set.flashcards) {
      const d = fc.difficulty || 'Medium'
      diffCounts[d] = (diffCounts[d] || 0) + 1
      const t = fc.topic || set.topic || 'General'
      topicCounts[t] = (topicCounts[t] || 0) + 1
      const ct = fc.card_type || 'concept'
      typeCounts[ct] = (typeCounts[ct] || 0) + 1
      if (fc.rating === 1 || fc.rating === 2) {
        challenging++
      }
    }

    set.summary = {
      total_cards: total,
      difficulty_counts: diffCounts,
      topic_counts: topicCounts,
      card_type_counts: typeCounts,
      challenging_count: challenging,
    }

    await db.put(STORE_NAME, set)
    return set
  }
  return null
}
