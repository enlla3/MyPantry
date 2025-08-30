import React from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { addOrMergeItemFromProduct } from "../db/db";
import { useTabBarSafePadding } from "../ui/layout";
import { TabBarOccluder } from "../ui/TabBarOccluder";

export default function AddItemScreen({ navigation }) {
	const pad = useTabBarSafePadding();
	const [name, setName] = React.useState("");
	const [brand, setBrand] = React.useState("");
	const [upc, setUpc] = React.useState("");
	const [unit, setUnit] = React.useState("unit");
	const [qty, setQty] = React.useState("1");

	const [kcal, setKcal] = React.useState("");
	const [protein, setProtein] = React.useState("");
	const [carbs, setCarbs] = React.useState("");
	const [fat, setFat] = React.useState("");

	// Save the item to the pantry
	async function onSave() {
		const n = name.trim();
		if (!n)
			return Alert.alert("Missing name", "Please enter an item name.");
		const qNum = Math.max(0, parseFloat(qty || "1")) || 1;

		const nutrients = {};
		if (kcal) nutrients.kcal = parseFloat(kcal) || 0;
		if (protein) nutrients.protein = parseFloat(protein) || 0;
		if (carbs) nutrients.carbs = parseFloat(carbs) || 0;
		if (fat) nutrients.fat = parseFloat(fat) || 0;

		const product = {
			upc: upc.trim() || null,
			name: n,
			brand: brand.trim() || null,
			serving_unit: unit.trim() || "unit",
			nutrients,
		};

		try {
			await addOrMergeItemFromProduct(product, qNum);
			Alert.alert("Added", `${n} × ${qNum} added to pantry`, [
				{ text: "OK", onPress: () => navigation.goBack() },
			]);
		} catch (e) {
			Alert.alert("Save failed", e?.message || "Could not save item");
		}
	}

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-white pt-20"
			behavior={Platform.select({ ios: "padding", android: undefined })}
		>
			<ScrollView contentContainerStyle={{ padding: 20, ...pad }}>
				<Text className="text-3xl font-bold text-black mb-3">
					Add Item
				</Text>

				<Text className="text-sm text-neutral-700 mb-1">Name *</Text>
				<TextInput
					className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
					placeholder="e.g., Pasta"
					value={name}
					onChangeText={setName}
				/>

				<Text className="text-sm text-neutral-700 mb-1">
					Brand (optional)
				</Text>
				<TextInput
					className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
					placeholder="e.g., Barilla"
					value={brand}
					onChangeText={setBrand}
				/>

				<Text className="text-sm text-neutral-700 mb-1">
					UPC (optional)
				</Text>
				<TextInput
					className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
					placeholder="e.g., 012345678905"
					keyboardType="number-pad"
					value={upc}
					onChangeText={setUpc}
				/>

				<Text className="text-sm text-neutral-700 mb-1">Unit</Text>
				<TextInput
					className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
					placeholder="unit / serving / bottle …"
					value={unit}
					onChangeText={setUnit}
				/>

				<Text className="text-sm text-neutral-700 mb-1">Quantity</Text>
				<TextInput
					className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
					placeholder="1"
					keyboardType="decimal-pad"
					value={qty}
					onChangeText={setQty}
				/>

				<Text className="text-base font-semibold text-black mt-2 mb-2">
					Nutrition per {unit || "unit"} (optional)
				</Text>

				<View className="flex-row -mx-1">
					<View className="flex-1 mx-1">
						<Text className="text-sm text-neutral-700 mb-1">
							kcal
						</Text>
						<TextInput
							className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
							keyboardType="decimal-pad"
							value={kcal}
							onChangeText={setKcal}
						/>
					</View>
					<View className="flex-1 mx-1">
						<Text className="text-sm text-neutral-700 mb-1">
							Protein (g)
						</Text>
						<TextInput
							className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
							keyboardType="decimal-pad"
							value={protein}
							onChangeText={setProtein}
						/>
					</View>
				</View>

				<View className="flex-row -mx-1">
					<View className="flex-1 mx-1">
						<Text className="text-sm text-neutral-700 mb-1">
							Carbs (g)
						</Text>
						<TextInput
							className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
							keyboardType="decimal-pad"
							value={carbs}
							onChangeText={setCarbs}
						/>
					</View>
					<View className="flex-1 mx-1">
						<Text className="text-sm text-neutral-700 mb-1">
							Fat (g)
						</Text>
						<TextInput
							className="border border-neutral-300 rounded-xl px-4 py-3 mb-3 bg-white"
							keyboardType="decimal-pad"
							value={fat}
							onChangeText={setFat}
						/>
					</View>
				</View>

				<View className="mt-4 flex-row">
					<Pressable
						onPress={() => navigation.goBack()}
						className="flex-1 mr-2 rounded-xl py-3 bg-neutral-200 active:opacity-90"
					>
						<Text className="text-center font-semibold">
							Cancel
						</Text>
					</Pressable>
					<Pressable
						onPress={onSave}
						className="flex-1 ml-2 rounded-xl py-3 bg-black active:opacity-90"
					>
						<Text className="text-white text-center font-semibold">
							Save to Pantry
						</Text>
					</Pressable>
				</View>
			</ScrollView>
			<TabBarOccluder color="#fff" />
		</KeyboardAvoidingView>
	);
}
