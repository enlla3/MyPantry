import { supabase } from "../lib/supabase";
import { getToken } from "./auth";

// Update the user profile by invoking the Supabase RPC "profile_update"

export async function updateProfile({ username, phone }) {
	const token = await getToken();
	if (!token) throw new Error("Not logged in");
	const { data, error } = await supabase.rpc("profile_update", {
		p_token: token,
		p_username: username || "",
		p_phone: phone || "",
	});
	if (error) throw new Error(error.message || "update failed");
	return true;
}
