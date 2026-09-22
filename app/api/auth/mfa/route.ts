import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("begin")}),
  z.object({action:z.literal("confirm"),code:z.string().trim().min(6).max(12)}),
  z.object({action:z.literal("disable"),password:z.string().min(8).max(512)})
]);

type UserSecret={two_factor_secret_enc:string|null;password_hash:string};

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid request"},{status:400});

  if(parsed.data.action==="begin"){
    const secret=authenticator.generateSecret();
    const issuer=process.env.PLATFORM_NAME||"My GitHub";
    const uri=authenticator.keyuri(user.email,issuer,secret);
    await query("UPDATE users SET two_factor_secret_enc=$1,two_factor_enabled=false,updated_at=NOW() WHERE id=$2",[encrypt(secret),user.id]);
    await audit(user.id,"MFA_SETUP_STARTED","user",user.id);
    return NextResponse.json({secret,qr:await QRCode.toDataURL(uri,{width:260,margin:1})});
  }

  const record=await one<UserSecret>("SELECT two_factor_secret_enc,password_hash FROM users WHERE id=$1",[user.id]);
  if(!record) return NextResponse.json({error:"User not found"},{status:404});

  if(parsed.data.action==="confirm"){
    if(!record.two_factor_secret_enc) return NextResponse.json({error:"Start MFA setup first"},{status:400});
    if(!authenticator.check(parsed.data.code,decrypt(record.two_factor_secret_enc))){
      return NextResponse.json({error:"Invalid authenticator code"},{status:400});
    }
    await query("UPDATE users SET two_factor_enabled=true,updated_at=NOW() WHERE id=$1",[user.id]);
    await audit(user.id,"MFA_ENABLED","user",user.id);
    return NextResponse.json({ok:true});
  }

  if(!(await bcrypt.compare(parsed.data.password,record.password_hash))){
    return NextResponse.json({error:"Password is incorrect"},{status:403});
  }
  await query("UPDATE users SET two_factor_enabled=false,two_factor_secret_enc=NULL,updated_at=NOW() WHERE id=$1",[user.id]);
  await audit(user.id,"MFA_DISABLED","user",user.id);
  return NextResponse.json({ok:true});
}
