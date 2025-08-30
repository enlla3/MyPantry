import React from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { requestPasswordReset, resetPassword } from "../api/auth";

const COOLDOWN = 30; // in seconds

export default function ForgotPasswordScreen({ navigation }) {
	const [step, setStep] = React.useState(1);
	const [email, setEmail] = React.useState("");
	const [code, setCode] = React.useState("");
	const [newPass, setNewPass] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	const [secondsLeft, setSecondsLeft] = React.useState(0);
	const hasCooldown = secondsLeft > 0;

	// Countdown effect that ticks every second while cooldown active
	React.useEffect(() => {
		if (!hasCooldown) return;
		const id = setInterval(
			() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
			1000
		);
		return () => clearInterval(id);
	}, [hasCooldown]);

	// Send initial password reset request
	async function doRequest() {
		if (!email) return Alert.alert("Missing", "Enter your email first");
		setLoading(true);
		try {
			await requestPasswordReset(email.trim());
			setStep(2);
			setSecondsLeft(COOLDOWN);
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setLoading(false);
		}
	}

	// Resend the password reset code if cooldown has expired
	async function doResend() {
		if (hasCooldown) return;
		try {
			await requestPasswordReset(email.trim());
			setSecondsLeft(COOLDOWN);
		} catch (e) {
			Alert.alert("Error", e.message);
		}
	}

	// Finalize password reset using code and new password
	async function doReset() {
		if (!code || !newPass)
			return Alert.alert("Missing", "Enter the code and a new password");
		setLoading(true);
		try {
			await resetPassword(email.trim(), code.trim(), newPass);
			Alert.alert("Success", "Password updated. You can now sign in.");
			navigation.replace("SignIn");
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<View className="flex-1 bg-white items-center justify-center px-6">
			<View className="w-full max-w-sm">
				{/* App icon */}
				<Image
					className="rounded-2xl mb-4 self-center"
					source={require("../../assets/icon.png")}
					style={{ width: 96, height: 96, borderRadius: 24 }}
				/>
				{/* Title */}
				<Text className="text-2xl font-bold text-center">
					{step === 1
						? "Reset your password"
						: "Enter code & new password"}
				</Text>

				{/* Email input (disabled after requesting code) */}
				<TextInput
					className="mt-6 border border-gray-300 rounded-xl px-4 py-3"
					placeholder="Email"
					autoCapitalize="none"
					keyboardType="email-address"
					editable={step === 1}
					value={email}
					onChangeText={setEmail}
				/>

				{step === 1 ? (
					// Request code button
					<Pressable
						className={`mt-6 rounded-xl py-3 ${loading ? "bg-gray-400" : "bg-black"}`}
						onPress={doRequest}
						disabled={loading}
					>
						<Text className="text-white text-center font-semibold">
							{loading ? "Please wait…" : "Email me a code"}
						</Text>
					</Pressable>
				) : (
					<>
						{/* Info about OTP and resend status */}
						<Text className="mt-4 text-center text-gray-700">
							OTP sent to{" "}
							<Text className="font-semibold">{email}</Text>.{" "}
							{hasCooldown
								? `Resend available in ${secondsLeft}s.`
								: "You can resend now."}
						</Text>

						{/* Code input */}
						<TextInput
							className="mt-4 border border-gray-300 rounded-xl px-4 py-3"
							placeholder="6-digit code"
							keyboardType="number-pad"
							value={code}
							onChangeText={setCode}
						/>
						{/* New password input */}
						<TextInput
							className="mt-3 border border-gray-300 rounded-xl px-4 py-3"
							placeholder="New password"
							secureTextEntry
							value={newPass}
							onChangeText={setNewPass}
						/>

						{/* Submit new password */}
						<Pressable
							className={`mt-5 rounded-xl py-3 ${loading ? "bg-gray-400" : "bg-black"}`}
							onPress={doReset}
							disabled={loading}
						>
							<Text className="text-white text-center font-semibold">
								{loading ? "Please wait…" : "Reset password"}
							</Text>
						</Pressable>

						{/* Resend code button with cooldown */}
						<Pressable
							className={`mt-4 rounded-xl py-3 ${hasCooldown ? "bg-gray-300" : "bg-gray-800"}`}
							onPress={doResend}
							disabled={hasCooldown}
						>
							<Text className="text-white text-center font-semibold">
								{hasCooldown
									? `Resend (${secondsLeft}s)`
									: "Resend code"}
							</Text>
						</Pressable>
					</>
				)}
			</View>

			{/* back pill */}
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
