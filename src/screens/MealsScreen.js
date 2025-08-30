import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    extractMealIngredients,
    filterByIngredient,
    hydrateMeals,
    lookupMeal,
    popularMeals,
    searchMealsSmart,
} from "../api/recipes";
import { listFavorites, listItems, setFavorite } from "../db/db";
import { syncNow } from "../sync/sync";
import { useTabBarSafePadding } from "../ui/layout";


// Top segmented tabs
function SegTabs({ value, onChange }) {
    // Tab labels
    const tabs = ["Discover", "Pantry Meals", "My Meals"];
    return (
        <View className="flex-row bg-neutral-200 rounded-xl p-1 mt-3">
            {tabs.map((t) => {
                const on = value === t;
                return (
                    <Pressable
                        key={t}
                        onPress={() => onChange(t)}
                        className={`flex-1 py-2 rounded-lg ${on ? "bg-white" : ""}`}
                    >
                        <Text
                            className={`text-center font-semibold ${on ? "text-black" : "text-neutral-600"}`}
                        >
                            {t}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// Meal list item card with image title and favorite button
function MealCard({ meal, fav, onPress, onToggleFav, meta }) {
    return (
        <Pressable
            onPress={onPress}
            className="mx-4 mb-3 rounded-2xl bg-white border border-neutral-200 overflow-hidden active:opacity-90"
        >
            <View className="flex-row p-3">
                <Image
                    source={{ uri: meal.strMealThumb }}
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: 12,
                        backgroundColor: "#eee",
                    }}
                />
                <View className="flex-1 pl-3 justify-center">
                    <Text
                        className="text-base font-semibold text-black"
                        numberOfLines={2}
                    >
                        {meal.strMeal}
                    </Text>
                    {meta ? (
                        <Text className="text-xs text-neutral-600 mt-1">
                            {meta}
                        </Text>
                    ) : null}
                </View>
                <Pressable
                    onPress={onToggleFav}
                    className="self-start px-2 py-1"
                >
                    <Ionicons
                        name={fav ? "heart" : "heart-outline"}
                        size={22}
                        color={fav ? "#e11d48" : "#6b7280"}
                    />
                </Pressable>
            </View>
        </Pressable>
    );
}

// Pantry keywords
function pantryTokens(rows, max = 6) {
    // Stop words to ignore in tokens
    const stop = new Set([
        "the",
        "a",
        "of",
        "and",
        "with",
        "in",
        "for",
        "low",
        "fat",
        "free",
        "fresh",
        "light",
        "no",
        "added",
    ]);
    const bag = new Map();
    for (const r of rows) {
        const s = `${r.name || ""} ${r.brand || ""}`.toLowerCase();
        for (const tok of s.split(/[^a-z]+/g)) {
            if (!tok || tok.length < 3 || stop.has(tok)) continue;
            bag.set(tok, (bag.get(tok) || 0) + 1);
        }
    }
    // Return top tokens by frequency
    return [...bag.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([w]) => w);
}

export default function MealsScreen({ navigation }) {

    const [tab, setTab] = React.useState("Discover");
    const [q, setQ] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [items, setItems] = React.useState([]);
    const [favs, setFavs] = React.useState([]);
    const [refreshing, setRefreshing] = React.useState(false);
    const pad = useTabBarSafePadding();

    async function loadFavs() {
        listFavorites((rows) => setFavs(rows || []));
    }

    // Load popular or searched meals
    async function loadDiscover() {
        setLoading(true);
        try {
            if (q.trim()) {
                setItems(await searchMealsSmart(q.trim(), 24));
            } else {
                setItems(await popularMeals(24));
            }
        } finally {
            setLoading(false);
        }
    }

    // Build suggestions based on pantry
    async function loadPantryMeals() {
        setLoading(true);
        try {
            const pantry = await new Promise((res) => listItems(res));
            const toks = pantryTokens(pantry, 6);
            if (toks.length === 0) {
                setItems([]);
                return;
            }

            const pools = await Promise.all(
                toks.map((t) => filterByIngredient(t))
            );
            const score = new Map();
            pools.forEach((arr, idx) => {
                const tok = toks[idx];
                for (const s of arr) {
                    const e = score.get(s.idMeal) || {
                        stub: s,
                        hits: 0,
                        toks: new Set(),
                    };
                    if (!e.toks.has(tok)) {
                        e.hits += 1;
                        e.toks.add(tok);
                    }
                    score.set(s.idMeal, e);
                }
            });
            const ranked = [...score.values()]
                .sort((a, b) => b.hits - a.hits)
                .map((v) => v.stub);
            const detailed = await hydrateMeals(ranked, 24);
            const withMeta = detailed.map((d) => {
                const ings = extractMealIngredients(d);
                const used = toks.filter((t) => ings.includes(t)).length;
                return {
                    ...d,
                    _meta: `matches ${used} pantry item${used === 1 ? "" : "s"}`,
                };
            });
            setItems(withMeta);
        } finally {
            setLoading(false);
        }
    }

    // initial load of favorites
    React.useEffect(() => {
        loadFavs();
    }, []);
    // switch loader when tab changes
    React.useEffect(() => {
        if (tab === "Discover") loadDiscover();
        if (tab === "Pantry Meals") loadPantryMeals();
        if (tab === "My Meals") loadFavs();
    }, [tab]);

    // debounce search for Discover
    React.useEffect(() => {
        if (tab !== "Discover") return;
        const t = setTimeout(() => loadDiscover(), 350);
        return () => clearTimeout(t);
    }, [q]);

    // Pull-to-refresh handler
    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            if (tab === "Discover") {
                await loadDiscover();
            } else if (tab === "Pantry Meals") {
                await loadPantryMeals();
            } else {
                await syncNow().catch(() => {});
                await loadFavs();
            }
        } finally {
            setRefreshing(false);
        }
    }, [tab]);

    // Set of favorite meal ids for quick lookup
    const favSet = React.useMemo(
        () => new Set(favs.map((f) => f.meal_id)),
        [favs]
    );

    // My Meals from DB rows
    const myMeals = favs.map((f) => ({
        idMeal: f.meal_id,
        strMeal: f.title,
        strMealThumb: f.thumb,
        _detail: f.json ? JSON.parse(f.json) : null,
    }));

    // Choose data source based on selected tab
    const data =
        tab === "Discover" ? items : tab === "Pantry Meals" ? items : myMeals;

    // Local search for My Meals
    const filtered =
        tab === "My Meals" && q.trim()
            ? data.filter((m) =>
                    (m.strMeal || "")
                        .toLowerCase()
                        .includes(q.trim().toLowerCase())
                )
            : data;

    return (
        <View className="flex-1 bg-neutral-100" style={pad}>
            {/* Header */}
            <View className="px-5 pt-20 pb-4 bg-white border-b border-neutral-200">
                <Text className="text-3xl font-bold text-black">Meals</Text>
                <SegTabs value={tab} onChange={setTab} />
                {tab !== "Pantry Meals" && (
                    <TextInput
                        className="mt-3 border border-neutral-300 rounded-xl px-4 py-3 bg-white"
                        placeholder={
                            tab === "Discover"
                                ? "Search by meal or ingredient…"
                                : "Search my saved meals…"
                        }
                        value={q}
                        onChangeText={setQ}
                    />
                )}
            </View>

            {/* List */}
            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator />
                    <Text className="mt-2 text-neutral-600">
                        {tab === "Discover"
                            ? "Fetching meals…"
                            : "Building suggestions from your pantry…"}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(m) => String(m.idMeal)}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                        />
                    }
                    renderItem={({ item }) => {
                        const fav = favSet.has(item.idMeal);
                        const meta =
                            tab === "Pantry Meals"
                                ? item._meta || undefined
                                : item.strArea || item.strCategory
                                    ? `${item.strArea || "—"} · ${item.strCategory || "—"}`
                                    : undefined;

                        const openDetail = () =>
                            navigation.navigate("MealDetail", {
                                idMeal: item.idMeal,
                                cached: item._detail || null,
                            });

                        const toggleFav = async () => {
                            // Always persist full details
                            const full =
                                item._detail || (await lookupMeal(item.idMeal));
                            if (!full) return;
                            await setFavorite(full, !fav);
                            await loadFavs();
                        };

                        return (
                            <MealCard
                                meal={item}
                                fav={fav}
                                meta={meta}
                                onPress={openDetail}
                                onToggleFav={toggleFav}
                            />
                        );
                    }}
                    ListEmptyComponent={
                        <View className="flex-1 items-center mt-20 px-6">
                            <Text className="text-lg font-semibold text-black">
                                {tab === "Discover"
                                    ? "No results"
                                    : tab === "Pantry Meals"
                                        ? "No suggestions yet"
                                        : "No saved meals"}
                            </Text>
                            <Text className="text-neutral-600 text-center mt-2">
                                {tab === "Discover"
                                    ? "Try another name or ingredient."
                                    : tab === "Pantry Meals"
                                        ? "Add more items to your pantry to get smarter suggestions."
                                        : "Tap the heart on any meal to save it here."}
                            </Text>
                        </View>
                    }
                    contentContainerStyle={{ paddingVertical: 8 }}
                />
            )}
        </View>
    );
}
