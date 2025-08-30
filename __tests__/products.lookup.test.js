const mockGetCachedUPC = jest.fn();
const mockPutCachedUPC = jest.fn();

// Mock the DB module before importing the SUT
jest.mock("../src/db/db", () => ({
	getCachedUPC: (...args) => mockGetCachedUPC(...args),
	putCachedUPC: (...args) => mockPutCachedUPC(...args),
}));

import { lookupUPC } from "../src/api/products";

// Helpers for fetch responses
const okJson = (obj) => ({ ok: true, json: async () => obj });
const notOk = (status = 500, text = "err") => ({
	ok: false,
	status,
	text: async () => text,
});

beforeEach(() => {
	jest.clearAllMocks();
	global.fetch.mockReset();
	mockGetCachedUPC.mockReset();
	mockPutCachedUPC.mockReset();
});

describe("lookupUPC (cache + providers)", () => {
	test("returns cached hit and does not fetch providers", async () => {
		const cached = { upc: "123", name: "Cached Item" };
		mockGetCachedUPC.mockResolvedValueOnce(cached);

		const got = await lookupUPC("123", { ttlDays: 7, bypassCache: false });
		expect(got).toEqual(cached);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mockPutCachedUPC).not.toHaveBeenCalled();
		expect(mockGetCachedUPC).toHaveBeenCalledWith("123", 7);
	});

	test("OFF success → normalizes, sets cache, sends UA header", async () => {
		mockGetCachedUPC.mockResolvedValueOnce(null);

		// OFF call
		global.fetch.mockResolvedValueOnce(
			okJson({
				status: 1,
				product: {
					product_name: "Chocolate Bar",
					brands: "YumCo",
					nutriments: { "energy-kcal_serving": "210" },
					serving_size: "42 g",
				},
			})
		);

		const got = await lookupUPC("0123456789012");
		expect(got).toMatchObject({
			upc: "0123456789012",
			name: "Chocolate Bar",
			brand: "YumCo",
			nutrients: expect.any(Object),
		});

		// Check UA header for the OFF request
		const [url, opts] = global.fetch.mock.calls[0];
		expect(String(url)).toContain(
			"world.openfoodfacts.org/api/v2/product/"
		);
		expect(opts?.headers?.["User-Agent"]).toMatch(
			/MyPantryTest\/1\.0 \(test@example\.com\)/
		);

		expect(mockPutCachedUPC).toHaveBeenCalledWith(
			"0123456789012",
			expect.any(Object)
		);
	});

	test("FDC: uses labelNutrients from search result (single fetch)", async () => {
		mockGetCachedUPC.mockResolvedValueOnce(null);

		// OFF fails
		global.fetch.mockResolvedValueOnce(okJson({ status: 0 }));

		// FDC search returns item with labelNutrients & servingSize
		global.fetch.mockResolvedValueOnce(
			okJson({
				foods: [
					{
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
					},
				],
			})
		);

		const got = await lookupUPC("222");
		expect(got).toEqual({
			upc: "222",
			name: "Greek Yogurt",
			brand: "CoolDairy",
			serving_qty: 170,
			serving_unit: "g",
			nutrients: { kcal: 120, protein: 17, carbs: 6, fat: 0 },
		});

		// Only 2 fetches
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("FDC: falls back to /food/{id} details when search lacks labelNutrients", async () => {
		mockGetCachedUPC.mockResolvedValueOnce(null);

		// OFF fails
		global.fetch.mockResolvedValueOnce(okJson({ status: 0 }));

		// FDC search with only fdcId
		global.fetch.mockResolvedValueOnce(okJson({ foods: [{ fdcId: 999 }] }));

		// FDC details
		global.fetch.mockResolvedValueOnce(
			okJson({
				description: "Cereal",
				brandOwner: "GrainCo",
				servingSize: 30,
				servingSizeUnit: "g",
				labelNutrients: {
					calories: { value: 110 },
					protein: { value: 3 },
					carbohydrates: { value: 24 },
					fat: { value: 1 },
				},
			})
		);

		const got = await lookupUPC("999");
		expect(got).toEqual({
			upc: "999",
			name: "Cereal",
			brand: "GrainCo",
			serving_qty: 30,
			serving_unit: "g",
			nutrients: { kcal: 110, protein: 3, carbs: 24, fat: 1 },
		});

		// 3 fetches, OFF, FDC search, FDC detail
		expect(global.fetch).toHaveBeenCalledTimes(3);
	});

	test("UPCItemDB: returns normalized on success", async () => {
		mockGetCachedUPC.mockResolvedValueOnce(null);

		// OFF fails
		global.fetch.mockResolvedValueOnce(okJson({ status: 0 }));

		// FDC search returns empty
		global.fetch.mockResolvedValueOnce(okJson({ foods: [] }));

		// UPC success
		global.fetch.mockResolvedValueOnce(
			okJson({
				code: "OK",
				items: [{ title: "Instant Noodles", brand: "YumCo" }],
			})
		);

		const got = await lookupUPC("333");
		expect(got).toMatchObject({
			upc: "333",
			name: "Instant Noodles",
			brand: "YumCo",
			serving_qty: 1,
			serving_unit: "unit",
		});
	});

	test("UPCItemDB: 404 → null (after OFF and FDC fail)", async () => {
		mockGetCachedUPC.mockResolvedValueOnce(null);

		// OFF fails
		global.fetch.mockResolvedValueOnce(okJson({ status: 0 }));
		// FDC empty
		global.fetch.mockResolvedValueOnce(okJson({ foods: [] }));
		// UPC 404
		global.fetch.mockResolvedValueOnce(notOk(404));

		const got = await lookupUPC("404404404");
		expect(got).toBeNull();
	});

	test("cache bypass option skips getCachedUPC and still writes cache on success", async () => {
		mockGetCachedUPC.mockResolvedValueOnce({ upc: "will-not-be-used" });

		// Force provider success
		global.fetch.mockResolvedValueOnce(
			okJson({
				status: 1,
				product: {
					product_name: "Coffee",
					brands: "BeanCo",
					nutriments: { "energy-kcal_serving": "5" },
					serving_size: "240 ml",
				},
			})
		);

		const got = await lookupUPC("777", { bypassCache: true });
		expect(mockGetCachedUPC).not.toHaveBeenCalled();
		expect(mockPutCachedUPC).toHaveBeenCalledWith(
			"777",
			expect.any(Object)
		);
		expect(got?.name).toBe("Coffee");
	});
});
