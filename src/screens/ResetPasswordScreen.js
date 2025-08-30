import React from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { logout, requestPasswordReset, resetPassword } from "../api/auth";
import { AuthContext } from "../context/AuthContext";

const COOLDOWN = 30; // wait before resending OTP

export default function ResetPasswordScreen({ navigation }) {
	// get authenticated user and setter from context
	const { me, setAuthed } = React.useContext(AuthContext);
	const email = me?.email || "";

	// local UI state
	const [code, setCode] = React.useState("");
	const [newPass, setNewPass] = React.useState("");
	const [secondsLeft, setSecondsLeft] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [hasRequested, setHasRequested] = React.useState(false);

	// countdown effect for resend cooldown
	React.useEffect(() => {
		if (secondsLeft <= 0) return;
		const id = setInterval(
			() => setSecondsLeft((s) => Math.max(0, s - 1)),
			1000
		);
		return () => clearInterval(id);
	}, [secondsLeft]);

	// request a password reset OTP via API
	async function sendCode() {
		if (!email) return Alert.alert("Error", "No account email found");
		try {
			await requestPasswordReset(email);
			setHasRequested(true);
			setSecondsLeft(COOLDOWN);
			Alert.alert("Sent", `OTP sent to ${email}`);
		} catch (e) {
			Alert.alert("Error", e.message);
		}
	}

	// submit new password and code to API and log out on success
	async function doReset() {
		if (!code || !newPass)
			return Alert.alert("Missing", "Enter the code and a new password");
		setLoading(true);
		try {
			await resetPassword(email, code.trim(), newPass);
			Alert.alert("Success", "Password updated. Please sign in again.");
			await logout();
			setAuthed(false);
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setLoading(false);
		}
	}

	// helpers for send/resend button
	const canSendOrResend = !hasRequested || secondsLeft === 0;
	const sendButtonLabel = !hasRequested
		? "Send Email OTP"
		: secondsLeft > 0
			? `Resend Code (${secondsLeft}s)`
			: "Resend Code";

	return (
		<View className="flex-1 bg-neutral-100 dark:bg-black">
			{/* Header */}
			{/* Shows title and current email */}
			<View className="px-5 pt-20 pb-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
				<Text className="text-xl font-bold text-black dark:text-white">
					Reset Password
				</Text>
				<Text className="text-neutral-600 dark:text-neutral-400 mt-1">
					{email}
				</Text>
			</View>

			{/* Content */}
			<View className="px-5 mt-8 space-y-8">
				<View className="space-y-3">
					<Text className="text-sm text-neutral-600 dark:text-neutral-300">
						Code
					</Text>
					<TextInput
						className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 text-black dark:text-white"
						placeholder="6-digit code"
						keyboardType="number-pad"
						value={code}
						onChangeText={setCode}
					/>

					{/* Status helper appears after an initial send AND when cooldown is finished */}
					{hasRequested && secondsLeft === 0 ? (
						<Text className="text-neutral-600 dark:text-neutral-400">
							You can resend a code now.
						</Text>
					) : null}

					{/* ticking countdown while waiting:
          {hasRequested && secondsLeft > 0 ? (
            <Text className="text-neutral-600 dark:text-neutral-400">
              Resend available in {secondsLeft}s.
            </Text>
          ) : null}
          */}
				</View>

				<View className="space-y-3">
					<Text className="text-sm text-neutral-600 dark:text-neutral-300">
						New password
					</Text>
					<TextInput
						className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 text-black dark:text-white"
						placeholder="New password"
						secureTextEntry
						value={newPass}
						onChangeText={setNewPass}
					/>
				</View>

				{/* Buttons */}
				<View className="space-y-4 gap-3 pt-10">
					<Pressable
						className={`rounded-xl py-3 ${canSendOrResend ? "bg-neutral-800" : "bg-neutral-300 dark:bg-neutral-800"}`}
						onPress={() => canSendOrResend && sendCode()}
						disabled={!canSendOrResend}
					>
						<Text className="text-white text-center font-semibold">
							{sendButtonLabel}
						</Text>
					</Pressable>

					<Pressable
						className={`rounded-xl py-3 ${loading ? "bg-gray-400" : "bg-black"}`}
						onPress={doReset}
						disabled={loading}
					>
						<Text className="text-white text-center font-semibold">
							{loading ? "Please wait…" : "Update Password"}
						</Text>
					</Pressable>

					<Pressable
						className="rounded-xl py-3 bg-neutral-200 dark:bg-neutral-800"
						onPress={() => navigation.goBack()}
					>
						<Text className="text-center text-black dark:text-white font-semibold">
							Cancel
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}
