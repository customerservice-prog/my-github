import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.object({
  role:z.enum(["OWNER","ADMIN","DEVELOPER","VIEWER"]).optional(),
  disabled:z.boolean().optional(),
  password:z.string().min(12).max(512).optional()
}).refine(v=>v.role!==undefined||v.disabled!==undefined||v.password!==undefined,"No changes supplied");

type User={id:number;email:string;role:string;disabled:boolean};

async function enabledOwnerCount(){
  const row=await one<{count:string}>("SELECT COUNT(*)::text count FROM users WHERE role='OWNER' AND disabled=false");
  return Number(row?.count||0);
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getCurrentUser();
  if(!actor||actor.role!=="OWNER") return NextResponse.json({error:"Owner access required"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid user update"},{status:400});
  const {id}=await params;
  const target=await one<User>("SELECT id,email,role,disabled FROM users WHERE id=$1",[Number(id)]);
  if(!target) return NextResponse.json({error:"User not found"},{status:404});

  const nextRole=parsed.data.role??target.role;
  const nextDisabled=parsed.data.disabled??target.disabled;

  if(target.role==="OWNER" && !target.disabled && (nextRole!=="OWNER"||nextDisabled)){
    if(await enabledOwnerCount()<=1){
      return NextResponse.json({error:"The platform must keep at least one enabled Owner"},{status:409});
    }
  }

  if(target.id===actor.id && nextDisabled){
    return NextResponse.json({error:"You cannot disable your own account from this session"},{status:409});
  }

  const passwordHash=parsed.data.password?await bcrypt.hash(parsed.data.password,12):null;
  await query(`UPDATE users SET
    role=$1,
    disabled=$2,
    password_hash=COALESCE($3,password_hash),
    updated_at=NOW()
    WHERE id=$4`,[nextRole,nextDisabled,passwordHash,target.id]);

  await audit(actor.id,"USER_ACCESS_UPDATED","user",target.id,{
    email:target.email,
    role:nextRole,
    disabled:nextDisabled,
    passwordRotated:Boolean(passwordHash)
  });
  return NextResponse.json({ok:true});
}
