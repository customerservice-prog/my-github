import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { one } from "@/lib/db";

const COOKIE="mygithub_session";
const publicPaths=["/login","/status","/api/auth/login","/api/health","/api/webhooks/forgejo","/api/internal/backup-events","/api/internal/restore-events","/api/internal/bootstrap"];

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

  const ownerOnly=pathname.startsWith("/api/users")||pathname.startsWith("/settings/users");
  if(ownerOnly) return false;

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
    const infrastructure=pathname.startsWith("/servers")||pathname.startsWith("/backups")||pathname.startsWith("/settings")||pathname.startsWith("/audit")
      ||pathname.startsWith("/api/servers")||pathname.startsWith("/api/backups")||pathname.startsWith("/api/auth/mfa");
    if(infrastructure) return false;
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

  if(mutation(request.method) && pathname.startsWith("/api/")){
    const origin=request.headers.get("origin");
    const controlDomain=process.env.CONTROL_DOMAIN;
    if(origin && controlDomain){
      let allowedOrigin=false;
      try{
        const parsed=new URL(origin);
        allowedOrigin=parsed.protocol==="https:" && parsed.hostname===controlDomain;
        if(process.env.NODE_ENV!=="production" && parsed.hostname==="localhost") allowedOrigin=true;
      }catch{}
      if(!allowedOrigin) return NextResponse.json({error:"Invalid request origin"},{status:403});
    }
  }

  try{
    const verified=await jwtVerify(token,secret());
    const userId=Number(verified.payload.sub);
    if(!Number.isSafeInteger(userId)) throw new Error("Invalid session subject");
    const current=await one<{role:string;disabled:boolean}>("SELECT role,disabled FROM users WHERE id=$1",[userId]);
    if(!current||current.disabled) throw new Error("Session user unavailable");
    const role=current.role;
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
