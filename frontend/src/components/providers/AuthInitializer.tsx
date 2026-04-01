// "use client";

// import { useEffect } from "react";
// import { useAppStore } from "@/store/useAppStore";
// import { apiGet } from "@/services/api/client";
// import type { User } from "@/types";

// /**
//  * Fetches the current authenticated user from /api/v1/users/me
//  * and hydrates the app store. Renders nothing — purely a side-effect component.
//  */
// export function AuthInitializer() {
//   const setUser = useAppStore((s) => s.setUser);
//   const user = useAppStore((s) => s.user);

//   useEffect(() => {
//     if (user) return; // already loaded

//     const init = async () => {
//       // In real Logto mode the access token lives in an httpOnly cookie.
//       // Hydrate sessionStorage so the axios client can attach it as Bearer auth.
//       if (
//         process.env.NEXT_PUBLIC_MOCK_API !== "true" &&
//         !sessionStorage.getItem("crib:access_token")
//       ) {
//         try {
//           const res = await fetch("/api/auth/token");
//           if (res.ok) {
//             const { token } = await res.json();
//             sessionStorage.setItem("crib:access_token", token);
//           }
//         } catch {
//           // ignore — if no session the /users/me call will 401 and axios handles it
//         }
//       }

//       apiGet<User>("/users/me")
//         .then(setUser)
//         .catch(() => {
//           // Not authenticated or backend unavailable — leave user as null
//         });
//     };

//     init();
//   }, [setUser, user]);

//   return null;
// }

"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { apiGet } from "@/services/api/client";
import type { User } from "@/types";

export function AuthInitializer() {
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);
  const setAuthInitialized = useAppStore((s) => s.setAuthInitialized);

  useEffect(() => {
    if (user) return;

    const init = async () => {
      try {
        // ✅ STEP 1: ALWAYS fetch token first
        let token = sessionStorage.getItem("crib:access_token");

        if (process.env.NEXT_PUBLIC_MOCK_API !== "true" && !token) {
          const res = await fetch("/api/auth/token");

          if (!res.ok) throw new Error("No session");

          const data = await res.json();
          token = data.token;

          sessionStorage.setItem("crib:access_token", token);
        }

        // ✅ STEP 2: ONLY call API AFTER token exists
        const userData = await apiGet<User>("/users/me");

        setUser(userData);
      } catch (err) {
        setUser(null);
      } finally {
        // ✅ CRITICAL: mark auth as initialized
        useAppStore.getState().setAuthInitialized(true);
      }
    };

    init();
  }, [setUser, user]);

  return null;
}
