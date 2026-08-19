/**
 * Study domain — the public interface pages should use.
 *
 * Hides queue assembly, the learning restore window, Dexie query shapes,
 * and custom-queue storage. Internal files under this folder are
 * implementation details.
 */
export { snapshotHomeState } from './queue'
export {
  applyRating,
  loadStudyCards,
  ratingPreviews,
  remainingCounts,
} from './session'
export {
  beginFailedReview,
  countFailedCards,
  getDailyNewOverride,
  setDailyNewOverride,
} from './customStudy'
export { getEffectiveNewLimit } from './dailyNew'
export { buildDeckForest, totalDue, type DeckNode } from './deckTree'
