const mockRPC = jest.fn();
const mockSetItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock("../src/lib/supabase", () => ({
	supabase: { rpc: (...args) => mockRPC(...args) },
}));

jest.mock("expo-secure-store", () => ({
	setItemAsync: (...args) => mockSetItemAsync(...args),
	getItemAsync: (...args) => mockGetItemAsync(...args),
	deleteItemAsync: (...args) => mockDeleteItemAsync(...args),
}));

import {
	fetchMe,
	getToken,
	login,
	logout,
	registerFull,
	requestPasswordReset,
	resetPassword,
} from "../src/api/auth";

beforeEach(() => {
	jest.clearAllMocks();
	mockRPC.mockReset();
	mockSetItemAsync.mockReset();
	mockGetItemAsync.mockReset();
	mockDeleteItemAsync.mockReset();
});

describe("registerFull", () => {
	it("stores token and returns true on success", async () => {
		mockRPC.mockResolvedValueOnce({ data: "tok123", error: null });

		const ok = await registerFull("a@b.com", "pw", "henry", "123");
		expect(ok).toBe(true);

		expect(mockRPC).toHaveBeenCalledWith("auth_register_full", {
			p_email: "a@b.com",
			p_password: "pw",
			p_username: "henry",
			p_phone: "123",
		});
		expect(mockSetItemAsync).toHaveBeenCalledWith(
			"session_token",
			"tok123"
		);
	});

	it("throws server error message", async () => {
		mockRPC.mockResolvedValueOnce({
			data: null,
			error: { message: "register oops" },
		});
		await expect(registerFull("a@b.com", "pw", "h", "1")).rejects.toThrow(
			"register oops"
		);
		expect(mockSetItemAsync).not.toHaveBeenCalled();
	});
});

describe("login", () => {
	it("stores token and returns true on success", async () => {
		mockRPC.mockResolvedValueOnce({ data: "tokL", error: null });
		const ok = await login("a@b.com", "pw");
		expect(ok).toBe(true);
		expect(mockRPC).toHaveBeenCalledWith("auth_login", {
			p_email: "a@b.com",
			p_password: "pw",
		});
		expect(mockSetItemAsync).toHaveBeenCalledWith("session_token", "tokL");
	});

	it("throws 'login failed' when server has no message", async () => {
		mockRPC.mockResolvedValueOnce({ data: null, error: {} });
		await expect(login("a@b.com", "pw")).rejects.toThrow("login failed");
	});
});

describe("getToken / logout", () => {
	it("getToken returns stored value", async () => {
		mockGetItemAsync.mockResolvedValueOnce("TOK");
		await expect(getToken()).resolves.toBe("TOK");
		expect(mockGetItemAsync).toHaveBeenCalledWith("session_token");
	});

	it("logout deletes token", async () => {
		mockDeleteItemAsync.mockResolvedValueOnce(undefined);
		await logout();
		expect(mockDeleteItemAsync).toHaveBeenCalledWith("session_token");
	});
});

describe("fetchMe", () => {
	it("returns null when no token", async () => {
		mockGetItemAsync.mockResolvedValueOnce(null);
		const me = await fetchMe();
		expect(me).toBeNull();
		expect(mockRPC).not.toHaveBeenCalled();
	});

	it("throws server message on error", async () => {
		mockGetItemAsync.mockResolvedValueOnce("TKN");
		mockRPC.mockResolvedValueOnce({
			data: null,
			error: { message: "bad" },
		});
		await expect(fetchMe()).rejects.toThrow("bad");
	});

	it("maps various id field names to id", async () => {
		mockGetItemAsync.mockResolvedValueOnce("TKN");

		// object result with user_id
		mockRPC.mockResolvedValueOnce({
			data: {
				user_id: "U1",
				email: "e@x",
				username: "henry",
				phone: "1",
			},
			error: null,
		});
		let me = await fetchMe();
		expect(me).toEqual({
			id: "U1",
			email: "e@x",
			username: "henry",
			phone: "1",
		});

		// array result with uid only
		mockGetItemAsync.mockResolvedValueOnce("TKN");
		mockRPC.mockResolvedValueOnce({
			data: [{ uid: "U2", email: "a@b" }],
			error: null,
		});
		me = await fetchMe();
		expect(me).toEqual({
			id: "U2",
			email: "a@b",
			username: null,
			phone: null,
		});
	});
});

describe("password flows", () => {
	it("requestPasswordReset returns true; throws on error", async () => {
		mockRPC.mockResolvedValueOnce({ data: true, error: null });
		await expect(requestPasswordReset("a@b.com")).resolves.toBe(true);
		expect(mockRPC).toHaveBeenCalledWith("auth_request_password_reset", {
			p_email: "a@b.com",
		});

		mockRPC.mockResolvedValueOnce({ data: null, error: {} });
		await expect(requestPasswordReset("a@b.com")).rejects.toThrow(
			"request failed"
		);
	});

	it("resetPassword returns true; throws message/generic", async () => {
		mockRPC.mockResolvedValueOnce({ data: true, error: null });
		await expect(resetPassword("a@b.com", "123456", "newpw")).resolves.toBe(
			true
		);
		expect(mockRPC).toHaveBeenCalledWith("auth_reset_password", {
			p_email: "a@b.com",
			p_code: "123456",
			p_new_password: "newpw",
		});

		mockRPC.mockResolvedValueOnce({
			data: null,
			error: { message: "nope" },
		});
		await expect(resetPassword("a@b.com", "1", "p")).rejects.toThrow(
			"nope"
		);
	});
});
