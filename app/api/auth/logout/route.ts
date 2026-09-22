import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { clearSession, getCurrentUser } from "@/lib/auth";

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(user) await audit(user.id,"AUTH_LOGOUT","user",user.id);
  await clearSession();
  return NextResponse.redirect(new URL("/login",request.url),303);
}
