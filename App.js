import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import "./global.css";

import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { Pressable, Text, View } from "react-native";
import {
	SafeAreaProvider,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { syncNow } from "./src/sync/sync";

import { fetchMe, getToken } from "./src/api/auth";
import { AuthContext } from "./src/context/AuthContext";
import { setCurrentUser } from "./src/db/db";

// Auth stack
import CreateAccountScreen from "./src/screens/CreateAccountScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import SignInScreen from "./src/screens/SignInScreen";

// Main tabs
import AddItemScreen from "./src/screens/AddItemScreen";
import PantryScreen from "./src/screens/PantryScreen";
import ScanScreen from "./src/screens/ScanScreen";

// Settings stack
import ProfileScreen from "./src/screens/ProfileScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

//Meal Stack
import MealDetailScreen from "./src/screens/MealDetailScreen";
import MealsScreen from "./src/screens/MealsScreen";

// Loading screen
import LoadingScreen from "./src/screens/LoadingScreen";

const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const SettingsStackNav = createNativeStackNavigator();
const PantryStackNav = createNativeStackNavigator();
const MealsStackNav = createNativeStackNavigator();

function SettingsStack() {
	return (
		<SettingsStackNav.Navigator screenOptions={{ headerShown: false }}>
			<SettingsStackNav.Screen
				name="SettingsHome"
				component={SettingsScreen}
			/>
			<SettingsStackNav.Screen name="Profile" component={ProfileScreen} />
			<SettingsStackNav.Screen
				name="ResetPassword"
				component={ResetPasswordScreen}
			/>
		</SettingsStackNav.Navigator>
	);
}

function PantryStack() {
	return (
		<PantryStackNav.Navigator screenOptions={{ headerShown: false }}>
			<PantryStackNav.Screen name="PantryHome" component={PantryScreen} />
			<PantryStackNav.Screen name="AddItem" component={AddItemScreen} />
		</PantryStackNav.Navigator>
	);
}

function MealsStack() {
	return (
		<MealsStackNav.Navigator screenOptions={{ headerShown: false }}>
			<MealsStackNav.Screen name="MealsHome" component={MealsScreen} />
			<MealsStackNav.Screen
				name="MealDetail"
				component={MealDetailScreen}
			/>
		</MealsStackNav.Navigator>
	);
}

function iconFor(routeName, focused) {
	const size = focused ? 18 : 24;
	const color = focused ? "#fff" : "#6b7280";
	switch (routeName) {
		case "Scan":
			return (
				<Ionicons
					name={focused ? "scan" : "scan-outline"}
					size={size}
					color={color}
				/>
			);
		case "Pantry":
			return (
				<Ionicons
					name={focused ? "fast-food" : "fast-food-outline"}
					size={size}
					color={color}
				/>
			);
		case "Meals":
			return (
				<Ionicons
					name={focused ? "restaurant" : "restaurant-outline"}
					size={size}
					color={color}
				/>
			);
		case "Settings":
			return (
				<Ionicons
					name={focused ? "settings" : "settings-outline"}
					size={size}
					color={color}
				/>
			);
		default:
			return <Ionicons name="ellipse" size={size} color={color} />;
	}
}

function CustomTabBar({ state, descriptors, navigation }) {
	const insets = useSafeAreaInsets();

	return (
		<View
			style={{
				position: "absolute",
				left: 16,
				right: 16,
				bottom: Math.max(16, insets.bottom + 8),
			}}
			className="bg-white rounded-3xl px-2 py-2 border border-neutral-200"
		>
			<View className="flex-row items-center justify-between">
				{state.routes.map((route, index) => {
					const { options } = descriptors[route.key];
					const label =
						options.tabBarLabel !== undefined
							? options.tabBarLabel
							: options.title !== undefined
								? options.title
								: route.name;

					const isFocused = state.index === index;

					const onPress = () => {
						const event = navigation.emit({
							type: "tabPress",
							target: route.key,
							canPreventDefault: true,
						});
						if (!isFocused && !event.defaultPrevented) {
							navigation.navigate(route.name);
						}
					};

					const onLongPress = () => {
						navigation.emit({
							type: "tabLongPress",
							target: route.key,
						});
					};

					return (
						<Pressable
							key={route.key}
							accessibilityRole="button"
							accessibilityState={
								isFocused ? { selected: true } : {}
							}
							accessibilityLabel={
								options.tabBarAccessibilityLabel
							}
							testID={options.tabBarTestID}
							onPress={onPress}
							onLongPress={onLongPress}
							className={`flex-1 mx-1 items-center justify-center rounded-2xl ${
								isFocused ? "bg-black" : "bg-transparent"
							}`}
							style={{ height: 54 }}
						>
							<View className="flex-row items-center">
								{iconFor(route.name, isFocused)}
								{isFocused ? (
									<Text className="ml-1 text-white font-semibold text-sm">
										{label}
									</Text>
								) : null}
							</View>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function MainTabs() {
	return (
		<Tabs.Navigator
			screenOptions={{
				headerShown: false,
				tabBarShowLabel: false,
				tabBarStyle: { display: "none" },
			}}
			tabBar={(props) => <CustomTabBar {...props} />}
		>
			<Tabs.Screen
				name="Scan"
				component={ScanScreen}
				options={{ title: "Scan" }}
			/>
			<Tabs.Screen
				name="Pantry"
				component={PantryStack}
				options={{ title: "Pantry" }}
			/>
			<Tabs.Screen
				name="Meals"
				component={MealsStack}
				options={{ title: "Meals" }}
			/>
			<Tabs.Screen
				name="Settings"
				component={SettingsStack}
				options={{ title: "Settings" }}
			/>
		</Tabs.Navigator>
	);
}

function AuthStack() {
	return (
		<RootStack.Navigator screenOptions={{ headerShown: false }}>
			<RootStack.Screen name="SignIn" component={SignInScreen} />
			<RootStack.Screen
				name="CreateAccount"
				component={CreateAccountScreen}
			/>
			<RootStack.Screen
				name="ForgotPassword"
				component={ForgotPasswordScreen}
			/>
		</RootStack.Navigator>
	);
}

function AppInner() {
	// boot: "checking" | "offline" | "ready"
	const [boot, setBoot] = React.useState("checking");
	const [authed, setAuthed] = React.useState(false);
	const [me, setMe] = React.useState(null);

	const MIN_SPLASH_MS = 1000;
	const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

	const bootstrap = React.useCallback(async () => {
		setBoot("checking");
		const started = Date.now();
		try {
			const state = await Network.getNetworkStateAsync();
			const isOnline =
				!!state?.isConnected &&
				(state.isInternetReachable === null
					? true
					: !!state.isInternetReachable);

			// make splash shows
			const elapsed = Date.now() - started;
			if (elapsed < MIN_SPLASH_MS) await sleep(MIN_SPLASH_MS - elapsed);

			if (!isOnline) {
				setBoot("offline");
				return;
			}

			const t = await getToken();
			if (t) {
				const user = await fetchMe().catch(() => null);
				setMe(user);
				setAuthed(!!user);
			}
			setBoot("ready");
		} catch (e) {
			const elapsed = Date.now() - started;
			if (elapsed < MIN_SPLASH_MS) await sleep(MIN_SPLASH_MS - elapsed);
			setBoot("offline");
		}
	}, []);

	React.useEffect(() => {
		setCurrentUser(authed && me ? me.id : null);
		if (authed && me?.id) {
			// start and forget
			syncNow().catch(() => {});
		}
	}, [authed, me]);

	React.useEffect(() => {
		bootstrap();
	}, [bootstrap]);

	if (boot !== "ready") {
		return <LoadingScreen status={boot} onRetry={bootstrap} />;
	}

	return (
		<AuthContext.Provider value={{ authed, setAuthed, me, setMe }}>
			<NavigationContainer theme={DefaultTheme}>
				{authed ? <MainTabs /> : <AuthStack />}
			</NavigationContainer>
		</AuthContext.Provider>
	);
}

export default function App() {
	return (
		<SafeAreaProvider>
			<AppInner />
		</SafeAreaProvider>
	);
}
