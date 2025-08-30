import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lookupUPC } from "../api/products";
import { AuthContext } from "../context/AuthContext";
import { addOrMergeItemFromProduct, setCurrentUser } from "../db/db";

// delay before camera appears & scanning starts
const ARM_DELAY_MS = 1200;
// debounce between reads
const SCAN_COOLDOWN_MS = 1500;

// Main scanning screen component
export default function ScanScreen() {
	const { me } = React.useContext(AuthContext); // current user from context
	const insets = useSafeAreaInsets();

	React.useEffect(() => {
		// ensure DB has current user id
		if (me?.id) setCurrentUser(me.id);
	}, [me]);

	// camera permission hook
	const [permission, requestPermission] = useCameraPermissions();

	// flow state
	// whether scanner flow is active
	const [scanning, setScanning] = React.useState(true);
	// camera visible after arm delay
	const [showCamera, setShowCamera] = React.useState(false);
	// whether scanner will accept reads
	const [armed, setArmed] = React.useState(false);
	// network lookup in progress
	const [processing, setProcessing] = React.useState(false);

	// result state
	// product found via lookup
	const [result, setResult] = React.useState(null);
	// UPC not found
	const [notFoundUPC, setNotFoundUPC] = React.useState(null);

	// UI fields
	const [qty, setQty] = React.useState("1");
	const [manualName, setManualName] = React.useState("");
	const [manualBrand, setManualBrand] = React.useState("");

	// timestamp of last successful scan
	const lastScanTs = React.useRef(0);

	// request permission on mount if not present
	React.useEffect(() => {
		if (!permission) requestPermission();
	}, [permission, requestPermission]);

	// camera after a short delay when scanning starts
	React.useEffect(() => {
		if (!scanning) return;
		setArmed(false);
		setShowCamera(false);
		const t = setTimeout(() => {
			setShowCamera(true);
			setArmed(true);
		}, ARM_DELAY_MS);
		return () => clearTimeout(t);
	}, [scanning]);

	function resetState() {
		// clear scan results and input fields
		setResult(null);
		setNotFoundUPC(null);
		setQty("1");
		setManualName("");
		setManualBrand("");
	}

	// barcode handler invoked by CameraView
	async function handleBarcode({ data }) {
		if (!armed || !scanning || processing) return;
		const now = Date.now();
		if (now - lastScanTs.current < SCAN_COOLDOWN_MS) return;
		lastScanTs.current = now;

		setScanning(false);
		setProcessing(true);
		resetState();

		const upc = String(data || "").trim();
		if (!upc) {
			setProcessing(false);
			setScanning(true);
			return;
		}

		try {
			// lookup product by UPC
			const prod = await lookupUPC(upc);
			if (prod) setResult(prod);
			else setNotFoundUPC(upc);
		} catch (e) {
			Alert.alert("Lookup failed", e.message || "Could not fetch item");
			setScanning(true);
		} finally {
			setProcessing(false);
		}
	}

	// add found product to pantry
	async function addFound() {
		if (!me?.id) {
			Alert.alert("Please sign in again");
			return;
		}
		if (!result) return;
		const n = Math.max(0, parseFloat(qty || "1")) || 1;
		try {
			await addOrMergeItemFromProduct(result, n);
			Alert.alert("Added", `${result.name} × ${n} added to pantry`);
			resetState();
			setScanning(true);
		} catch (e) {
			Alert.alert("Save failed", e.message || "Could not save item");
		}
	}

	// add manually entered product when UPC not found
	async function addManual() {
		if (!me?.id) {
			Alert.alert("Please sign in again");
			return;
		}
		if (!notFoundUPC) return;
		const name = manualName.trim();
		if (!name) return Alert.alert("Missing", "Enter a name for the item");
		const brand = manualBrand.trim();
		const n = Math.max(0, parseFloat(qty || "1")) || 1;

		const product = {
			upc: notFoundUPC,
			name,
			brand,
			serving_qty: 1,
			serving_unit: "unit",
			nutrients: {},
		};

		try {
			await addOrMergeItemFromProduct(product, n);
			Alert.alert("Added", `${name} × ${n} added to pantry`);
			resetState();
			setScanning(true);
		} catch (e) {
			Alert.alert("Save failed", e.message || "Could not save item");
		}
	}

	// render permission requesting state
	if (!permission) {
		return (
			<View className="flex-1 items-center justify-center bg-white">
				<ActivityIndicator size="large" />
				<Text className="mt-4 text-neutral-600">
					Requesting camera permission…
				</Text>
			</View>
		);
	}
	// render when permission denied
	if (!permission.granted) {
		return (
			<View className="flex-1 items-center justify-center bg-white px-6">
				<Text className="text-xl font-bold text-center">
					Camera permission denied
				</Text>
				<Text className="text-neutral-600 text-center mt-2">
					Please enable camera access in your system settings to scan
					barcodes.
				</Text>
				<Pressable
					className="mt-6 rounded-xl py-3 px-6 bg-black active:opacity-90"
					onPress={requestPermission}
				>
					<Text className="text-white font-semibold">
						Grant permission
					</Text>
				</Pressable>
			</View>
		);
	}

	// main UI
	return (
		<View className="flex-1 bg-black">
			{/* Camera shows after ARM_DELAY_MS */}
			{scanning && showCamera && (
				<CameraView
					style={{ flex: 1 }}
					facing="back"
					barcodeScannerSettings={{
						barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
					}}
					onBarcodeScanned={handleBarcode}
				/>
			)}

			{/* While waiting to arm, show prep overlay */}
			{scanning && !showCamera && (
				<View className="flex-1 items-center justify-center bg-black">
					<ActivityIndicator size="large" color="#fff" />
					<Text className="text-white mt-4">Preparing scanner…</Text>
				</View>
			)}

			{/* Post-scan UI */}
			{!scanning && (
				<View className="flex-1 bg-black items-center justify-center">
					{processing ? (
						<View className="items-center">
							<ActivityIndicator size="large" color="#fff" />
							<Text className="text-white mt-4">
								Looking up item…
							</Text>
						</View>
					) : (
						<View className="w-full px-5">
							{result && (
								<View className="bg-white rounded-2xl p-5">
									<Text className="text-lg font-semibold">
										{result.brand ? `${result.brand} ` : ""}
										{result.name}
									</Text>
									<Text className="text-neutral-600 mt-1">
										Serving: {result.serving_qty}{" "}
										{result.serving_unit}
									</Text>
									{(result.nutrients?.kcal != null ||
										result.nutrients?.protein != null ||
										result.nutrients?.carbs != null ||
										result.nutrients?.fat != null) && (
										<Text className="text-neutral-600 mt-1">
											{result.nutrients?.kcal != null
												? `${Math.round(result.nutrients.kcal)} kcal`
												: ""}
											{result.nutrients?.protein != null
												? ` · ${result.nutrients.protein}g protein`
												: ""}
											{result.nutrients?.carbs != null
												? ` · ${result.nutrients.carbs}g carbs`
												: ""}
											{result.nutrients?.fat != null
												? ` · ${result.nutrients.fat}g fat`
												: ""}
										</Text>
									)}

									<Text className="mt-4 mb-1 text-sm text-neutral-700">
										Quantity to add
									</Text>
									<TextInput
										className="border border-neutral-300 rounded-xl px-4 py-3 bg-white"
										keyboardType="decimal-pad"
										value={qty}
										onChangeText={setQty}
										placeholder="1"
									/>

									<Pressable
										className="mt-5 rounded-xl py-3 bg-black active:opacity-90"
										onPress={addFound}
									>
										<Text className="text-white text-center font-semibold">
											Add to Pantry
										</Text>
									</Pressable>
									<Pressable
										className="mt-3 rounded-xl py-3 bg-neutral-200 active:opacity-90"
										onPress={() => {
											resetState();
											setScanning(true);
										}}
									>
										<Text className="text-center font-semibold">
											Scan Again
										</Text>
									</Pressable>
								</View>
							)}

							{notFoundUPC && !result && (
								<View className="bg-white rounded-2xl p-5">
									<Text className="text-lg font-semibold">
										Item not found
									</Text>
									<Text className="text-neutral-600 mt-1">
										UPC: {notFoundUPC}
									</Text>

									<Text className="mt-4 mb-1 text-sm text-neutral-700">
										Name
									</Text>
									<TextInput
										className="border border-neutral-300 rounded-xl px-4 py-3 bg-white"
										placeholder="e.g., Pasta"
										value={manualName}
										onChangeText={setManualName}
									/>

									<Text className="mt-3 mb-1 text-sm text-neutral-700">
										Brand (optional)
									</Text>
									<TextInput
										className="border border-neutral-300 rounded-xl px-4 py-3 bg-white"
										placeholder="e.g., Barilla"
										value={manualBrand}
										onChangeText={setManualBrand}
									/>

									<Text className="mt-3 mb-1 text-sm text-neutral-700">
										Quantity to add
									</Text>
									<TextInput
										className="border border-neutral-300 rounded-xl px-4 py-3 bg-white"
										keyboardType="decimal-pad"
										value={qty}
										onChangeText={setQty}
										placeholder="1"
									/>

									<Pressable
										className="mt-5 rounded-xl py-3 bg-black active:opacity-90"
										onPress={addManual}
									>
										<Text className="text-white text-center font-semibold">
											Add to Pantry
										</Text>
									</Pressable>
									<Pressable
										className="mt-3 rounded-xl py-3 bg-neutral-200 active:opacity-90"
										onPress={() => {
											resetState();
											setScanning(true);
										}}
									>
										<Text className="text-center font-semibold">
											Scan Again
										</Text>
									</Pressable>
								</View>
							)}
						</View>
					)}
				</View>
			)}

			{/* Overlay when scanner is armed and visible */}
			{scanning && showCamera && (
				<View
					pointerEvents="none"
					className="absolute inset-0 items-center justify-center"
				>
					<View className="w-64 h-64 border-4 border-white rounded-2xl opacity-80" />
					<Text className="text-white mt-6">
						Align barcode within the frame
					</Text>
				</View>
			)}

			{/* Top banner logo and app name */}
			<View className="bg-black/70 rounded-2xl px-4 py-3 border border-white/10 absolute top-20 left-5 right-5 z-10">
				<View className="w-full flex-row items-center justify-center gap-2">
					<Image
						source={require("../../assets/icon.png")}
						style={{ width: 40, height: 40, borderRadius: 6 }}
					/>
					<Text className="text-white text-4xl font-semibold">
						MyPantry
					</Text>
				</View>
			</View>
		</View>
	);
}
