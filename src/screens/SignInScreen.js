import React from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { fetchMe, login } from "../api/auth";
import { AuthContext } from "../context/AuthContext";
import { setCurrentUser } from "../db/db";

export default function SignInScreen({ navigation }) {
	// access auth methods from context
	const { setAuthed, setMe } = React.useContext(AuthContext);
	// local state for email, password and loading indicator
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	// handle sign in
	async function doLogin() {
		if (!email || !password)
			return Alert.alert("Missing", "Email and password are required");
		// show loading state
		setLoading(true);
		try {
			// attempt login and fetch current user
			await login(email.trim(), password);
			const user = await fetchMe();
			// update app state and persist current user id
			setMe(user);
			setCurrentUser(user?.id || null);
			setAuthed(true);
		} catch (e) {
			Alert.alert("Sign in failed", e.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<View className="flex-1 items-center justify-center bg-white px-6">
			<View className="w-full max-w-sm">
				{/* app icon */}
				<Image
					className="rounded-2xl mb-4 self-center"
					source={require("../../assets/icon.png")}
					style={{ width: 96, height: 96, borderRadius: 24 }}
				/>
				<Text className="text-3xl font-bold text-center">MyPantry</Text>

				{/* email input */}
				<TextInput
					className="mt-8 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Email"
					autoCapitalize="none"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
				/>
				{/* password input */}
				<TextInput
					className="mt-3 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Password"
					secureTextEntry
					value={password}
					onChangeText={setPassword}
				/>

				{/* sign in button */}
				<Pressable
					className="mt-5 bg-black rounded-xl py-3"
					onPress={doLogin}
					disabled={loading}
				>
					<Text className="text-white text-center font-semibold">
						{loading ? "Please wait…" : "Sign In"}
					</Text>
				</Pressable>

				{/* forgot password link */}
				<Pressable
					className="mt-4 items-center"
					onPress={() => navigation.navigate("ForgotPassword")}
				>
					<Text className="text-blue-600">Forgot password?</Text>
				</Pressable>

				{/* create account link */}
				<View className="mt-6 flex-row justify-center">
					<Text className="text-gray-600">No account? </Text>
					<Pressable
						onPress={() => navigation.navigate("CreateAccount")}
					>
						<Text className="text-blue-600 font-semibold">
							Create one
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}
