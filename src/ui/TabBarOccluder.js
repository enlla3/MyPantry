import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

//Solid block that sits under the floating tab bar to hide content behind it.
export function TabBarOccluder({ color = "#fff", extra = 0 }) {
	const insets = useSafeAreaInsets();
	const height = insets.bottom + 96 + extra;
	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				height,
				backgroundColor: color,
				zIndex: 5,
			}}
		/>
	);
}
