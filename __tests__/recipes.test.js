import * as recipes from "../src/api/recipes";

const okJson = (obj) => ({ ok: true, json: async () => obj });
const notOk = (status = 500) => ({ ok: false, status, json: async () => ({}) });

beforeEach(() => {
	jest.clearAllMocks();
	global.fetch.mockReset();
});

describe("core endpoints", () => {
	test("searchByName returns [] when meals is null", async () => {
		global.fetch.mockResolvedValueOnce(okJson({ meals: null }));
		const out = await recipes.searchByName("chicken");
		expect(out).toEqual([]);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/search.php?s=chicken")
		);
	});

	test("searchByName throws on HTTP error", async () => {
		global.fetch.mockResolvedValueOnce(notOk(500));
		await expect(recipes.searchByName("x")).rejects.toThrow("HTTP 500");
	});

	test("filterByIngredient returns array (or [])", async () => {
		global.fetch.mockResolvedValueOnce(
			okJson({ meals: [{ idMeal: "1" }] })
		);
		const out = await recipes.filterByIngredient("tomato");
		expect(out).toEqual([{ idMeal: "1" }]);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/filter.php?i=tomato")
		);
	});

	test("filterByCategory returns array (or [])", async () => {
		global.fetch.mockResolvedValueOnce(
			okJson({ meals: [{ idMeal: "2" }] })
		);
		const out = await recipes.filterByCategory("Seafood");
		expect(out).toEqual([{ idMeal: "2" }]);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/filter.php?c=Seafood")
		);
	});

	test("listCategories returns [] when categories missing", async () => {
		global.fetch.mockResolvedValueOnce(okJson({}));
		const out = await recipes.listCategories();
		expect(out).toEqual([]);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/categories.php")
		);
	});

	test("lookupMeal returns first meal or null", async () => {
		// success
		global.fetch.mockResolvedValueOnce(
			okJson({ meals: [{ idMeal: "10", strMeal: "A" }] })
		);
		const one = await recipes.lookupMeal("10");
		expect(one).toEqual({ idMeal: "10", strMeal: "A" });

		// nulls
		global.fetch.mockResolvedValueOnce(okJson({ meals: [] }));
		const two = await recipes.lookupMeal("11");
		expect(two).toBeNull();
	});
});

describe("searchMealsSmart", () => {
	test("returns [] for empty/whitespace query", async () => {
		const r = await recipes.searchMealsSmart("   ");
		expect(r).toEqual([]);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	test("unions name results (detailed) with ingredient stubs (looked up), de-duplicated, honors limit", async () => {
		// byName returns detailed meals
		const byName = [
			{ idMeal: "A1", strInstructions: "cook it" },
			{ idMeal: "B2", strInstructions: "bake it" },
		];
		// ingredient tokens, "chicken, rice" => two filter calls returning stubs
		const stub1 = [{ idMeal: "A1" }, { idMeal: "C3" }]; // A1 duplicates detailed
		const stub2 = [{ idMeal: "D4" }, { idMeal: "E5" }];

		global.fetch
			.mockResolvedValueOnce(okJson({ meals: byName })) // searchByName
			.mockResolvedValueOnce(okJson({ meals: stub1 })) // filter chicken
			.mockResolvedValueOnce(okJson({ meals: stub2 })) // filter rice
			.mockResolvedValueOnce(
				okJson({ meals: [{ idMeal: "C3", strInstructions: "..." }] })
			) // lookup C3
			.mockResolvedValueOnce(
				okJson({ meals: [{ idMeal: "D4", strInstructions: "..." }] })
			); // lookup D4

		const out = await recipes.searchMealsSmart("chicken, rice", 3);
		// Expect first two detailed from name, and one looked-up stub to satisfy limit=3, no duplicates
		expect(out.map((m) => m.idMeal)).toEqual(["A1", "B2", "C3"]);
	});

	test("ingredient stubs only (no name hits) triggers lookups", async () => {
		global.fetch
			.mockResolvedValueOnce(okJson({ meals: null })) // searchByName none
			.mockResolvedValueOnce(okJson({ meals: [{ idMeal: "X1" }] })) // filter token1
			.mockResolvedValueOnce(
				okJson({ meals: [{ idMeal: "X1", strInstructions: "ok" }] })
			); // lookup X1

		const out = await recipes.searchMealsSmart("onion", 5);
		expect(out).toEqual([{ idMeal: "X1", strInstructions: "ok" }]);
	});
});
