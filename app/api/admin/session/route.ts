import { adminAuthConfigured, isAdminRequest } from "../../../../lib/admin-auth";
export async function GET(request: Request) { return Response.json({ authenticated: await isAdminRequest(request), configured: adminAuthConfigured() }); }
