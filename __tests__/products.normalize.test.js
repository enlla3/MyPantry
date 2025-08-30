jest.mock("../src/db/db", () => ({
	getCachedUPC: jest.fn(async () => null),
	putCachedUPC: jest.fn(async () => undefined),
}));

import { __testables } from "../src/api/products";

describe("normalizers", () => {
	const { normalizeFromOFF, normalizeFromFDC, normalizeFromUPCItemDB } =
		__testables;

	test("normalizeFromOFF prefers per-serving, parses serving_size", () => {
		const upc = "0123456789012";
		const json = {
			product: {
				product_name: "Chocolate Bar",
				brands: "YumCo",
				nutriments: {
					"energy-kcal_serving": "210",
					proteins_serving: "3",
					carbohydrates_serving: "25",
					fat_serving: "12",
				},
				serving_size: "42 g",
			},
		};

		expect(normalizeFromOFF(upc, json)).toEqual({
			upc,
			name: "Chocolate Bar",
			brand: "YumCo",
			serving_qty: 42,
			serving_unit: "g",
			nutrients: { kcal: 210, protein: 3, carbs: 25, fat: 12 },
		});
	});

	test("normalizeFromOFF falls back to per 100g/ml when serving fields missing", () => {
		const upc = "111";
		const json = {
			product: {
				product_name: "",
				generic_name: "Tomato Sauce",
				brands: "",
				nutriments: {
					"energy-kcal_100g": "50",
					proteins_100g: "1.2",
					carbohydrates_100g: "10",
					fat_100g: "0.5",
				},
				serving_size: "100 ml",
			},
		};
		const got = normalizeFromOFF(upc, json);
		expect(got.name).toBe("Tomato Sauce");
		expect(got.nutrients).toEqual({
			kcal: 50,
			protein: 1.2,
			carbs: 10,
			fat: 0.5,
		});
		expect(got.serving_qty).toBe(100);
		expect(got.serving_unit.toLowerCase()).toBe("ml");
	});

	test("normalizeFromFDC uses labelNutrients and serving info", () => {
		const upc = "222";
		const f = {
			description: "Greek Yogurt",
			brandName: "CoolDairy",
			servingSize: 170,
			servingSizeUnit: "G",
			labelNutrients: {
				calories: { value: 120 },
				protein: { value: 17 },
				carbohydrates: { value: 6 },
				fat: { value: 0 },
			},
		};
		const got = normalizeFromFDC(upc, f);
		expect(got).toEqual({
			upc,
			name: "Greek Yogurt",
			brand: "CoolDairy",
			serving_qty: 170,
			serving_unit: "g",
			nutrients: { kcal: 120, protein: 17, carbs: 6, fat: 0 },
		});
	});

	test("normalizeFromUPCItemDB minimal mapping", () => {
		const upc = "333";
		const item = { title: "Instant Noodles", brand: "YumCo" };
		const got = normalizeFromUPCItemDB(upc, item);
		expect(got).toMatchObject({
			upc,
			name: "Instant Noodles",
			brand: "YumCo",
			serving_qty: 1,
			serving_unit: "unit",
		});
	});
});
