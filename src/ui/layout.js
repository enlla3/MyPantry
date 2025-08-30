import { useSafeAreaInsets } from "react-native-safe-area-context";

// Adds enough bottom padding so content won't sit under the floating tab bar.
export function useTabBarSafePadding(extra = 0) {
	const insets = useSafeAreaInsets();
	const pad = insets.bottom + 96 + extra;
	return { paddingBottom: pad };
}
