# Live Score & Star Rating API Contract

**Unity → Nakama → TV/Web | Notification Code 8 & Code 13**

**Purpose:** Define the existing contract for real-time score delivery, per-video maximum score, and final star-rating presentation without introducing any new API, RPC, notification code, or architecture.

> **Source of truth:** Unity scoring. **Transport:** existing Nakama relay. **Presentation:** TV/Web.

## 1. Data Flow

The existing event path remains unchanged:

**Unity → Code 8 / Code 13 → Nakama → Existing Relay → TV / Web**

Nakama does not calculate score or star rating. It only relays the existing notification payload to the TV/Web consumer.

## 2. Notification Codes

| Code | Meaning | TV Consumer |
|---:|---|---|
| 8 | Live Score Update - during gameplay | `useLiveScore` |
| 13 | Dance Finished - final result and stars | `useDanceResult` / `DanceResultOverlay` |

## 3. Code 8 - Live Score

During gameplay, Unity sends a live-score update approximately every 1.5 seconds. The exact cadence may vary; the frontend must remain event-driven rather than timer-driven.

```json
{
  "code": 8,
  "content": {
    "newTotalScore": 110,
    "pointsAdded": 60,
    "feedback": "Perfect",
    "playerSlot": 1,
    "isSessionComplete": false,
    "maxScore": 1500
  }
}
```

### 3.1 Field Semantics

| Field | Semantics |
|---|---|
| `newTotalScore` | Cumulative absolute score at this point in time. The frontend must not add it again. |
| `pointsAdded` | Points earned in this event. Do not use it as the Progress Bar denominator or re-add it to total. |
| `feedback` | Detection result such as Perfect, Good, or Bad. |
| `playerSlot` | Player slot number, typically 1 or 2. |
| `isSessionComplete` | Whether the session associated with this score has ended. |
| `maxScore` | Configured maximum score for the current video; used as the Progress Bar denominator. |

## 4. Progress Bar

> **Rule:** Progress Bar uses only the cumulative total score and `maxScore`.

```text
fillPercent = clamp(newTotalScore / maxScore, 0, 1) × 100
```

**Fill direction:** bottom → top

**Denominator sources NOT used:** `duration`, `totalFrames`, `fps`, `maxPersons`

## 5. Code 13 - Final Result & Stars

After the dance ends, Unity calculates the final star rating from 0 to 5 and sends the final result. TV/Web displays the received star rating and must not recalculate it.

```json
{
  "code": 13,
  "content": {
    "videoId": 1,
    "playerCount": 1,
    "player1Score": 490,
    "player2Score": 0,
    "player1StarRating": 2,
    "player2StarRating": 0,
    "maxScore": 1500,
    "isSessionComplete": true
  }
}
```

**Example:** 490 / 1500 ≈ 32.7%, which maps to 2★ under the current thresholds.

### 5.1 Star Rating - Unity Authority

| Condition | Stars |
|---|---:|
| `maxScore <= 0` | 0★ |
| `ratio < 0.20` | 1★ |
| `ratio < 0.40` | 2★ |
| `ratio < 0.60` | 3★ |
| `ratio < 0.80` | 4★ |
| `ratio >= 0.80` | 5★ |

## 6. Frontend Rules

| Rule | Requirement |
|---|---|
| **Progress Bar score source** | `liveScore.slots[n].total` |
| **Star source** | `player1StarRating` / `player2StarRating` from Code 13. Defensive fallback: Code 8 only when Code 13 is unavailable. |
| **No double counting** | Never add `pointsAdded` to total again. |
| **Over-max scores** | If score > `maxScore`, clamp only the UI to 100%. Do not alter the real total. |
| **Video isolation** | At the start of a new video, score and `maxScore` must belong to that same video. |

## 7. Backend Impact

No new RPC, notification code, or socket is required. Nakama remains a transport/relay layer for the existing JSON payload and the architecture must remain unchanged.

## 8. Quick Validation

| Scenario | Expected value | Result |
|---|---|---|
| Video `maxScore = 1500` | Configured denominator | 1500 |
| Code 8: total = 50 | 50 / 1500 = 3.33% | 3.33% |
| Code 8: total = 750 | 750 / 1500 = 50% | 50% |
| Code 8: total = 1500 | 1500 / 1500 = 100% | 100% |
| Code 13: `starRating` | Must exactly match Unity | Exact match |
| Next video | Score + `maxScore` reset to that video | Independent |

> **Contract invariant:** Unity owns scoring. Nakama relays. TV/Web presents. No duplicate aggregation and no client-side star recalculation.
