import { slug } from './defaults'
import type { Food } from './types'

type Row = [name: string, serving: string, grams: number | null, kcal: number, protein: number, carbs: number, fat: number]

// Approximate values per serving, from USDA FoodData Central. Good enough for
// day-to-day tracking; scan or create a food when you need label accuracy.
const COMMON: Row[] = [
  ['Egg, large', '1 egg', 50, 72, 6.3, 0.4, 4.8],
  ['Egg white', '1 large white', 33, 17, 3.6, 0.2, 0.1],
  ['Chicken breast, cooked', '100 g', 100, 165, 31, 0, 3.6],
  ['Chicken thigh, cooked, skinless', '100 g', 100, 179, 25, 0, 8.2],
  ['Ground beef 90/10, cooked', '100 g', 100, 217, 26, 0, 11.8],
  ['Ground beef 80/20, cooked', '100 g', 100, 272, 25.6, 0, 17.9],
  ['Sirloin steak, cooked', '100 g', 100, 200, 30, 0, 8],
  ['Pork tenderloin, cooked', '100 g', 100, 143, 26, 0, 3.5],
  ['Salmon, cooked', '100 g', 100, 206, 22, 0, 12],
  ['Cod, cooked', '100 g', 100, 105, 22.8, 0, 0.9],
  ['Shrimp, cooked', '100 g', 100, 99, 24, 0.2, 0.3],
  ['Tuna, canned in water', '100 g', 100, 116, 25.5, 0, 0.8],
  ['Turkey breast, deli', '2 oz', 56, 60, 12, 1, 1],
  ['Bacon, cooked', '1 slice', 8, 43, 3, 0.1, 3.3],
  ['Tofu, firm', '100 g', 100, 144, 17.3, 2.8, 8.7],
  ['Greek yogurt, nonfat', '170 g cup', 170, 100, 17, 6, 0.7],
  ['Greek yogurt, whole milk', '170 g cup', 170, 165, 15, 6.6, 8.5],
  ['Cottage cheese, 2%', '½ cup', 113, 92, 12, 5, 2.6],
  ['Milk, skim', '1 cup', 245, 83, 8.3, 12.2, 0.2],
  ['Milk, 2%', '1 cup', 244, 122, 8.1, 11.7, 4.8],
  ['Milk, whole', '1 cup', 244, 149, 7.7, 11.7, 7.9],
  ['Cheddar cheese', '1 oz', 28, 114, 7, 0.4, 9.4],
  ['Mozzarella, part-skim', '1 oz', 28, 72, 6.9, 0.8, 4.5],
  ['Whey protein', '1 scoop', 30, 120, 24, 3, 1.5],
  ['Protein bar', '1 bar', 60, 210, 20, 23, 7],
  ['Butter', '1 tbsp', 14, 102, 0.1, 0, 11.5],
  ['Olive oil', '1 tbsp', 13.5, 119, 0, 0, 13.5],
  ['Peanut butter', '2 tbsp', 32, 190, 7, 7, 16],
  ['Almonds', '1 oz', 28, 164, 6, 6.1, 14.2],
  ['Walnuts', '1 oz', 28, 185, 4.3, 3.9, 18.5],
  ['Avocado', '½ fruit', 68, 109, 1.4, 5.8, 10],
  ['Hummus', '2 tbsp', 30, 70, 2, 4, 5],
  ['Banana, medium', '1 banana', 118, 105, 1.3, 27, 0.4],
  ['Apple, medium', '1 apple', 182, 95, 0.5, 25, 0.3],
  ['Orange, medium', '1 orange', 131, 62, 1.2, 15.4, 0.2],
  ['Blueberries', '1 cup', 148, 84, 1.1, 21.4, 0.5],
  ['Strawberries', '1 cup', 152, 49, 1, 11.7, 0.5],
  ['Grapes', '1 cup', 151, 104, 1.1, 27.3, 0.2],
  ['Oats, rolled (dry)', '½ cup', 40, 150, 5, 27, 2.5],
  ['White rice, cooked', '1 cup', 158, 205, 4.3, 44.5, 0.4],
  ['Brown rice, cooked', '1 cup', 195, 216, 5, 45, 1.8],
  ['Pasta, cooked', '1 cup', 140, 221, 8.1, 43.2, 1.3],
  ['Quinoa, cooked', '1 cup', 185, 222, 8.1, 39.4, 3.6],
  ['Bread, whole wheat', '1 slice', 32, 80, 4, 14, 1.1],
  ['Bread, white', '1 slice', 25, 66, 1.9, 12.7, 0.8],
  ['Bagel, plain', '1 bagel', 105, 270, 10.5, 53, 1.7],
  ['Flour tortilla, 8"', '1 tortilla', 49, 140, 3.8, 23.6, 3.6],
  ['Potato, baked', '1 medium', 173, 161, 4.3, 36.6, 0.2],
  ['Sweet potato, baked', '1 medium', 114, 103, 2.3, 23.6, 0.2],
  ['Broccoli, cooked', '1 cup', 156, 55, 3.7, 11.2, 0.6],
  ['Spinach, raw', '1 cup', 30, 7, 0.9, 1.1, 0.1],
  ['Carrot, raw', '1 medium', 61, 25, 0.6, 5.8, 0.1],
  ['Black beans, cooked', '½ cup', 86, 114, 7.6, 20.4, 0.5],
  ['Chickpeas, cooked', '½ cup', 82, 135, 7.3, 22.5, 2.1],
  ['Lentils, cooked', '½ cup', 99, 115, 8.9, 19.9, 0.4],
  ['Popcorn, air-popped', '3 cups', 24, 93, 3, 18.6, 1.1],
  ['Dark chocolate, 70%', '1 oz', 28, 170, 2.2, 13, 12.1],
  ['Pizza, cheese', '1 slice (14")', 107, 285, 12.2, 35.7, 10.4],
  ['Honey', '1 tbsp', 21, 64, 0.1, 17.3, 0],
  ['Sugar', '1 tsp', 4, 16, 0, 4.2, 0],
  ['Orange juice', '1 cup', 248, 112, 1.7, 25.8, 0.5],
  ['Coffee, black', '1 cup', 240, 2, 0.3, 0, 0],
  ['Cola', '12 oz can', 368, 140, 0, 39, 0],
  ['Beer, regular', '12 oz', 355, 153, 1.6, 12.6, 0],
  ['Wine, red', '5 oz glass', 148, 125, 0.1, 3.8, 0],
]

export const COMMON_FOODS: Food[] = COMMON.map(([name, serving, grams, kcal, protein, carbs, fat]) => ({
  id: `common-${slug(name)}`,
  updatedAt: 0,
  name,
  serving,
  servingGrams: grams ?? undefined,
  kcal,
  protein,
  carbs,
  fat,
}))

// ---------- Open Food Facts barcode lookup ----------

interface OFFProduct {
  product_name?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

const n = (v: unknown) => {
  const x = typeof v === 'string' ? parseFloat(v) : (v as number)
  return typeof x === 'number' && isFinite(x) ? x : null
}

/** Looks a barcode up on Open Food Facts (free, crowd-sourced). Returns null if it isn't there. */
export async function lookupBarcode(code: string): Promise<Omit<Food, 'id' | 'updatedAt'> | null> {
  const fields = 'product_name,brands,serving_size,serving_quantity,nutriments'
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`)
  const body = (await res.json()) as { status?: number; product?: OFFProduct }
  const p = body.product
  if (!body.status || !p) return null
  const nu = p.nutriments ?? {}
  const per100 = {
    kcal: n(nu['energy-kcal_100g']) ?? (n(nu['energy_100g']) != null ? n(nu['energy_100g'])! / 4.184 : null),
    protein: n(nu['proteins_100g']),
    carbs: n(nu['carbohydrates_100g']),
    fat: n(nu['fat_100g']),
  }
  const grams = n(p.serving_quantity)
  const name = p.product_name?.trim() || `Product ${code}`
  const brand = p.brands?.split(',')[0]?.trim() || undefined
  const scale = (v: number | null, g: number) => Math.round(((v ?? 0) * g) / 10) / 10
  if (grams && grams > 0) {
    return {
      name,
      brand,
      barcode: code,
      serving: p.serving_size?.trim() || `${grams} g`,
      servingGrams: grams,
      kcal: Math.round(((per100.kcal ?? 0) * grams) / 100),
      protein: scale(per100.protein, grams),
      carbs: scale(per100.carbs, grams),
      fat: scale(per100.fat, grams),
    }
  }
  return {
    name,
    brand,
    barcode: code,
    serving: '100 g',
    servingGrams: 100,
    kcal: Math.round(per100.kcal ?? 0),
    protein: per100.protein ?? 0,
    carbs: per100.carbs ?? 0,
    fat: per100.fat ?? 0,
  }
}

/** Camera barcode scanning is built into Chrome on Android; desktop browsers mostly lack it. */
export const canScan = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia
