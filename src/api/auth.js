import * as SecureStore from "expo-secure-store";
import { supabase } from "../lib/supabase";

const TOKEN_KEY = "session_token"; // key to store session token

// Register a new user via Supabase RPC and store returned token
export async function registerFull(email, password, username, phone) {
	// call postgres RPC to register
	const { data, error } = await supabase.rpc("auth_register_full", {
		p_email: email,
		p_password: password,
		p_username: username,
		p_phone: phone,
	});
	if (error) throw new Error(error.message || "register failed");
	// persist token securely on device
	await SecureStore.setItemAsync(TOKEN_KEY, data);
	return true;
}

// Login user via RPC and store returned token
export async function login(email, password) {
	const { data, error } = await supabase.rpc("auth_login", {
		p_email: email,
		p_password: password,
	});
	if (error) throw new Error(error.message || "login failed");
	// persist token securely on device
	await SecureStore.setItemAsync(TOKEN_KEY, data);
	return true;
}

// Retrieve stored token from secure storage
export async function getToken() {
	return SecureStore.getItemAsync(TOKEN_KEY);
}

// Remove stored token (logout)
export async function logout() {
	await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Fetch current user info using stored token via RPC
export async function fetchMe() {
	const token = await getToken();
	if (!token) return null;

	const { data, error } = await supabase.rpc("auth_me", { p_token: token });
	if (error) throw new Error(error.message || "me failed");

	// RPC can return an array or a single
	const raw = Array.isArray(data) ? data[0] : data;
	if (!raw) return null;

	// Normalize to ensure .id is present
	const id = raw.id ?? raw.user_id ?? raw.uid ?? raw.uuid ?? null;

	return {
		id,
		email: raw.email ?? null,
		username: raw.username ?? null,
		phone: raw.phone ?? null,
	};
}

// Request a password reset email via RPC
export async function requestPasswordReset(email) {
	const { data, error } = await supabase.rpc("auth_request_password_reset", {
		p_email: email,
	});
	if (error) throw new Error(error.message || "request failed");
	return true;
}

// Reset password using code sent to user's email
export async function resetPassword(email, code, newPassword) {
	const { data, error } = await supabase.rpc("auth_reset_password", {
		p_email: email,
		p_code: code,
		p_new_password: newPassword,
	});
	if (error) throw new Error(error.message || "reset failed");
	return true;
}
