import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { extractMealIngredients, lookupMeal } from "../api/recipes";
import { isFavorite, listItems, setFavorite } from "../db/db";
import { useTabBarSafePadding } from "../ui/layout";
import { TabBarOccluder } from "../ui/TabBarOccluder";

export default function MealDetailScreen({ route, navigation }) {
	const pad = useTabBarSafePadding();
	const insets = useSafeAreaInsets();

	const { idMeal, cached } = route.params || {};
	const [meal, setMeal] = React.useState(cached || null);
	const [fav, setFav] = React.useState(false);
	const [loading, setLoading] = React.useState(!cached);
	const [pantryTokens, setPantryTokens] = React.useState([]);

	// Load pantry items and build tokens set for quick matching
	React.useEffect(() => {
		(async () => {
			const rows = await new Promise((res) => listItems(res));
			const toks = new Set();
			for (const r of rows) {
				const s = `${r.name || ""} ${r.brand || ""}`.toLowerCase();
				for (const t of s.split(/[^a-z]+/g))
					if (t && t.length >= 3) toks.add(t);
			}
			setPantryTokens([...toks]);
		})();
	}, []);

	// Check favorite status when idMeal changes
	React.useEffect(() => {
		(async () => setFav(await isFavorite(idMeal)))();
	}, [idMeal]);

	// Fetch meal details if not cached
	React.useEffect(() => {
		if (cached) return;
		(async () => {
			setLoading(true);
			try {
				setMeal(await lookupMeal(idMeal));
			} finally {
				setLoading(false);
			}
		})();
	}, [idMeal, cached]);

	// Show loader while fetching
	if (!meal || loading) {
		return (
			<View className="flex-1 items-center justify-center bg-white">
				<ActivityIndicator />
				<Text className="mt-2 text-neutral-600">Loading recipe…</Text>
			</View>
		);
	}

	// Clean and dedupe ingredients
	const rawIngs = extractMealIngredients(meal);
	const seen = new Set();
	const clean = [];
	for (const ing of rawIngs) {
		const k = String(ing || "")
			.trim()
			.toLowerCase();
		if (!k || seen.has(k)) continue;
		seen.add(k);
		clean.push(k);
	}
	// mark which ingredients are present in pantry
	const marks = clean.map((ing) => ({
		ing,
		have: pantryTokens.includes(ing),
	}));

	// Handlers
	const onBack = () => navigation.goBack();
	const onToggleFav = async () => {
		await setFavorite(meal, !fav);
		setFav(!fav);
	};

	return (
		<View className="flex-1 bg-white">
			{/* Top overlay header, back and heart */}
			<View
				style={{
					position: "absolute",
					top: insets.top + 8,
					left: 12,
					right: 12,
					zIndex: 10,
				}}
				className="flex-row items-center justify-between"
			>
				<Pressable
					onPress={onBack}
					hitSlop={12}
					className="w-10 h-10 rounded-full bg-white/95 items-center justify-center border border-neutral-200"
				>
					<Ionicons name="chevron-back" size={22} color="#111827" />
				</Pressable>

				<Pressable
					onPress={onToggleFav}
					hitSlop={12}
					className="w-10 h-10 rounded-full bg-white/95 items-center justify-center border border-neutral-200"
				>
					<Ionicons
						name={fav ? "heart" : "heart-outline"}
						size={22}
						color={fav ? "#e11d48" : "#111827"}
					/>
				</Pressable>
			</View>

			<ScrollView
				className="flex-1"
				contentContainerStyle={{
					padding: 16,
					paddingTop: insets.top + 56,
					...pad,
				}}
			>
				{/* Meal image */}
				<Image
					source={{ uri: meal.strMealThumb }}
					style={{
						width: "100%",
						height: 220,
						borderRadius: 16,
						backgroundColor: "#eee",
					}}
				/>

				{/* Meal title and meta */}
				<Text className="mt-4 text-2xl font-bold">{meal.strMeal}</Text>
				<Text className="text-neutral-600 mt-1">
					{meal.strArea || "—"} · {meal.strCategory || "—"}
				</Text>

				{/* Ingredients list */}
				<Text className="text-lg font-semibold mt-5">Ingredients</Text>
				<View className="mt-2">
					{marks.map(({ ing, have }, idx) => (
						<Text
							key={`${ing}-${idx}`}
							className={`mb-1 ${have ? "text-green-700" : "text-neutral-800"}`}
						>
							{have ? "✓" : "•"} {ing}
						</Text>
					))}
				</View>

				{/* Instructions */}
				<Text className="text-lg font-semibold mt-5">Instructions</Text>
				<Text className="mt-2 leading-6 text-neutral-800">
					{meal.strInstructions || "—"}
				</Text>
			</ScrollView>
			<TabBarOccluder color="#fff" />
		</View>
	);
}
