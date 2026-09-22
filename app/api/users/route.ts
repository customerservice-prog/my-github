import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const createSchema=z.object({
  email:z.string().email().max(254).transform(v=>v.toLowerCase()),
  password:z.string().min(12).max(512),
  role:z.enum(["OWNER","ADMIN","DEVELOPER","VIEWER"])
});

type UserRow={
  id:number;
  email:string;
  role:string;
  disabled:boolean;
  two_factor_enabled:boolean;
  last_login_at:string|null;
  created_at:string;
};

export async function GET(){
  const actor=await getCurrentUser();
  if(!actor||actor.role!=="OWNER") return NextResponse.json({error:"Owner access required"},{status:403});
  return NextResponse.json(await query<UserRow>(
    "SELECT id,email,role,disabled,two_factor_enabled,last_login_at,created_at FROM users ORDER BY created_at"
  ));
}

export async function POST(request:Request){
  const actor=await getCurrentUser();
  if(!actor||actor.role!=="OWNER") return NextResponse.json({error:"Owner access required"},{status:403});
  const parsed=createSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid user details"},{status:400});
  try{
    const hash=await bcrypt.hash(parsed.data.password,12);
    const user=await one<UserRow>(
      `INSERT INTO users(email,password_hash,role)
       VALUES($1,$2,$3)
       RETURNING id,email,role,disabled,two_factor_enabled,last_login_at,created_at`,
      [parsed.data.email,hash,parsed.data.role]
    );
    await audit(actor.id,"USER_CREATED","user",user?.id,{email:parsed.data.email,role:parsed.data.role});
    return NextResponse.json(user,{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"User creation failed";
    if(message.includes("users_email_key")) return NextResponse.json({error:"That email already exists"},{status:409});
    return NextResponse.json({error:"User creation failed"},{status:500});
  }
}
