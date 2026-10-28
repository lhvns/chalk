import type { DB, Exercise, ExerciseKind, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: 0,
  weightUnit: 'lb',
  distanceUnit: 'mi',
  lengthUnit: 'in',
  calorieGoal: 2200,
  proteinGoal: 160,
  carbsGoal: 220,
  fatGoal: 70,
  restSeconds: 90,
  eatBackCardio: false,
}

export const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body', 'Other'] as const

const LIBRARY: [string, (typeof MUSCLES)[number], ExerciseKind?][] = [
  ['Bench Press', 'Chest'],
  ['Incline Bench Press', 'Chest'],
  ['Dumbbell Bench Press', 'Chest'],
  ['Incline Dumbbell Press', 'Chest'],
  ['Cable Fly', 'Chest'],
  ['Push-up', 'Chest', 'reps'],
  ['Dip', 'Chest', 'reps'],
  ['Deadlift', 'Back'],
  ['Barbell Row', 'Back'],
  ['Dumbbell Row', 'Back'],
  ['Pull-up', 'Back', 'reps'],
  ['Chin-up', 'Back', 'reps'],
  ['Lat Pulldown', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Face Pull', 'Back'],
  ['Back Squat', 'Legs'],
  ['Front Squat', 'Legs'],
  ['Leg Press', 'Legs'],
  ['Romanian Deadlift', 'Legs'],
  ['Bulgarian Split Squat', 'Legs'],
  ['Walking Lunge', 'Legs'],
  ['Hip Thrust', 'Legs'],
  ['Leg Extension', 'Legs'],
  ['Leg Curl', 'Legs'],
  ['Calf Raise', 'Legs'],
  ['Overhead Press', 'Shoulders'],
  ['Dumbbell Shoulder Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'],
  ['Rear Delt Fly', 'Shoulders'],
  ['Barbell Curl', 'Arms'],
  ['Dumbbell Curl', 'Arms'],
  ['Hammer Curl', 'Arms'],
  ['Triceps Pushdown', 'Arms'],
  ['Skull Crusher', 'Arms'],
  ['Overhead Triceps Extension', 'Arms'],
  ['Plank', 'Core', 'time'],
  ['Hanging Leg Raise', 'Core', 'reps'],
  ['Cable Crunch', 'Core'],
  ['Ab Wheel Rollout', 'Core', 'reps'],
  ['Kettlebell Swing', 'Full body'],
  ['Farmer Carry', 'Full body', 'time'],
]

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Built-in exercises use deterministic ids and updatedAt 0, so every device
 * seeds identical records and syncing never duplicates them.
 */
export function defaultExercises(): Record<string, Exercise> {
  const out: Record<string, Exercise> = {}
  for (const [name, muscle, kind = 'weight'] of LIBRARY) {
    const id = `ex-${slug(name)}`
    out[id] = { id, updatedAt: 0, name, muscle, kind }
  }
  return out
}

export function emptyDB(): DB {
  return {
    schema: 1,
    exercises: defaultExercises(),
    workouts: {},
    routines: {},
    cardio: {},
    body: {},
    foods: {},
    foodLog: {},
    settings: { ...DEFAULT_SETTINGS },
  }
}
