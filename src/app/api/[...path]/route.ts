import { NextRequest } from "next/server";
import { dispatch } from "@/lib/server/legacy-controller-adapter";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return dispatch(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const runtime = "nodejs";
