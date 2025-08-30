const mockSupabaseRpc = jest.fn();
const mockGetToken = jest.fn();

// Mock the modules before importing the SUT
jest.mock("../src/lib/supabase", () => ({
	supabase: { rpc: (...args) => mockSupabaseRpc(...args) },
}));

jest.mock("../src/api/auth", () => ({
	getToken: (...args) => mockGetToken(...args),
}));

import { updateProfile } from "../src/api/profile";

beforeEach(() => {
	jest.clearAllMocks();
});

describe("updateProfile", () => {
	it("throws when not logged in", async () => {
		mockGetToken.mockResolvedValueOnce(null);

		await expect(
			updateProfile({ username: "a", phone: "b" })
		).rejects.toThrow("Not logged in");

		expect(mockSupabaseRpc).not.toHaveBeenCalled();
	});

	it("calls profile_update with provided username/phone", async () => {
		mockGetToken.mockResolvedValueOnce("TOKEN123");
		mockSupabaseRpc.mockResolvedValueOnce({ data: true, error: null });

		const ok = await updateProfile({ username: "henry", phone: "123456" });
		expect(ok).toBe(true);

		expect(mockSupabaseRpc).toHaveBeenCalledWith("profile_update", {
			p_token: "TOKEN123",
			p_username: "henry",
			p_phone: "123456",
		});
	});

	it("uses empty strings when fields are missing", async () => {
		mockGetToken.mockResolvedValueOnce("TKN");
		mockSupabaseRpc.mockResolvedValueOnce({ data: true, error: null });

		await updateProfile({}); // no fields

		expect(mockSupabaseRpc).toHaveBeenCalledWith("profile_update", {
			p_token: "TKN",
			p_username: "",
			p_phone: "",
		});
	});

	it("throws server error message when Supabase returns error.message", async () => {
		mockGetToken.mockResolvedValueOnce("TKN");
		mockSupabaseRpc.mockResolvedValueOnce({
			data: null,
			error: { message: "update blew up" },
		});

		await expect(updateProfile({ username: "x" })).rejects.toThrow(
			"update blew up"
		);
	});

	it('throws generic "update failed" when error has no message', async () => {
		mockGetToken.mockResolvedValueOnce("TKN");
		mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: {} });

		await expect(updateProfile({ username: "x" })).rejects.toThrow(
			"update failed"
		);
	});
});
