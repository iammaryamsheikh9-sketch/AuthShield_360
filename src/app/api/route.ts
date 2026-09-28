import { NextRequest } from "next/server";
import { dispatch } from "@/lib/server/legacy-controller-adapter";

async function handle(request: NextRequest) {
  return dispatch(request, []);
}

export const GET = handle;
export const runtime = "nodejs";
