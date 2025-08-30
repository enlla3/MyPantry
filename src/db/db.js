import * as SQLite from "expo-sqlite";

let currentUserId = null;
// Set the current authenticated user id
export function setCurrentUser(userId) {
	currentUserId = userId || null;
}

const dbReady = (async () => {
	const db = await SQLite.openDatabaseAsync("foodlens.db");

	// Apply schema and indexes
	await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pantry_items (
      id TEXT PRIMARY KEY NOT NULL,   -- user-scoped id, e.g. userId|<upc_or_manual>
      upc TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      qty REAL NOT NULL DEFAULT 0,
      unit TEXT,
      per_serving TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      user_id TEXT,
      dirty INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pantry_user ON pantry_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_pantry_upc ON pantry_items(upc);

    -- simple kv for sync cursors (per user)
    CREATE TABLE IF NOT EXISTS sync_state (
      k TEXT PRIMARY KEY NOT NULL,
      v TEXT NOT NULL
    );

    -- cache for normalized UPC lookups (shared across users)
    CREATE TABLE IF NOT EXISTS upc_cache (
      upc TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_upc_cache_time ON upc_cache(fetched_at);

    -- favourites (meals)
    CREATE TABLE IF NOT EXISTS meal_favorites (
      user_id   TEXT NOT NULL,
      meal_id   TEXT NOT NULL,
      source    TEXT NOT NULL DEFAULT 'themealdb',
      title     TEXT,
      thumb     TEXT,
      json      TEXT,             -- cached full detail JSON (stringified)
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,   -- for sync conflict resolution
      dirty      INTEGER NOT NULL DEFAULT 0, -- pending push
      deleted    INTEGER NOT NULL DEFAULT 0, -- soft delete
      PRIMARY KEY (user_id, meal_id, source)
    );
    CREATE INDEX IF NOT EXISTS idx_favs_user ON meal_favorites(user_id);
  `);

	// add missing columns if older DB versions exist
	const cols = await db.getAllAsync(`PRAGMA table_info('pantry_items')`);
	const has = (name) => cols.some((c) => c.name === name);

	if (!has("user_id")) {
		await db.execAsync(`ALTER TABLE pantry_items ADD COLUMN user_id TEXT`);
	}
	if (!has("dirty")) {
		await db.execAsync(`ALTER TABLE pantry_items ADD COLUMN dirty INTEGER`);
		await db.execAsync(
			`UPDATE pantry_items SET dirty=0 WHERE dirty IS NULL`
		);
	}
	if (!has("deleted")) {
		await db.execAsync(
			`ALTER TABLE pantry_items ADD COLUMN deleted INTEGER`
		);
		await db.execAsync(
			`UPDATE pantry_items SET deleted=0 WHERE deleted IS NULL`
		);
	}

	// ensure indexes
	await db.execAsync(
		`CREATE INDEX IF NOT EXISTS idx_pantry_user ON pantry_items(user_id)`
	);
	await db.execAsync(
		`CREATE INDEX IF NOT EXISTS idx_pantry_upc ON pantry_items(upc)`
	);

	// Add columns to meal_favorites if they don't exist
	const favCols = await db.getAllAsync(`PRAGMA table_info('meal_favorites')`);
	const favHas = (name) => favCols.some((c) => c.name === name);

	if (!favHas("updated_at")) {
		await db.execAsync(
			`ALTER TABLE meal_favorites ADD COLUMN updated_at TEXT`
		);
		await db.execAsync(`
      UPDATE meal_favorites
         SET updated_at = COALESCE(updated_at, datetime('now'))
       WHERE updated_at IS NULL
    `);
	}
	if (!favHas("dirty")) {
		await db.execAsync(
			`ALTER TABLE meal_favorites ADD COLUMN dirty INTEGER`
		);
		await db.execAsync(`
      UPDATE meal_favorites
         SET dirty = COALESCE(dirty, 0)
       WHERE dirty IS NULL
    `);
	}
	if (!favHas("deleted")) {
		await db.execAsync(
			`ALTER TABLE meal_favorites ADD COLUMN deleted INTEGER`
		);
		await db.execAsync(`
      UPDATE meal_favorites
         SET deleted = COALESCE(deleted, 0)
       WHERE deleted IS NULL
    `);
	}

	return db;
})();

const nowISO = () => new Date().toISOString();

// key/value store for sync cursors, per user keys are stored by prefix.
async function kvGet(key) {
	const db = await dbReady;
	const row = await db.getFirstAsync(
		`SELECT v FROM sync_state WHERE k=?`,
		key
	);
	return row?.v ?? null;
}
async function kvSet(key, value) {
	const db = await dbReady;
	await db.runAsync(
		`INSERT INTO sync_state(k,v) VALUES(?,?)
     ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
		key,
		value
	);
}

// last pull/push cursors per user
export async function getLastPullCursor() {
	if (!currentUserId) return null;
	return kvGet(`pantry:last_pull:${currentUserId}`);
}
export async function setLastPullCursor(iso) {
	if (!currentUserId) return null;
	return kvSet(`pantry:last_pull:${currentUserId}`, iso);
}

// Track the last time a pull completed
export async function getLastSyncAt() {
	if (!currentUserId) return null;
	return kvGet(`pantry:last_sync_at:${currentUserId}`);
}
export async function setLastSyncAt(iso) {
	if (!currentUserId) return null;
	return kvSet(`pantry:last_sync_at:${currentUserId}`, iso);
}

// List pantry items for current user
export async function listItems(cb) {
	try {
		if (!currentUserId) {
			cb([]);
			return;
		}
		const db = await dbReady;
		// Claim orphans for current user
		await db
			.runAsync(
				`UPDATE pantry_items SET user_id=?
       WHERE (user_id IS NULL OR user_id='')`,
				currentUserId
			)
			.catch(() => {});
		const rows = await db.getAllAsync(
			`SELECT * FROM pantry_items
        WHERE user_id=? AND deleted=0
        ORDER BY created_at DESC`,
			currentUserId
		);
		cb(rows || []);
	} catch (err) {
		console.warn("listItems error", err);
		cb([]);
	}
}

// Update quantity for an item, mark dirty for sync.
export async function updateQty(id, newQty) {
	if (!currentUserId) throw new Error("No user");
	const db = await dbReady;
	await db.runAsync(
		`UPDATE pantry_items
        SET qty=?, updated_at=?, dirty=1
      WHERE id=? AND user_id=?`,
		newQty,
		nowISO(),
		id,
		currentUserId
	);
	return true;
}

// soft-delete locally
export async function removeItem(id) {
	if (!currentUserId) throw new Error("No user");
	const db = await dbReady;
	await db.runAsync(
		`UPDATE pantry_items
        SET deleted=1, dirty=1, updated_at=?
      WHERE id=? AND user_id=?`,
		nowISO(),
		id,
		currentUserId
	);
	return true;
}

// Add item from a product, merge with existing by upc or user-scoped id.
export async function addOrMergeItemFromProduct(product, addQty = 1) {
	if (!currentUserId) throw new Error("No user");
	const { upc, name, brand, serving_unit, nutrients } = product;
	const baseId = upc || `manual_${Date.now()}`;
	const id = `${currentUserId}|${baseId}`;
	const per_serving = JSON.stringify(nutrients || {});
	const ts = nowISO();
	const unit = serving_unit || "serving";

	const db = await dbReady;

	// try existing
	const existing = await db.getFirstAsync(
		`SELECT id, qty FROM pantry_items
      WHERE user_id=? AND deleted=0
        AND (id=? OR (upc IS NOT NULL AND upc=?))
      LIMIT 1`,
		currentUserId,
		id,
		upc || ""
	);

	if (existing) {
		const newQty = (existing.qty || 0) + (addQty || 1);
		await db.runAsync(
			`UPDATE pantry_items
          SET id=?, qty=?, updated_at=?, dirty=1, user_id=?
        WHERE rowid IN (
          SELECT rowid FROM pantry_items
           WHERE user_id=? AND (id=? OR upc=?)
           LIMIT 1
        )`,
			id,
			newQty,
			nowISO(),
			currentUserId,
			currentUserId,
			existing.id,
			upc || ""
		);
		return { id, merged: true, qty: newQty };
	} else {
		await db.runAsync(
			`INSERT INTO pantry_items
        (id, upc, name, brand, qty, unit, per_serving, created_at, updated_at, user_id, dirty, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
			id,
			upc || null,
			name,
			brand || null,
			addQty || 1,
			unit,
			per_serving,
			ts,
			ts,
			currentUserId
		);
		return { id, merged: false, qty: addQty || 1 };
	}
}

// Get rows marked dirty for push
export async function getDirtyRows() {
	if (!currentUserId) return [];
	const db = await dbReady;
	return db.getAllAsync(
		`SELECT * FROM pantry_items WHERE user_id=? AND dirty=1`,
		currentUserId
	);
}

// Mark items as pushed, clear dirty, hard-delete those marked deleted.
export async function markPushed(ids) {
	if (!currentUserId || ids.length === 0) return;
	const db = await dbReady;
	const qMarks = ids.map(() => "?").join(",");
	// which are deleted?
	const delRows = await db.getAllAsync(
		`SELECT id FROM pantry_items
      WHERE user_id=? AND id IN (${qMarks}) AND deleted=1`,
		currentUserId,
		...ids
	);
	const toDelete = new Set(delRows.map((r) => r.id));
	await db.runAsync(
		`UPDATE pantry_items SET dirty=0
      WHERE user_id=? AND id IN (${qMarks})`,
		currentUserId,
		...ids
	);
	if (toDelete.size > 0) {
		const delIds = [...toDelete];
		const marks = delIds.map(() => "?").join(",");
		await db.runAsync(
			`DELETE FROM pantry_items
        WHERE user_id=? AND id IN (${marks})`,
			currentUserId,
			...delIds
		);
	}
}

// Apply rows received from server, server is used unless local has newer dirty changes.
export async function applyRemoteRows(rows) {
	if (!currentUserId || !Array.isArray(rows) || rows.length === 0) return;
	const db = await dbReady;

	for (const r of rows) {
		const id = r.id;
		const remoteUpdated = r.updated_at;
		const isDeleted = !!r.deleted;

		const local = await db.getFirstAsync(
			`SELECT id, updated_at, dirty
         FROM pantry_items
        WHERE user_id=? AND id=?`,
			currentUserId,
			id
		);

		if (isDeleted) {
			await db.runAsync(
				`DELETE FROM pantry_items WHERE user_id=? AND id=?`,
				currentUserId,
				id
			);
			continue;
		}

		if (!local) {
			await db.runAsync(
				`INSERT INTO pantry_items
           (id,user_id,upc,name,brand,qty,unit,per_serving,created_at,updated_at,dirty,deleted)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,0)`,
				id,
				currentUserId,
				r.upc || null,
				r.name,
				r.brand || null,
				r.qty || 0,
				r.unit || null,
				JSON.stringify(r.per_serving || {}),
				r.created_at,
				remoteUpdated
			);
		} else {
			const localNewer =
				new Date(local.updated_at).getTime() >
					new Date(remoteUpdated).getTime() && local.dirty === 1;
			if (!localNewer) {
				await db.runAsync(
					`UPDATE pantry_items SET
              upc=?, name=?, brand=?, qty=?, unit=?, per_serving=?,
              updated_at=?, dirty=0, deleted=0
            WHERE user_id=? AND id=?`,
					r.upc || null,
					r.name,
					r.brand || null,
					r.qty || 0,
					r.unit || null,
					JSON.stringify(r.per_serving || {}),
					remoteUpdated,
					currentUserId,
					id
				);
			}
		}
	}
}

// TTL-based cache for UPC lookups, shared across all users.
export async function getCachedUPC(upc, ttlDays = 30) {
	const db = await dbReady;
	const row = await db.getFirstAsync(
		`SELECT json, fetched_at FROM upc_cache WHERE upc=?`,
		upc
	);
	if (!row) return null;

	if (ttlDays > 0) {
		const ageMs = Date.now() - new Date(row.fetched_at).getTime();
		if (ageMs > ttlDays * 86400_000) return null;
	}
	try {
		return JSON.parse(row.json);
	} catch {
		return null;
	}
}

export async function putCachedUPC(upc, payload) {
	const db = await dbReady;
	await db.runAsync(
		`INSERT INTO upc_cache(upc, json, fetched_at)
         VALUES(?, ?, ?)
     ON CONFLICT(upc)
       DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at`,
		upc,
		JSON.stringify(payload || {}),
		nowISO()
	);
}

// query of user's favourite meals
export async function listFavorites(cb) {
	if (!currentUserId) {
		cb([]);
		return;
	}
	const db = await dbReady;
	const rows = await db.getAllAsync(
		`SELECT * FROM meal_favorites
      WHERE user_id=? AND deleted=0
      ORDER BY created_at DESC`,
		currentUserId
	);
	cb(rows || []);
}

// Check if a meal is favourited by the current user.
export async function isFavorite(mealId, source = "themealdb") {
	if (!currentUserId) return false;
	const db = await dbReady;
	const row = await db.getFirstAsync(
		`SELECT meal_id FROM meal_favorites
      WHERE user_id=? AND meal_id=? AND source=? AND deleted=0`,
		currentUserId,
		mealId,
		source
	);
	return !!row;
}

// Set or unset favourite, marks dirty for sync.
export async function setFavorite(mealDetail, flag, source = "themealdb") {
	if (!currentUserId) throw new Error("No user");
	const db = await dbReady;
	const id = mealDetail.idMeal || mealDetail.meal_id || mealDetail.id;
	if (!id) throw new Error("No meal id");
	const ts = nowISO();

	if (flag) {
		await db.runAsync(
			`INSERT INTO meal_favorites
         (user_id, meal_id, source, title, thumb, json, created_at, updated_at, dirty, deleted)
       VALUES(?,?,?,?,?,?,?,?,1,0)
       ON CONFLICT(user_id, meal_id, source) DO UPDATE SET
         title=excluded.title,
         thumb=excluded.thumb,
         json=excluded.json,
         updated_at=excluded.updated_at,
         dirty=1,
         deleted=0`,
			currentUserId,
			String(id),
			source,
			mealDetail.strMeal || mealDetail.title || "",
			mealDetail.strMealThumb || mealDetail.thumb || "",
			JSON.stringify(mealDetail),
			ts,
			ts
		);
	} else {
		await db.runAsync(
			`UPDATE meal_favorites
          SET deleted=1, dirty=1, updated_at=?
        WHERE user_id=? AND meal_id=? AND source=?`,
			ts,
			currentUserId,
			String(id),
			source
		);
	}
	return true;
}

// Favourites sync state
export async function getFavsLastPull() {
	if (!currentUserId) return null;
	return kvGet(`favs:last_pull:${currentUserId}`);
}
export async function setFavsLastPull(iso) {
	if (!currentUserId) return null;
	return kvSet(`favs:last_pull:${currentUserId}`, iso);
}

// Favourites, dirty rows for push
export async function getDirtyFavs() {
	if (!currentUserId) return [];
	const db = await dbReady;
	return db.getAllAsync(
		`SELECT * FROM meal_favorites WHERE user_id=? AND dirty=1`,
		currentUserId
	);
}

// Clear dirty flag and remove any rows that were soft-deleted after push.
export async function markFavsPushed(keys /* [{meal_id, source}] */) {
	if (!currentUserId || !Array.isArray(keys) || keys.length === 0) return;
	const db = await dbReady;

	for (const k of keys) {
		const meal_id = String(k.meal_id);
		const source = k.source || "themealdb";
		await db.runAsync(
			`UPDATE meal_favorites
          SET dirty=0
        WHERE user_id=? AND meal_id=? AND source=?`,
			currentUserId,
			meal_id,
			source
		);
		await db.runAsync(
			`DELETE FROM meal_favorites
         WHERE user_id=? AND meal_id=? AND source=? AND deleted=1`,
			currentUserId,
			meal_id,
			source
		);
	}
}

// Merge server rows into local DB, respecting local dirty newer changes.
export async function applyRemoteFavs(rows) {
	if (!currentUserId || !Array.isArray(rows) || rows.length === 0) return;
	const db = await dbReady;

	for (const r of rows) {
		const meal_id = String(r.meal_id);
		const source = r.source || "themealdb";
		const remoteUpdated = r.updated_at || nowISO();
		const isDeleted = !!r.deleted;

		const local = await db.getFirstAsync(
			`SELECT updated_at, dirty
         FROM meal_favorites
        WHERE user_id=? AND meal_id=? AND source=?`,
			currentUserId,
			meal_id,
			source
		);

		if (isDeleted) {
			await db.runAsync(
				`DELETE FROM meal_favorites
          WHERE user_id=? AND meal_id=? AND source=?`,
				currentUserId,
				meal_id,
				source
			);
			continue;
		}

		const jsonText =
			typeof r.json === "string"
				? r.json
				: r.json
					? JSON.stringify(r.json)
					: "{}";

		if (!local) {
			await db.runAsync(
				`INSERT INTO meal_favorites
           (user_id, meal_id, source, title, thumb, json, created_at, updated_at, dirty, deleted)
         VALUES (?,?,?,?,?,?,?,?,0,0)`,
				currentUserId,
				meal_id,
				source,
				r.title || "",
				r.thumb || "",
				jsonText,
				r.created_at || remoteUpdated,
				remoteUpdated
			);
		} else {
			const localNewer =
				new Date(local.updated_at).getTime() >
					new Date(remoteUpdated).getTime() && local.dirty === 1;
			if (!localNewer) {
				await db.runAsync(
					`UPDATE meal_favorites
              SET title=?, thumb=?, json=?, updated_at=?, dirty=0, deleted=0
            WHERE user_id=? AND meal_id=? AND source=?`,
					r.title || "",
					r.thumb || "",
					jsonText,
					remoteUpdated,
					currentUserId,
					meal_id,
					source
				);
			}
		}
	}
}
