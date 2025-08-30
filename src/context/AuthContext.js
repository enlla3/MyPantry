import React from "react";
export const AuthContext = React.createContext({
	authed: false,
	setAuthed: () => {},
	me: null,
	setMe: () => {},
});
