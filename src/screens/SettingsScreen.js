import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import React from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { fetchMe, logout } from "../api/auth";
import { AuthContext } from "../context/AuthContext";
import {
    getLastSyncAt,
    listFavorites,
    listItems,
    setCurrentUser,
} from "../db/db";
import { syncNow } from "../sync/sync";

// Row renders as a Pressable only if onPress is provided
function Row({ title, subtitle, onPress, right }) {
    const Container = onPress ? Pressable : View;
    return (
        <Container
            onPress={onPress}
            className="px-4 py-3 bg-white active:opacity-90"
        >
            <View className="flex-row justify-between items-center">
                <View className="flex-1 pr-4">
                    <Text className="text-base font-medium text-black">
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text className="text-xs text-neutral-500 mt-0.5">
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                {right ? (
                    right
                ) : (
                    <Text className="text-neutral-400">{">"}</Text>
                )}
            </View>
        </Container>
    );
}

function CardSection({ children }) {
    return (
        <View className="mx-4 bg-white rounded-2xl overflow-hidden border border-neutral-200">
            <View className="divide-y divide-neutral-200">{children}</View>
        </View>
    );
}

// helper for local datetime
function formatLocal(iso) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const day = pad(d.getDate());
    const mon = d.toLocaleString(undefined, { month: "short" });
    const yr = d.getFullYear();
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${day} ${mon} ${yr}, ${hh}:${mm}`;
}

export default function SettingsScreen({ navigation }) {
    const { setAuthed, me, setMe } = React.useContext(AuthContext);

    const [isSyncing, setIsSyncing] = React.useState(false);
    const [exportingPantry, setExportingPantry] = React.useState(false);
    const [exportingMeals, setExportingMeals] = React.useState(false);
    const [lastSync, setLastSync] = React.useState(null);

    // ensure we have current user info
    React.useEffect(() => {
        if (!me) {
            fetchMe()
                .then((u) => u && setMe(u))
                .catch(() => {});
        }
    }, [me, setMe]);

    // load last sync time on mount
    React.useEffect(() => {
        (async () => {
            const iso = await getLastSyncAt();
            setLastSync(iso || null);
        })();
    }, []);

    // shown in header
    const displayName = me?.username || me?.email || "Profile";

    // manual sync
    async function handleSyncNow() {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await syncNow();
            const iso = new Date().toISOString();
            setLastSync(iso);
            Alert.alert(
                "Sync complete",
                res?.pantry?.push?.error ||
                    res?.pantry?.pull?.error ||
                    res?.favs?.push?.error ||
                    res?.favs?.pull?.error
                    ? "Some sync steps failed. Check logs."
                    : "Your data is up to date."
            );
        } catch (e) {
            Alert.alert("Sync failed", e?.message || "Please try again.");
        } finally {
            setIsSyncing(false);
        }
    }

    // generate filename for exports
    function makeSafeFilename(prefix) {
        const safeName = (me?.username || me?.email || "user").replace(
            /[^a-z0-9_\-\.]+/gi,
            "_"
        );
        const ts = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(
            ts.getHours()
        )}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
        return `${prefix}-${safeName}-${stamp}.json`;
    }

    // write JSON file and share/save
    async function exportJson(filename, payload) {
        const uri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(
            uri,
            JSON.stringify(payload, null, 2),
            {
                encoding: FileSystem.EncodingType.UTF8,
            }
        );
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                UTI: "public.json",
                mimeType: "application/json",
                dialogTitle: "Export Data",
            });
        } else {
            Alert.alert("Exported", `Saved to:\n${uri}`);
        }
    }

    // Export Pantry
    async function handleExportPantry() {
        if (exportingPantry) return;
        setExportingPantry(true);
        try {
            const rows = await new Promise((resolve) => listItems(resolve));
            const payload = {
                type: "pantry",
                exported_at: new Date().toISOString(),
                user: {
                    id: me?.id || null,
                    email: me?.email || null,
                    username: me?.username || null,
                },
                count: rows.length,
                items: rows,
            };
            await exportJson(makeSafeFilename("pantry"), payload);
        } catch (e) {
            Alert.alert("Export failed", e?.message || "Please try again.");
        } finally {
            setExportingPantry(false);
        }
    }

    // Export Meals
    async function handleExportMeals() {
        if (exportingMeals) return;
        setExportingMeals(true);
        try {
            const favs = await new Promise((resolve) => listFavorites(resolve));
            const payload = {
                type: "meals",
                exported_at: new Date().toISOString(),
                user: {
                    id: me?.id || null,
                    email: me?.email || null,
                    username: me?.username || null,
                },
                count: favs.length,
                meals: favs,
            };
            await exportJson(makeSafeFilename("meals"), payload);
        } catch (e) {
            Alert.alert("Export failed", e?.message || "Please try again.");
        } finally {
            setExportingMeals(false);
        }
    }

    return (
        <View className="flex-1 bg-neutral-100">
            {/* Header with username */}
            <View className="px-5 pt-20 pb-6 bg-white border-b border-neutral-200">
                <Text className="text-3xl font-bold text-black">
                    {displayName}
                </Text>
                {me?.email ? (
                    <Text className="text-neutral-500 mt-1">{me.email}</Text>
                ) : null}
            </View>

            {/* Spacing between sections */}
            <View className="mt-4 space-y-4 gap-2">
                {/* Account */}
                <CardSection>
                    <Row
                        title="Profile"
                        subtitle="Edit username and phone"
                        onPress={() => navigation.navigate("Profile")}
                    />
                    <Row
                        title="Reset Password"
                        subtitle="Change password with email OTP"
                        onPress={() => navigation.navigate("ResetPassword")}
                    />
                </CardSection>

                {/* Sync & Data */}
                <CardSection>
                    <Row
                        title="Sync Now"
                        subtitle={`Last synced: ${formatLocal(lastSync)}`}
                        onPress={handleSyncNow}
                        right={isSyncing ? <ActivityIndicator /> : null}
                    />
                    <Row
                        title="Export Pantry"
                        subtitle="Export your pantry items as JSON"
                        onPress={handleExportPantry}
                        right={exportingPantry ? <ActivityIndicator /> : null}
                    />
                    <Row
                        title="Export Meals"
                        subtitle="Export your saved meals as JSON"
                        onPress={handleExportMeals}
                        right={exportingMeals ? <ActivityIndicator /> : null}
                    />
                </CardSection>

                {/* Session */}
                <View className="px-4 pt-4">
                    <Pressable
                        className="bg-red-600 rounded-xl py-3 active:opacity-90"
                        onPress={async () => {
                            await logout(); // clear server session
                            setCurrentUser(null); // clear local DB current user
                            setAuthed(false); // update app auth state
                        }}
                    >
                        <Text className="text-white text-center font-semibold">
                            Sign Out
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}
