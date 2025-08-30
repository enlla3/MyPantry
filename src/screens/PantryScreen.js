import { useFocusEffect } from "@react-navigation/native";
import React from "react";
import {
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    getLastPullCursor,
    getLastSyncAt,
    listItems,
    removeItem,
    updateQty,
} from "../db/db";
import { syncNow } from "../sync/sync";
import { useTabBarSafePadding } from "../ui/layout";

// render nutrient info per serving
function NutrientLine({ perServing }) {
    let n = {};
    // parse JSON string if present
    try {
        n = perServing ? JSON.parse(perServing) : {};
    } catch {}
    // build readable pieces
    const bits = [];
    if (n.kcal != null) bits.push(`${Math.round(n.kcal)} kcal`);
    if (n.protein != null) bits.push(`${n.protein}g protein`);
    if (n.carbs != null) bits.push(`${n.carbs}g carbs`);
    if (n.fat != null) bits.push(`${n.fat}g fat`);
    if (bits.length === 0) return null;
    return (
        <Text className="text-xs text-neutral-500 mt-1">
            {bits.join(" · ")}
        </Text>
    );
}

// single item row with controls
function ItemRow({ item, onInc, onDec, onDelete }) {
    return (
        <View className="bg-white rounded-2xl px-4 py-3 mx-4 mb-3 border border-neutral-200">
            <View className="flex-row justify-between items-center">
                <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-black">
                        {item.brand ? `${item.brand} ` : ""}
                        {item.name}
                    </Text>
                    {item.unit ? (
                        <Text className="text-xs text-neutral-500 mt-0.5">
                            {item.qty} {item.unit}
                            {item.qty === 1 ? "" : "s"}
                        </Text>
                    ) : (
                        <Text className="text-xs text-neutral-500 mt-0.5">
                            {item.qty}
                        </Text>
                    )}
                    <NutrientLine perServing={item.per_serving} />
                </View>

                <View className="items-center">
                    <View className="flex-row items-center">
                        <Pressable
                            onPress={onDec}
                            className="w-9 h-9 rounded-full bg-neutral-200 items-center justify-center active:opacity-90"
                        >
                            <Text className="text-lg">−</Text>
                        </Pressable>
                        <Text className="mx-3 w-8 text-center">{item.qty}</Text>
                        <Pressable
                            onPress={onInc}
                            className="w-9 h-9 rounded-full bg-black items-center justify-center active:opacity-90"
                        >
                            <Text className="text-white text-lg">＋</Text>
                        </Pressable>
                    </View>

                    <Pressable
                        onPress={onDelete}
                        className="mt-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 active:opacity-90"
                    >
                        <Text className="text-red-600 text-xs font-semibold">
                            Delete
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

// format ISO timestamp to readable local string
function formatLocal(iso) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const day = pad(d.getDate());
    const mon = d.toLocaleString(undefined, { month: "short" });
    const yr = d.getFullYear();
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${day} ${mon} ${yr}, ${hh}:${mm}`;
}

// pantry list and controls
export default function PantryScreen({ navigation }) {
    const pad = useTabBarSafePadding();

    const [items, setItems] = React.useState([]);
    const [refreshing, setRefreshing] = React.useState(false);
    const [q, setQ] = React.useState("");
    const [lastSynced, setLastSynced] = React.useState(null);

    // load items from local DB
    const load = React.useCallback(() => {
        listItems((rows) => setItems(rows));
    }, []);

    // refresh last synced timestamp from DB
    const refreshLastSynced = React.useCallback(async () => {
        const iso = (await getLastSyncAt()) || (await getLastPullCursor());
        setLastSynced(iso || null);
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            load();
            refreshLastSynced();
        }, [load, refreshLastSynced])
    );

    // pull-to-refresh, sync then reload
    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await syncNow().catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
        load();
        await refreshLastSynced();
        setRefreshing(false);
    }, [load, refreshLastSynced]);

    // filter items by search query
    const filtered = React.useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return items;
        return items.filter((it) =>
            [it.name, it.brand, it.upc]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(s))
        );
    }, [items, q]);

    async function inc(it) {
        await updateQty(it.id, (it.qty || 0) + 1);
        load();
    }

    async function dec(it) {
        const next = (it.qty || 0) - 1;
        if (next > 0) {
            await updateQty(it.id, next);
        } else {
            const ok = await new Promise((res) =>
                Alert.alert("Remove item", `Remove ${it.name} from pantry?`, [
                    {
                        text: "Cancel",
                        style: "cancel",
                        onPress: () => res(false),
                    },
                    {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => res(true),
                    },
                ])
            );
            if (ok) await removeItem(it.id);
        }
        load();
    }
    // delete item with confirmation
    async function del(it) {
        const ok = await new Promise((res) =>
            Alert.alert("Delete item", `Delete ${it.name}?`, [
                { text: "Cancel", style: "cancel", onPress: () => res(false) },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => res(true),
                },
            ])
        );
        if (ok) {
            await removeItem(it.id);
            load();
        }
    }

    return (
        <View className="flex-1 bg-neutral-100 " style={pad}>
            {/* Header + search */}
            <View className="px-5 pt-20 pb-4 bg-white border-b border-neutral-200">
                <View className="flex-row items-center justify-between">
                    <Text className="text-3xl font-bold text-black">
                        My Pantry
                    </Text>
                    <Pressable
                        onPress={() => navigation.navigate("AddItem")}
                        className="px-3 py-1.5 rounded-full bg-black active:opacity-90"
                    >
                        <Text className="text-white font-semibold">＋ Add</Text>
                    </Pressable>
                </View>
                <Text className="text-xs text-neutral-500 mt-1">
                    Last synced: {formatLocal(lastSynced)}
                </Text>
                <TextInput
                    className="mt-3 border border-neutral-300 rounded-xl px-4 py-3 bg-white"
                    placeholder="Search by name, brand, or UPC"
                    value={q}
                    onChangeText={setQ}
                />
            </View>

            {/* List */}
            <FlatList
                data={filtered}
                keyExtractor={(it) => it.id}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                }
                renderItem={({ item }) => (
                    <ItemRow
                        item={item}
                        onInc={() => inc(item)}
                        onDec={() => dec(item)}
                        onDelete={() => del(item)}
                    />
                )}
                ListEmptyComponent={
                    <View className="flex-1 items-center mt-20 px-6">
                        <Text className="text-lg font-semibold text-black">
                            No items yet
                        </Text>
                        <Text className="text-neutral-600 text-center mt-2">
                            Scan a barcode on the Scan tab or use “Add” to
                            create your first item.
                        </Text>
                    </View>
                }
                contentContainerStyle={{ paddingVertical: 8 }}
            />
        </View>
    );
}
