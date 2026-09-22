import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE="mygithub_session";
const publicPaths=["/login","/status","/api/health","/api/webhooks/forgejo","/api/internal/backup-events","/api/internal/restore-events","/api/internal/bootstrap"];

function secret(){
  const value=process.env.SESSION_SECRET||"";
  return new TextEncoder().encode(value);
}

function isPublic(pathname:string){
  return publicPaths.some(path=>pathname===path||pathname.startsWith(path+"/"));
}

function mutation(method:string){
  return !["GET","HEAD","OPTIONS"].includes(method.toUpperCase());
}

function allowed(role:string,pathname:string,method:string){
  if(role==="OWNER") return true;

  if(role==="ADMIN"){
    if(pathname.startsWith("/api/users")||pathname.startsWith("/settings/users")) return false;
    return true;
  }

  if(role==="DEVELOPER"){
    if(pathname.startsWith("/servers")||pathname.startsWith("/backups")||pathname.startsWith("/settings")||pathname.startsWith("/audit")) return false;
    if(pathname.startsWith("/api/servers")||pathname.startsWith("/api/backups")||pathname.startsWith("/api/auth/mfa")||pathname.startsWith("/api/users")) return false;
    return true;
  }

  if(role==="VIEWER"){
    return !mutation(method);
  }

  return false;
}

export async function proxy(request:NextRequest){
  const pathname=request.nextUrl.pathname;
  if(isPublic(pathname)||pathname.startsWith("/_next/")||pathname==="/favicon.ico") return NextResponse.next();

  const token=request.cookies.get(COOKIE)?.value;
  if(!token){
    if(pathname.startsWith("/api/")) return NextResponse.json({error:"Unauthorized"},{status:401});
    return NextResponse.redirect(new URL("/login",request.url));
  }

  try{
    const verified=await jwtVerify(token,secret());
    const role=String(verified.payload.role||"");
    if(!allowed(role,pathname,request.method)){
      if(pathname.startsWith("/api/")) return NextResponse.json({error:"Forbidden for this role"},{status:403});
      return NextResponse.redirect(new URL("/",request.url));
    }
    return NextResponse.next();
  }catch{
    if(pathname.startsWith("/api/")) return NextResponse.json({error:"Unauthorized"},{status:401});
    return NextResponse.redirect(new URL("/login",request.url));
  }
}

export const config={
  matcher:["/((?!_next/static|_next/image).*)"]
};
