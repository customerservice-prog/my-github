import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { NextResponse } from "next/server";
import { z } from "zod";
import { issueSession, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

const inputSchema=z.object({
  email:z.string().email().max(254),
  password:z.string().min(8).max(512),
  otp:z.string().trim().max(12).optional().default("")
});

type UserRow=SessionUser & { password_hash:string; two_factor_secret_enc:string|null; disabled:boolean };
type CountRow={count:string};
type Attempt={attempts:number;window_start:string;locked_until:string|null};

function rateKey(request:Request,email:string){
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  return createHash("sha256").update(ip+"|"+email.toLowerCase()).digest("hex");
}

async function registerFailure(key:string){
  const current=await one<Attempt>("SELECT attempts,window_start,locked_until FROM login_attempts WHERE key=$1",[key]);
  const now=Date.now();
  const windowFresh=current && now-new Date(current.window_start).getTime()<15*60_000;
  const attempts=windowFresh?current.attempts+1:1;
  const locked=attempts>=5?new Date(now+15*60_000):null;
  await query(`INSERT INTO login_attempts(key,attempts,window_start,locked_until)
    VALUES($1,$2,NOW(),$3)
    ON CONFLICT(key) DO UPDATE SET attempts=$2,window_start=CASE WHEN login_attempts.window_start < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_start END,locked_until=$3`,
    [key,attempts,locked]);
}

export async function POST(request:Request){
  const parsed=inputSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid credentials"},{status:400});
  const email=parsed.data.email.toLowerCase();
  const key=rateKey(request,email);
  const attempt=await one<Attempt>("SELECT attempts,window_start,locked_until FROM login_attempts WHERE key=$1",[key]);
  if(attempt?.locked_until && new Date(attempt.locked_until)>new Date()){
    return NextResponse.json({error:"Too many attempts. Try again later."},{status:429});
  }

  let user=await one<UserRow>("SELECT id,email,role,password_hash,two_factor_enabled,two_factor_secret_enc,disabled FROM users WHERE email=$1",[email]);

  if(!user){
    const count=await one<CountRow>("SELECT COUNT(*)::text count FROM users");
    const bootstrapEmail=process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    const bootstrapPassword=process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if(count?.count==="0" && bootstrapEmail===email && bootstrapPassword && parsed.data.password===bootstrapPassword){
      const hash=await bcrypt.hash(parsed.data.password,12);
      user=await one<UserRow>("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'OWNER') RETURNING id,email,role,password_hash,two_factor_enabled,two_factor_secret_enc,disabled",[email,hash]);
      if(user) await audit(user.id,"AUTH_BOOTSTRAP","user",user.id);
    }
  }

  if(!user || user.disabled || !(await bcrypt.compare(parsed.data.password,user.password_hash))){
    await registerFailure(key);
    return NextResponse.json({error:"Invalid credentials"},{status:401});
  }

  if(user.two_factor_enabled){
    if(!user.two_factor_secret_enc || !parsed.data.otp){
      await registerFailure(key);
      return NextResponse.json({error:"Authenticator code required"},{status:401});
    }
    const secret=decrypt(user.two_factor_secret_enc);
    if(!authenticator.check(parsed.data.otp,secret)){
      await registerFailure(key);
      return NextResponse.json({error:"Invalid authenticator code"},{status:401});
    }
  }

  await query("DELETE FROM login_attempts WHERE key=$1",[key]);
  await query("UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1",[user.id]);
  await issueSession(user);
  await audit(user.id,"AUTH_LOGIN","user",user.id);
  return NextResponse.json({ok:true});
}
