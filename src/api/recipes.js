const BASE = "https://www.themealdb.com/api/json/v1/1";

async function jget(url) {
	// fetch JSON and throw on non-OK status
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const json = await res.json();
	return json || {};
}

// Search meals by name
export async function searchByName(q) {
	const { meals } = await jget(
		`${BASE}/search.php?s=${encodeURIComponent(q)}`
	);
	return Array.isArray(meals) ? meals : [];
}

// Filter meals that include a given ingredient
export async function filterByIngredient(ingredient) {
	const q = encodeURIComponent(ingredient.trim());
	const { meals } = await jget(`${BASE}/filter.php?i=${q}`);
	return Array.isArray(meals) ? meals : [];
}

// Filter meals by category (returns stubs or [])
export async function filterByCategory(category) {
	const q = encodeURIComponent(category.trim());
	const { meals } = await jget(`${BASE}/filter.php?c=${q}`);
	return Array.isArray(meals) ? meals : [];
}

// List available categories
export async function listCategories() {
	const { categories } = await jget(`${BASE}/categories.php`);
	return Array.isArray(categories) ? categories : [];
}

// Lookup full meal detail by id
export async function lookupMeal(idMeal) {
	const { meals } = await jget(
		`${BASE}/lookup.php?i=${encodeURIComponent(idMeal)}`
	);
	return Array.isArray(meals) && meals.length ? meals[0] : null;
}

// Extract ingredient names from a detailed meal object
export function extractMealIngredients(detail) {
	const list = [];
	for (let i = 1; i <= 20; i++) {
		const ing = detail[`strIngredient${i}`];
		if (ing && String(ing).trim())
			list.push(String(ing).trim().toLowerCase());
	}
	return list;
}

// Helpers
// Hydrate an array of {idMeal,...} into full detail meals
export async function hydrateMeals(mealStubs, limit = 20) {
	// collect ids up to limit
	const ids = mealStubs.slice(0, limit).map((m) => m.idMeal);
	// fetch details in parallel
	const details = await Promise.all(ids.map((id) => lookupMeal(id)));
	// remove nulls
	return details.filter(Boolean);
}

// pick a few broad categories and sample from them
export async function popularMeals(limit = 20) {
	// Broad categories that tend to have many meals
	const CATS = ["Chicken", "Beef", "Pasta", "Seafood", "Vegetarian"];
	// fetch pools for each category
	const pools = await Promise.all(CATS.map((c) => filterByCategory(c)));
	const merged = [].concat(...pools);
	// shuffle
	for (let i = merged.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[merged[i], merged[j]] = [merged[j], merged[i]];
	}
	// hydrate a sample up to limit
	return hydrateMeals(merged, limit);
}

// Search by name OR ingredient. For ingredients, union single-ingredient matches.
export async function searchMealsSmart(query, limit = 24) {
	const q = query.trim();
	if (!q) return [];
	// Try name search
	const byName = await searchByName(q);
	// Try ingredient tokens
	const tokens = q
		.split(/[, ]+/g)
		.map((s) => s.trim())
		.filter(Boolean);
	// fetch stubs for each token
	const byIngStubs = (
		await Promise.all(tokens.map((t) => filterByIngredient(t)))
	).flat();
	// de-dup by id
	const map = new Map();
	for (const m of byName) map.set(m.idMeal, m);
	for (const s of byIngStubs) if (!map.has(s.idMeal)) map.set(s.idMeal, s);
	// create stubs array, marking which are detailed
	const stubs = [...map.values()].map((m) =>
		"strInstructions" in m ? m : { idMeal: m.idMeal }
	);
	// fetch missing details up to limit
	const detailed = await Promise.all(
		stubs
			.slice(0, limit)
			.map((m) => ("strInstructions" in m ? m : lookupMeal(m.idMeal)))
	);
	return detailed.filter(Boolean);
}
