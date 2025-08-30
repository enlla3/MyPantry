// Ensure fetch exists in Jest
global.fetch = jest.fn();

// Mock Expo SQLite so native code never runs in Node/Jest
jest.mock("expo-sqlite", () => {
	const okResult = { rows: { _array: [] }, rowsAffected: 0, insertId: 1 };

	const tx = {
		executeSql: jest.fn((sql, params = [], onSuccess, onError) => {
			if (typeof onSuccess === "function") onSuccess(okResult);
			return { rows: okResult.rows };
		}),
	};

	const db = {
		execAsync: jest.fn(async () => undefined),
		runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 1 })),
		getAllAsync: jest.fn(async () => []),
		getFirstAsync: jest.fn(async () => undefined),
		transaction: jest.fn((fn) => fn(tx)),
		closeAsync: jest.fn(async () => undefined),
	};

	return {
		openDatabase: jest.fn(() => db),
		openDatabaseSync: jest.fn(() => db),
		openDatabaseAsync: jest.fn(async () => db),
		deleteDatabaseAsync: jest.fn(async () => undefined),
	};
});

// Mock expo-constants so products.js sees stable config
jest.mock("expo-constants", () => ({
	expoConfig: {
		extra: {
			APP_NAME: "MyPantryTest",
			APP_EMAIL: "test@example.com",
			// Give FDC & UPC keys so the FDC and UPC paths are enabled in tests.
			FDC_API_KEY: "FDC_TEST_KEY",
			UPCITEMDB_API_KEY: "UPC_TEST_KEY",
		},
	},
}));
