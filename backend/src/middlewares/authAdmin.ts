import { authRequired, requireRole } from "./auth";

// Backward-compatible alias used by existing admin routes.
export const authAdmin = [authRequired, requireRole("ADMIN")];
