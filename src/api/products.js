import Constants from "expo-constants";
import { getCachedUPC, putCachedUPC } from "../db/db";

// ENV / config
const EXTRA = Constants.expoConfig?.extra || {};
const FDC_KEY = EXTRA.FDC_API_KEY ?? process.env.EXPO_PUBLIC_FDC_API_KEY ?? "";
const UPCITEMDB_KEY =
	EXTRA.UPCITEMDB_API_KEY ?? process.env.EXPO_PUBLIC_UPCITEMDB_API_KEY ?? "";
const APP_NAME = EXTRA.APP_NAME ?? "MyPantry";
const APP_EMAIL = EXTRA.APP_EMAIL ?? "chidori.nyan@gmail.com"; // for OFF UA

// Helper, numeric or null
const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

// Convert OpenFoodFacts product JSON into common shape
function normalizeFromOFF(upc, json) {
	const p = json?.product;
	if (!p) return null;

	const name =
		p.product_name?.trim() || p.generic_name?.trim() || "Unknown item";
	const brand =
		(p.brands || p.brand_owner || "").toString().split(",")[0]?.trim() ||
		"";

	const n = p.nutriments || {};
	// Prefer per serving if available, else per 100g/ml
	const kcal = num(n["energy-kcal_serving"]) ?? num(n["energy-kcal_100g"]);
	const protein = num(n.proteins_serving) ?? num(n.proteins_100g);
	const carbs = num(n.carbohydrates_serving) ?? num(n.carbohydrates_100g);
	const fat = num(n.fat_serving) ?? num(n.fat_100g);

	let serving_qty = 1;
	let serving_unit = "serving";
	// Try to parse serving_size
	if (p.serving_size) {
		const m = String(p.serving_size).match(/([\d.]+)\s*([a-zA-Z]+)/);
		if (m) {
			serving_qty = num(m[1]) || 1;
			serving_unit = m[2].toLowerCase();
		}
	} else if (n["energy-kcal_100g"] != null) {
		serving_qty = 100;
		serving_unit = "g";
	} else if (n["energy-kcal_100ml"] != null) {
		serving_qty = 100;
		serving_unit = "ml";
	}

	return {
		upc,
		name,
		brand,
		serving_qty,
		serving_unit,
		nutrients: { kcal, protein, carbs, fat },
	};
}

// Convert USDA FDC response into common shape
function normalizeFromFDC(upc, f) {
	if (!f) return null;
	const name = f.description || f.brandName || f.brandOwner || "Unknown item";
	const brand = f.brandName || f.brandOwner || "";

	const ln = f.labelNutrients || {};
	const kcal = num(ln.calories?.value);
	const protein = num(ln.protein?.value);
	const carbs = num(ln.carbohydrates?.value);
	const fat = num(ln.fat?.value);

	const serving_qty = num(f.servingSize) || 1;
	const serving_unit = (f.servingSizeUnit || "serving").toLowerCase();

	return {
		upc,
		name,
		brand,
		serving_qty,
		serving_unit,
		nutrients: { kcal, protein, carbs, fat },
	};
}

// Convert UPCItemDB item into common shape
function normalizeFromUPCItemDB(upc, item) {
	if (!item) return null;
	const name = item.title || item.description || "Unknown item";
	const brand = item.brand || item.manufacturer || "";
	return {
		upc,
		name,
		brand,
		serving_qty: 1,
		serving_unit: "unit",
		nutrients: {}, // none provided
	};
}

// Fetch from OpenFoodFacts API
async function fetchOFF(upc) {
	const res = await fetch(
		`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}?fields=product_name,brands,brand_owner,generic_name,serving_size,nutriments`,
		{
			headers: {
				"User-Agent": `${APP_NAME}/1.0 (${APP_EMAIL})`,
				Accept: "application/json",
			},
		}
	);
	if (!res.ok) return null;
	const data = await res.json().catch(() => null);
	if (data?.status !== 1) return null;
	return normalizeFromOFF(upc, data);
}

// Fetch from USDA FDC API (branded foods)
async function fetchFDC(upc) {
	if (!FDC_KEY) return null;
	const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
		FDC_KEY
	)}&query=${encodeURIComponent(upc)}&dataType=Branded&pageSize=1`;

	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json().catch(() => null);
	const f = data?.foods?.[0];
	if (!f) return null;

	// Prefer search result if it has labelNutrients
	if (f.labelNutrients && f.servingSize) {
		return normalizeFromFDC(upc, f);
	}

	const id = f.fdcId;
	if (!id) return null;
	const res2 = await fetch(
		`https://api.nal.usda.gov/fdc/v1/food/${id}?api_key=${encodeURIComponent(FDC_KEY)}`
	);
	if (!res2.ok) return null;
	const full = await res2.json().catch(() => null);
	return normalizeFromFDC(upc, full);
}

// Fetch from UPCItemDB trial endpoint
async function fetchUPCItemDB(upc) {
	const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`;

	// FREE plan, no need user_key/key_type headers
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!res.ok) {
		if (res.status === 404) return null;
		const text = await res.text().catch(() => "");
		throw new Error(`UPCItemDB ${res.status}: ${text || "request failed"}`);
	}

	const data = await res.json().catch(() => null);
	if (
		!data ||
		data.code !== "OK" ||
		!Array.isArray(data.items) ||
		data.items.length === 0
	) {
		return null;
	}

	return normalizeFromUPCItemDB(upc, data.items[0]);
}

// Lookup UPC using cache first, then try providers in order
export async function lookupUPC(
	upc,
	options = { ttlDays: 30, bypassCache: false }
) {
	const clean = String(upc || "").trim();
	if (!clean) return null;

	if (!options?.bypassCache) {
		const cached = await getCachedUPC(clean, options?.ttlDays ?? 30);
		if (cached) return cached;
	}

	const providers = [fetchOFF, fetchFDC, fetchUPCItemDB];
	for (const p of providers) {
		try {
			const info = await p(clean);
			if (info && info.name) {
				await putCachedUPC(clean, info);
				return info;
			}
		} catch (e) {
			// continue to next provider
		}
	}

	return null;
}

// Make internal helpers importable in tests
export const __testables = {
	normalizeFromOFF,
	normalizeFromFDC,
	normalizeFromUPCItemDB,
};
