import React from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { fetchMe, registerFull } from "../api/auth";
import { AuthContext } from "../context/AuthContext";
import { setCurrentUser } from "../db/db";

export default function CreateAccountScreen({ navigation }) {
	const { setAuthed, setMe } = React.useContext(AuthContext);
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [username, setUsername] = React.useState("");
	const [phone, setPhone] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	// create account handler
	async function doCreate() {
		if (!email || !password)
			return Alert.alert("Missing", "Email and password are required");
		setLoading(true);
		try {
			await registerFull(
				email.trim(),
				password,
				username.trim(),
				phone.trim()
			);
			const user = await fetchMe();
			setMe(user);
			setCurrentUser(user?.id || null);
			setAuthed(true);
		} catch (e) {
			Alert.alert("Create failed", e.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<View className="flex-1 bg-white items-center justify-center px-6">
			<Image
				className="rounded-2xl mb-4 self-center"
				source={require("../../assets/icon.png")}
				style={{ width: 96, height: 96, borderRadius: 24 }}
			/>
			{/* form */}
			<View className="w-full max-w-sm">
				<Text className="text-2xl font-bold text-center">
					Create your account
				</Text>

				<TextInput
					className="mt-6 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Email"
					autoCapitalize="none"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
				/>
				<TextInput
					className="mt-3 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Password"
					secureTextEntry
					value={password}
					onChangeText={setPassword}
				/>
				<TextInput
					className="mt-3 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Username"
					autoCapitalize="none"
					value={username}
					onChangeText={setUsername}
				/>
				<TextInput
					className="mt-3 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Phone (optional)"
					keyboardType="phone-pad"
					value={phone}
					onChangeText={setPhone}
				/>

				<Pressable
					className={`mt-6 rounded-xl py-3 ${loading ? "bg-gray-400" : "bg-black"}`}
					onPress={doCreate}
					disabled={loading}
				>
					<Text className="text-white text-center font-semibold">
						{loading ? "Please wait…" : "Create Account"}
					</Text>
				</Pressable>
			</View>

			{/* Bottom-left back pill */}
			<Pressable
				hitSlop={12}
				onPress={() => navigation.replace("SignIn")}
				className="absolute bottom-12 rounded-full bg-black/90 px-4 py-3 flex-row items-center shadow-lg"
			>
				<Text className="text-white text-lg mr-2">{"\u2190"}</Text>
				<Text className="text-white font-semibold">
					Back to Sign In
				</Text>
			</Pressable>
		</View>
	);
}
