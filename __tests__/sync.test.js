const realWarn = console.warn;
beforeAll(() => {
	console.warn = jest.fn();
});
afterAll(() => {
	console.warn = realWarn;
});

const mockGetNetworkStateAsync = jest.fn();
const mockGetToken = jest.fn();
const mockRPC = jest.fn();

// DB mocks
const mockApplyRemoteRows = jest.fn();
const mockApplyRemoteFavs = jest.fn();
const mockGetDirtyRows = jest.fn();
const mockMarkPushed = jest.fn();
const mockGetLastPullCursor = jest.fn();
const mockSetLastPullCursor = jest.fn();
const mockSetLastSyncAt = jest.fn();

const mockGetDirtyFavs = jest.fn();
const mockMarkFavsPushed = jest.fn();
const mockGetFavsLastPull = jest.fn();
const mockSetFavsLastPull = jest.fn();

// Mock modules before importing the SUT
jest.mock("expo-network", () => ({
	getNetworkStateAsync: (...args) => mockGetNetworkStateAsync(...args),
}));

jest.mock("../src/api/auth", () => ({
	getToken: (...args) => mockGetToken(...args),
}));

jest.mock("../src/db/db", () => ({
	applyRemoteFavs: (...args) => mockApplyRemoteFavs(...args),
	applyRemoteRows: (...args) => mockApplyRemoteRows(...args),
	getDirtyFavs: (...args) => mockGetDirtyFavs(...args),
	getDirtyRows: (...args) => mockGetDirtyRows(...args),
	getFavsLastPull: (...args) => mockGetFavsLastPull(...args),
	getLastPullCursor: (...args) => mockGetLastPullCursor(...args),
	markFavsPushed: (...args) => mockMarkFavsPushed(...args),
	markPushed: (...args) => mockMarkPushed(...args),
	setFavsLastPull: (...args) => mockSetFavsLastPull(...args),
	setLastPullCursor: (...args) => mockSetLastPullCursor(...args),
	setLastSyncAt: (...args) => mockSetLastSyncAt(...args),
}));

jest.mock("../src/lib/supabase", () => ({
	supabase: { rpc: (...args) => mockRPC(...args) },
}));

import { syncNow } from "../src/sync/sync";

beforeEach(() => {
	jest.clearAllMocks();
	mockGetNetworkStateAsync.mockReset();
	mockGetToken.mockReset();
	mockRPC.mockReset();

	mockApplyRemoteRows.mockReset();
	mockApplyRemoteFavs.mockReset();
	mockGetDirtyRows.mockReset();
	mockMarkPushed.mockReset();
	mockGetLastPullCursor.mockReset();
	mockSetLastPullCursor.mockReset();
	mockSetLastSyncAt.mockReset();

	mockGetDirtyFavs.mockReset();
	mockMarkFavsPushed.mockReset();
	mockGetFavsLastPull.mockReset();
	mockSetFavsLastPull.mockReset();
});

test("returns skipped: offline when not online", async () => {
	mockGetNetworkStateAsync.mockResolvedValue({
		isConnected: false,
		isInternetReachable: true,
	});
	const res = await syncNow();
	expect(res).toEqual({ skipped: "offline" });
	expect(mockGetToken).not.toHaveBeenCalled();
});

test("returns skipped: no-token when online but not logged in", async () => {
	mockGetNetworkStateAsync.mockResolvedValue({
		isConnected: true,
		isInternetReachable: true,
	});
	mockGetToken.mockResolvedValue(null);
	const res = await syncNow();
	expect(res).toEqual({ skipped: "no-token" });
	expect(mockRPC).not.toHaveBeenCalled();
});

test("happy path: pushes/pulls pantry and favs with correct RPCs and DB updates", async () => {
	// Online and token
	mockGetNetworkStateAsync.mockResolvedValue({
		isConnected: true,
		isInternetReachable: null,
	}); // null ==> treated online
	mockGetToken.mockResolvedValue("TKN");

	// Pantry push, 2 dirty rows
	mockGetDirtyRows.mockResolvedValue([
		{
			id: 1,
			upc: "111",
			name: "Item1",
			brand: "B",
			qty: 2,
			unit: "g",
			per_serving: JSON.stringify({ kcal: 10 }),
			created_at: "2024-01-01",
			updated_at: "2024-01-02",
			deleted: 0,
		},
		{
			id: 2,
			upc: "222",
			name: "Item2",
			brand: "C",
			qty: 1,
			unit: "ml",
			per_serving: null,
			created_at: "2024-01-03",
			updated_at: "2024-01-04",
			deleted: 1,
		},
	]);

	// pantry_push
	mockRPC.mockResolvedValueOnce({ data: { ok: true }, error: null });

	// Pantry pull
	mockGetLastPullCursor.mockResolvedValue("2024-01-02T00:00:00Z");
	mockRPC.mockResolvedValueOnce({
		data: [
			{ id: 1, updated_at: "2024-01-10T00:00:00Z" },
			{ id: 3, updated_at: "2024-02-01T00:00:00Z" },
		],
		error: null,
	});

	// Favs push, 1 dirty fav
	mockGetDirtyFavs.mockResolvedValue([
		{
			meal_id: "A1",
			source: "themealdb",
			title: "Soup",
			thumb: "u",
			json: JSON.stringify({ cat: "soup" }),
			created_at: "2024-01-05",
			updated_at: "2024-01-06",
			deleted: 0,
		},
	]);
	mockRPC.mockResolvedValueOnce({ data: { ok: true }, error: null }); // favs_push

	// Favs pull
	mockGetFavsLastPull.mockResolvedValue("2024-01-01T00:00:00Z");
	mockRPC.mockResolvedValueOnce({
		data: [{ meal_id: "Z9", updated_at: "2024-02-02T00:00:00Z" }],
		error: null,
	});

	const res = await syncNow();

	// Return shape
	expect(res).toEqual({
		pantry: {
			push: { pushed: 2, server: { ok: true } },
			pull: { pulled: 2 },
		},
		favs: {
			push: { pushed: 1, server: { ok: true } },
			pull: { pulled: 1 },
		},
	});

	// pantry_push
	expect(mockRPC.mock.calls[0][0]).toBe("pantry_push");
	expect(mockRPC.mock.calls[0][1]).toMatchObject({
		p_token: "TKN",
		p_items: [
			expect.objectContaining({
				id: 1,
				per_serving: { kcal: 10 },
				deleted: false,
			}),
			expect.objectContaining({ id: 2, per_serving: {}, deleted: true }),
		],
	});
	expect(mockMarkPushed).toHaveBeenCalledWith([1, 2]);

	// pantry_pull
	expect(mockRPC.mock.calls[1][0]).toBe("pantry_pull");
	expect(mockRPC.mock.calls[1][1]).toEqual({
		p_token: "TKN",
		p_since: "2024-01-02T00:00:00Z",
	});
	expect(mockApplyRemoteRows).toHaveBeenCalledWith([
		{ id: 1, updated_at: "2024-01-10T00:00:00Z" },
		{ id: 3, updated_at: "2024-02-01T00:00:00Z" },
	]);
	expect(mockSetLastPullCursor).toHaveBeenCalledWith("2024-02-01T00:00:00Z");

	// favs_push
	expect(mockRPC.mock.calls[2][0]).toBe("favs_push");
	expect(mockRPC.mock.calls[2][1]).toMatchObject({
		p_token: "TKN",
		p_items: [
			expect.objectContaining({
				meal_id: "A1",
				source: "themealdb",
				deleted: false,
			}),
		],
	});
	expect(mockMarkFavsPushed).toHaveBeenCalledWith([
		{ meal_id: "A1", source: "themealdb" },
	]);

	// favs_pull
	expect(mockRPC.mock.calls[3][0]).toBe("favs_pull");
	expect(mockRPC.mock.calls[3][1]).toEqual({
		p_since: "2024-01-01T00:00:00Z",
		p_token: "TKN",
	});
	expect(mockApplyRemoteFavs).toHaveBeenCalledWith([
		{ meal_id: "Z9", updated_at: "2024-02-02T00:00:00Z" },
	]);
	expect(mockSetFavsLastPull).toHaveBeenCalledWith("2024-02-02T00:00:00Z");
});

test("errors are caught and surfaced per section (push/pull for pantry & favs)", async () => {
	mockGetNetworkStateAsync.mockResolvedValue({
		isConnected: true,
		isInternetReachable: true,
	});
	mockGetToken.mockResolvedValue("TKN");

	// Pantry push error
	mockGetDirtyRows.mockResolvedValue([
		{
			id: 1,
			per_serving: "{}",
			upc: "1",
			name: "A",
			brand: "",
			qty: 1,
			unit: "u",
			created_at: "",
			updated_at: "",
			deleted: 0,
		},
	]);
	mockRPC.mockResolvedValueOnce({
		data: null,
		error: { message: "push busted" },
	});

	// Pantry pull error
	mockGetLastPullCursor.mockResolvedValue(null);
	mockRPC.mockResolvedValueOnce({
		data: null,
		error: { message: "pull busted" },
	});

	// Favs push error
	mockGetDirtyFavs.mockResolvedValue([{ meal_id: "M1", source: "s" }]);
	mockRPC.mockResolvedValueOnce({
		data: null,
		error: { message: "favs push busted" },
	});

	// Favs pull error
	mockGetFavsLastPull.mockResolvedValue(null);
	mockRPC.mockResolvedValueOnce({
		data: null,
		error: { message: "favs pull busted" },
	});

	const res = await syncNow();
	expect(res.pantry.push).toEqual({ error: "push busted" });
	expect(res.pantry.pull).toEqual({ error: "pull busted" });
	expect(res.favs.push).toEqual({ error: "favs push busted" });
	expect(res.favs.pull).toEqual({ error: "favs pull busted" });
});
