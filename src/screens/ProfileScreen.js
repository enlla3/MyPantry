import React from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { fetchMe } from "../api/auth";
import { updateProfile } from "../api/profile";
import { AuthContext } from "../context/AuthContext";

export default function ProfileScreen({ navigation }) {
	const { me, setMe } = React.useContext(AuthContext);
	const [username, setUsername] = React.useState(me?.username || "");
	const [phone, setPhone] = React.useState(me?.phone || "");
	const [saving, setSaving] = React.useState(false);

	// handler to save profile changes
	async function onSave() {
		setSaving(true);
		try {
			await updateProfile({ username, phone });
			const fresh = await fetchMe();
			setMe(fresh);
			Alert.alert("Saved", "Profile updated");
			navigation.goBack();
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<View className="flex-1 bg-neutral-100 dark:bg-black">
			{/* Fake header strip */}
			<View className="px-5 pt-20 pb-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
				<Text className="text-xl font-bold text-black dark:text-white">
					Edit Profile
				</Text>
			</View>

			{/* form container */}
			<View className="px-5 mt-6">
				{/* username label */}
				<Text className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">
					Username
				</Text>
				{/* username input */}
				<TextInput
					className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 text-black dark:text-white"
					value={username}
					onChangeText={setUsername}
					placeholder="Your username"
					autoCapitalize="none"
				/>

				{/* phone label */}
				<Text className="text-sm text-neutral-600 dark:text-neutral-300 mt-4 mb-1">
					Phone
				</Text>
				{/* phone input */}
				<TextInput
					className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 text-black dark:text-white"
					value={phone}
					onChangeText={setPhone}
					placeholder="Your phone"
					keyboardType="phone-pad"
				/>

				{/* save button */}
				<Pressable
					className={`mt-6 rounded-xl py-3 ${saving ? "bg-gray-400" : "bg-black"}`}
					onPress={onSave}
					disabled={saving}
				>
					<Text className="text-white text-center font-semibold">
						{saving ? "Saving…" : "Save Changes"}
					</Text>
				</Pressable>

				{/* cancel button */}
				<Pressable
					className="mt-3 rounded-xl py-3 bg-neutral-200 dark:bg-neutral-800"
					onPress={() => navigation.goBack()}
				>
					<Text className="text-center text-black dark:text-white font-semibold">
						Cancel
					</Text>
				</Pressable>
			</View>
		</View>
	);
}
