import * as SQLite from "expo-sqlite";
import {
	applyRemoteFavs,
	applyRemoteRows,
	getCachedUPC,
	getDirtyFavs,
	getDirtyRows,
	getFavsLastPull,
	getLastPullCursor,
	isFavorite,
	listFavorites,
	markFavsPushed,
	markPushed,
	putCachedUPC,
	setCurrentUser,
	setFavorite,
	setFavsLastPull,
	setLastPullCursor,
	setLastSyncAt,
} from "../src/db/db";

let db;

beforeEach(async () => {
	db = await SQLite.openDatabaseAsync();
	for (const fn of [
		"execAsync",
		"runAsync",
		"getAllAsync",
		"getFirstAsync",
		"transaction",
		"closeAsync",
	]) {
		if (db[fn]?.mockReset) db[fn].mockReset();
		if (db[fn]?.mockClear) db[fn].mockClear();
	}
	setCurrentUser(null);
});

describe("UPC cache", () => {
	test("putCachedUPC upserts and getCachedUPC honors TTL and JSON parsing", async () => {
		await putCachedUPC("012", { name: "X" });
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO upc_cache/i),
			"012",
			JSON.stringify({ name: "X" }),
			expect.any(String)
		);

		db.getFirstAsync.mockResolvedValueOnce(null);
		expect(await getCachedUPC("012", 30)).toBeNull();

		const old = new Date(Date.now() - 40 * 86400_000).toISOString();
		db.getFirstAsync.mockResolvedValueOnce({
			json: JSON.stringify({ a: 1 }),
			fetched_at: old,
		});
		expect(await getCachedUPC("012", 30)).toBeNull();

		const now = new Date().toISOString();
		db.getFirstAsync.mockResolvedValueOnce({
			json: "{bad",
			fetched_at: now,
		});
		expect(await getCachedUPC("012", 30)).toBeNull();

		db.getFirstAsync.mockResolvedValueOnce({
			json: JSON.stringify({ a: 1 }),
			fetched_at: now,
		});
		expect(await getCachedUPC("012", 30)).toEqual({ a: 1 });
	});
});

describe("sync state (kv)", () => {
	beforeEach(() => setCurrentUser("U1"));

	test("setLastPullCursor and getLastPullCursor", async () => {
		await setLastPullCursor("2024-01-02T00:00:00Z");
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO sync_state/i),
			`pantry:last_pull:U1`,
			"2024-01-02T00:00:00Z"
		);

		db.getFirstAsync.mockResolvedValueOnce({ v: "CUR" });
		expect(await getLastPullCursor()).toBe("CUR");
		expect(db.getFirstAsync).toHaveBeenCalledWith(
			expect.stringMatching(/SELECT v FROM sync_state/i),
			`pantry:last_pull:U1`
		);
	});

	test("setLastSyncAt", async () => {
		await setLastSyncAt("2024-02-03T00:00:00Z");
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO sync_state/i),
			expect.stringMatching(/pantry:last_sync_at:/),
			"2024-02-03T00:00:00Z"
		);
	});

	test("favourites cursor wrappers", async () => {
		await setFavsLastPull("2024-01-01T00:00:00Z");
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO sync_state/i),
			`favs:last_pull:U1`,
			"2024-01-01T00:00:00Z"
		);

		db.getFirstAsync.mockResolvedValueOnce({ v: "FAV_CUR" });
		expect(await getFavsLastPull()).toBe("FAV_CUR");
		expect(db.getFirstAsync).toHaveBeenCalledWith(
			expect.stringMatching(/SELECT v FROM sync_state/i),
			`favs:last_pull:U1`
		);
	});
});

describe("pantry helpers", () => {
	beforeEach(() => setCurrentUser("U1"));

	test("getDirtyRows", async () => {
		db.getAllAsync.mockResolvedValueOnce([{ id: "A" }]);
		const rows = await getDirtyRows();
		expect(rows).toEqual([{ id: "A" }]);
		expect(db.getAllAsync).toHaveBeenCalledWith(
			expect.stringMatching(/FROM pantry_items/i),
			"U1"
		);
	});

	test("markPushed clears dirty and hard-deletes deleted", async () => {
		db.getAllAsync.mockResolvedValueOnce([{ id: "A" }]); // deleted among ids
		await markPushed(["A", "B"]);

		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/UPDATE pantry_items SET dirty=0/i),
			"U1",
			"A",
			"B"
		);
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/DELETE FROM pantry_items/i),
			"U1",
			"A"
		);
	});

	test("applyRemoteRows: delete, insert, update, and conflict skip", async () => {
		const rows = [
			{ id: "DEL", deleted: true, updated_at: "2024-01-01T00:00:00Z" },
			{
				id: "NEW",
				name: "N",
				brand: "B",
				qty: 1,
				unit: "g",
				per_serving: { kcal: 1 },
				upc: "000",
				updated_at: "2024-01-02T00:00:00Z",
			},
			{
				id: "UPD",
				name: "U",
				brand: "B",
				qty: 2,
				unit: "g",
				per_serving: {},
				upc: "",
				updated_at: "2024-02-01T00:00:00Z",
			},
			{
				id: "SKIP",
				name: "S",
				brand: "B",
				qty: 3,
				unit: "g",
				per_serving: {},
				upc: "",
				updated_at: "2024-01-01T00:00:00Z",
			},
		];

		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2023-01-01",
			dirty: 0,
		}); // DEL
		db.getFirstAsync.mockResolvedValueOnce(null); // NEW
		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2024-01-01T00:00:00Z",
			dirty: 0,
		}); // UPD
		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2024-12-31T00:00:00Z",
			dirty: 1,
		}); // SKIP

		await applyRemoteRows(rows);

		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/DELETE FROM pantry_items/i),
			"U1",
			"DEL"
		);
		const insertCall = db.runAsync.mock.calls[1];
		expect(insertCall[0]).toMatch(/INSERT INTO pantry_items/i);
		expect(insertCall[1]).toBe("NEW"); // id
		expect(insertCall[2]).toBe("U1"); // user_id
		expect(insertCall[3]).toBe("000"); // upc
		expect(insertCall[4]).toBe("N"); // name
		expect(insertCall[5]).toBe("B"); // brand
		expect(insertCall[6]).toBe(1); // qty
		expect(insertCall[7]).toBe("g"); // unit
		expect(insertCall[8]).toBe(JSON.stringify({ kcal: 1 })); // per_serving
		expect(insertCall[9]).toBeUndefined(); // created_at may be undefined
		expect(insertCall[10]).toBe("2024-01-02T00:00:00Z"); // updated_at

		// UPDATE is the 3rd call
		const updateCall = db.runAsync.mock.calls[2];
		expect(updateCall[0]).toMatch(/UPDATE pantry_items/i);
		// upc can be null or a string
		expect(updateCall[1] == null || typeof updateCall[1] === "string").toBe(
			true
		);
		expect(updateCall[2]).toBe("U"); // name
		expect(updateCall[3]).toBe("B"); // brand
		expect(updateCall[4]).toBe(2); // qty
		expect(updateCall[5]).toBe("g"); // unit
		expect(updateCall[6]).toBe(JSON.stringify({})); // per_serving
		expect(updateCall[7]).toBe("2024-02-01T00:00:00Z"); // updated_at
		expect(updateCall[8]).toBe("U1"); // user_id
		expect(updateCall[9]).toBe("UPD");

		const updateCalls = db.runAsync.mock.calls.filter(([sql]) =>
			/UPDATE pantry_items/i.test(sql)
		);
		expect(
			updateCalls.some(([, , , , , , , , , id]) => id === "SKIP")
		).toBe(false);
	});
});

describe("favourites helpers", () => {
	beforeEach(() => setCurrentUser("U1"));

	test("getDirtyFavs", async () => {
		db.getAllAsync.mockResolvedValueOnce([{ meal_id: "M1" }]);
		const rows = await getDirtyFavs();
		expect(rows).toEqual([{ meal_id: "M1" }]);
		expect(db.getAllAsync).toHaveBeenCalledWith(
			expect.stringMatching(/FROM meal_favorites/i),
			"U1"
		);
	});

	test("markFavsPushed clears dirty and hard-deletes deleted favs", async () => {
		await markFavsPushed([{ meal_id: "M1", source: "s" }]);
		expect(db.runAsync).toHaveBeenNthCalledWith(
			1,
			expect.stringMatching(/UPDATE meal_favorites/i),
			"U1",
			"M1",
			"s"
		);
		expect(db.runAsync).toHaveBeenNthCalledWith(
			2,
			expect.stringMatching(/DELETE FROM meal_favorites/i),
			"U1",
			"M1",
			"s"
		);
	});

	test("applyRemoteFavs: delete, insert, update, conflict skip", async () => {
		const rows = [
			{
				meal_id: "DEL",
				source: "s",
				deleted: true,
				updated_at: "2024-01-01T00:00:00Z",
			},
			{
				meal_id: "NEW",
				source: "s",
				title: "T",
				thumb: "U",
				json: { x: 1 },
				updated_at: "2024-01-02T00:00:00Z",
			},
			{
				meal_id: "UPD",
				source: "s",
				title: "TU",
				thumb: "UU",
				json: {},
				updated_at: "2024-02-01T00:00:00Z",
			},
			{
				meal_id: "SKIP",
				source: "s",
				updated_at: "2024-01-01T00:00:00Z",
			},
		];

		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2023-01-01",
			dirty: 0,
		});
		db.getFirstAsync.mockResolvedValueOnce(null);
		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2024-01-01T00:00:00Z",
			dirty: 0,
		});
		db.getFirstAsync.mockResolvedValueOnce({
			updated_at: "2024-12-31T00:00:00Z",
			dirty: 1,
		});

		await applyRemoteFavs(rows);

		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/DELETE FROM meal_favorites/i),
			"U1",
			"DEL",
			"s"
		);
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO meal_favorites/i),
			"U1",
			"NEW",
			"s",
			"T",
			"U",
			JSON.stringify({ x: 1 }),
			expect.any(String),
			"2024-01-02T00:00:00Z"
		);
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/UPDATE meal_favorites/i),
			"TU",
			"UU",
			JSON.stringify({}),
			"2024-02-01T00:00:00Z",
			"U1",
			"UPD",
			"s"
		);
	});
});

describe("favorites API", () => {
	beforeEach(() => setCurrentUser("U1"));

	test("listFavorites returns rows via callback (and empty for no user)", async () => {
		const cb = jest.fn();
		db.getAllAsync.mockResolvedValueOnce([{ meal_id: "M1" }]);
		await listFavorites(cb);
		expect(cb).toHaveBeenCalledWith([{ meal_id: "M1" }]);

		setCurrentUser(null);
		const cb2 = jest.fn();
		await listFavorites(cb2);
		expect(cb2).toHaveBeenCalledWith([]);
	});

	test("isFavorite checks row existence", async () => {
		db.getFirstAsync.mockResolvedValueOnce(null);
		expect(await isFavorite("M1", "s")).toBe(false);

		db.getFirstAsync.mockResolvedValueOnce({ meal_id: "M1" });
		expect(await isFavorite("M1", "s")).toBe(true);
	});

	test("setFavorite true upserts and marks dirty, false marks deleted", async () => {
		const detail = { idMeal: "M9", strMeal: "Soup", strMealThumb: "U" };

		await setFavorite(detail, true, "s");
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/INSERT INTO meal_favorites/i),
			"U1",
			"M9",
			"s",
			"Soup",
			"U",
			JSON.stringify(detail),
			expect.any(String),
			expect.any(String)
		);

		db.runAsync.mockClear();
		await setFavorite(detail, false, "s");
		expect(db.runAsync).toHaveBeenCalledWith(
			expect.stringMatching(/UPDATE meal_favorites/i),
			expect.any(String),
			"U1",
			"M9",
			"s"
		);
	});

	test("setFavorite throws when no user or no id", async () => {
		setCurrentUser(null);
		await expect(setFavorite({ idMeal: "X" }, true)).rejects.toThrow(
			"No user"
		);
		setCurrentUser("U1");
		await expect(setFavorite({}, true)).rejects.toThrow("No meal id");
	});
});
