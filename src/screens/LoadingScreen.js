import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
	ActivityIndicator,
	Animated,
	Easing,
	Image,
	Pressable,
	Text,
	View,
} from "react-native";

export default function LoadingScreen({ status = "checking", onRetry }) {
	const offline = status === "offline";

	// Gentle pulse for the logo while loading
	const scale = React.useRef(new Animated.Value(0.96)).current;
	React.useEffect(() => {
		if (!offline) {
			const loop = Animated.loop(
				Animated.sequence([
					Animated.timing(scale, {
						toValue: 1.04,
						duration: 800,
						easing: Easing.inOut(Easing.quad),
						useNativeDriver: true,
					}),
					Animated.timing(scale, {
						toValue: 0.96,
						duration: 800,
						easing: Easing.inOut(Easing.quad),
						useNativeDriver: true,
					}),
				])
			);
			loop.start();
			return () => loop.stop();
		}
	}, [offline, scale]);

	return (
		<View className="flex-1 items-center justify-center bg-neutral-50 px-6">
			{/* Card */}
			<View className="w-full max-w-sm bg-white rounded-3xl px-6 py-8 border border-neutral-200 shadow-sm">
				{/* Logo */}
				<View className="items-center">
					{offline ? (
						<View className="w-24 h-24 rounded-2xl bg-red-50 items-center justify-center border border-red-100">
							<Ionicons
								name="cloud-offline-outline"
								size={44}
								color="#ef4444"
							/>
						</View>
					) : (
						<Animated.View style={{ transform: [{ scale }] }}>
							<Image
								source={require("../../assets/icon.png")}
								style={{
									width: 96,
									height: 96,
									borderRadius: 24,
								}}
							/>
						</Animated.View>
					)}
				</View>

				{/* Title */}
				<Text className="text-2xl font-extrabold text-black text-center mt-5">
					{offline ? "No internet connection" : "MyPantry"}
				</Text>

				{/* Status */}
				<Text className="text-neutral-600 text-center mt-2">
					{offline
						? "Please check your connection and try again."
						: "Checking connection…"}
				</Text>

				{/* Progress and Action */}
				<View className="mt-6 items-center">
					{offline ? (
						<Pressable
							onPress={onRetry}
							className="rounded-xl py-3 px-6 bg-black active:opacity-90"
						>
							<Text className="text-white text-center font-semibold">
								Reload
							</Text>
						</Pressable>
					) : (
						<ActivityIndicator size="small" />
					)}
				</View>
			</View>

			{/* footer hint */}
			<Text className="mt-6 text-xs text-neutral-400">
				{offline ? "Wi-Fi or mobile data required" : "Loading app…"}
			</Text>
		</View>
	);
}
