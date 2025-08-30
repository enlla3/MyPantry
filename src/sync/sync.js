import * as Network from "expo-network";
import { getToken } from "../api/auth";
import {
	applyRemoteFavs,
	applyRemoteRows,
	getDirtyFavs,
	getDirtyRows,
	getFavsLastPull,
	getLastPullCursor,
	markFavsPushed,
	markPushed,
	setFavsLastPull,
	setLastPullCursor,
	setLastSyncAt,
} from "../db/db";
import { supabase } from "../lib/supabase";

// Push local dirty rows to server
// Collect dirty rows, call pantry_push RPC, mark rows as pushed
async function push(p_token) {
	const dirty = await getDirtyRows();
	if (dirty.length === 0) return { pushed: 0 };

	const items = dirty.map((r) => ({
		id: r.id,
		upc: r.upc,
		name: r.name,
		brand: r.brand,
		qty: r.qty,
		unit: r.unit,
		per_serving: r.per_serving ? JSON.parse(r.per_serving) : {},
		created_at: r.created_at,
		updated_at: r.updated_at,
		deleted: !!r.deleted,
	}));

	const { data, error } = await supabase.rpc("pantry_push", {
		p_token,
		p_items: items,
	});
	if (error) throw new Error(error.message || "push failed");

	await markPushed(dirty.map((r) => r.id));
	return { pushed: dirty.length, server: data };
}

// Pull server changes to local
// Call pantry_pull RPC since last cursor, apply rows and advance cursor
async function pull(p_token) {
	const since = (await getLastPullCursor()) ?? null;
	const { data, error } = await supabase.rpc("pantry_pull", {
		p_token,
		p_since: since,
	});
	if (error) throw new Error(error.message || "pull failed");

	const rows = Array.isArray(data) ? data : [];
	if (rows.length > 0) {
		await applyRemoteRows(rows);
		// advance cursor to latest updated_at we got
		const latest = rows.reduce((acc, r) => {
			if (!acc) return r.updated_at;
			return new Date(r.updated_at) > new Date(acc) ? r.updated_at : acc;
		}, since);
		if (latest) await setLastPullCursor(latest);
	}
	await setLastSyncAt(new Date().toISOString()); // record sync time
	return { pulled: rows.length };
}

// Favourites push
// Push local dirty favourite items to server using favs_push RPC
async function pushFavs(p_token) {
	const dirty = await getDirtyFavs();
	if (dirty.length === 0) return { pushed: 0 };

	const items = dirty.map((r) => ({
		meal_id: r.meal_id,
		source: r.source || "themealdb",
		title: r.title || "",
		thumb: r.thumb || "",
		json: r.json ? JSON.parse(r.json) : {},
		created_at: r.created_at,
		updated_at: r.updated_at,
		deleted: !!r.deleted,
	}));

	const { data, error } = await supabase.rpc("favs_push", {
		p_token,
		p_items: items,
	});
	if (error) throw new Error(error.message || "favs push failed");

	await markFavsPushed(
		items.map((i) => ({ meal_id: i.meal_id, source: i.source }))
	);
	return { pushed: items.length, server: data };
}

// Favourites pull
// Pull remote favourites since last cursor, apply and update cursor
async function pullFavs(p_token) {
	const since = await getFavsLastPull();
	const { data, error } = await supabase.rpc("favs_pull", {
		p_since: since ?? null,
		p_token,
	});
	if (error) throw new Error(error.message || "favs pull failed");
	const rows = Array.isArray(data) ? data : [];
	if (rows.length > 0) {
		await applyRemoteFavs(rows);
		// move cursor to newest updated_at
		const latest = rows.reduce(
			(acc, r) =>
				!acc || new Date(r.updated_at) > new Date(acc)
					? r.updated_at
					: acc,
			since
		);
		if (latest) await setFavsLastPull(latest);
	}
	return { pulled: rows.length };
}

// full sync: network check, auth token, push/pull pantry and favs
export async function syncNow() {
	const net = await Network.getNetworkStateAsync();
	const online =
		!!net?.isConnected &&
		(net.isInternetReachable === null ? true : !!net.isInternetReachable);
	if (!online) return { skipped: "offline" };

	const token = await getToken();
	if (!token) return { skipped: "no-token" };

	const pushRes = await push(token).catch((e) => {
		console.warn("[sync push error]", e?.message || e);
		return { error: e?.message || String(e) };
	});
	const pullRes = await pull(token).catch((e) => {
		console.warn("[sync pull error]", e?.message || e);
		return { error: e?.message || String(e) };
	});

	const favPush = await pushFavs(token).catch((e) => {
		console.warn("[favs push error]", e?.message || e);
		return { error: e?.message || String(e) };
	});
	const favPull = await pullFavs(token).catch((e) => {
		console.warn("[favs pull error]", e?.message || e);
		return { error: e?.message || String(e) };
	});

	return {
		pantry: { push: pushRes, pull: pullRes },
		favs: { push: favPush, pull: favPull },
	};
}
