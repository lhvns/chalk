// Every synced record carries an id, a last-modified timestamp and an optional
// tombstone. Merging two copies of the database keeps, per id, whichever
// record was modified last — so deletes must be tombstones, never removals.
export interface Base {
  id: string
  updatedAt: number
  deleted?: boolean
}

/** Local calendar day, `YYYY-MM-DD`. */
export type DateKey = string

export type ExerciseKind = 'weight' | 'reps' | 'time'

export interface Exercise extends Base {
  name: string
  muscle: string
  /** weight: kg × reps · reps: bodyweight reps (+ optional kg) · time: seconds */
  kind: ExerciseKind
}

export interface WorkoutSet {
  id: string
  reps: number | null
  /** Always stored in kg, regardless of the display unit. */
  weight: number | null
  done: boolean
}

export interface WorkoutEntry {
  id: string
  exerciseId: string
  sets: WorkoutSet[]
  /** Reps to aim for on every set (seconds for timed exercises). */
  targetReps?: number
}

export interface Workout extends Base {
  date: DateKey
  name: string
  startedAt: number
  finishedAt?: number
  notes?: string
  entries: WorkoutEntry[]
}

export interface Routine extends Base {
  name: string
  /** `reps` is the target per set (seconds for timed exercises). */
  items: { exerciseId: string; sets: number; reps?: number }[]
}

export type CardioType = 'run' | 'walk' | 'ride' | 'swim' | 'row' | 'hike' | 'elliptical' | 'other'

export interface Cardio extends Base {
  date: DateKey
  type: CardioType
  durationMin: number
  /** Always stored in km. */
  distanceKm?: number
  calories?: number
  notes?: string
}

export const MEASUREMENTS = ['waist', 'chest', 'hips', 'arm', 'thigh', 'neck'] as const
export type Measurement = (typeof MEASUREMENTS)[number]

/** One entry per day; the id is `body-<date>` so two devices converge on the same record. */
export interface BodyEntry extends Base, Partial<Record<Measurement, number>> {
  date: DateKey
  /** kg */
  weight?: number
  bodyFat?: number
}

export interface Nutrition {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Food extends Base, Nutrition {
  name: string
  brand?: string
  /** What one serving is, e.g. "1 cup" or "100 g". Nutrition is per serving. */
  serving: string
  servingGrams?: number
  barcode?: string
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface FoodLog extends Base, Nutrition {
  date: DateKey
  meal: Meal
  name: string
  serving: string
  servingGrams?: number
  /** Nutrition fields are per serving; totals are servings × per-serving. */
  servings: number
  foodId?: string
}

export interface Settings extends Base {
  weightUnit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
  lengthUnit: 'cm' | 'in'
  calorieGoal: number
  proteinGoal: number
  carbsGoal: number
  fatGoal: number
  restSeconds: number
  /** Add calories logged on cardio sessions to the day's budget. */
  eatBackCardio: boolean
}

export interface DB {
  schema: 1
  exercises: Record<string, Exercise>
  workouts: Record<string, Workout>
  routines: Record<string, Routine>
  cardio: Record<string, Cardio>
  body: Record<string, BodyEntry>
  foods: Record<string, Food>
  foodLog: Record<string, FoodLog>
  settings: Settings
}

export type CollectionName = Exclude<keyof DB, 'schema' | 'settings'>
export type RecordOf<C extends CollectionName> = DB[C][string]

export const COLLECTIONS: CollectionName[] = [
  'exercises',
  'workouts',
  'routines',
  'cardio',
  'body',
  'foods',
  'foodLog',
]
