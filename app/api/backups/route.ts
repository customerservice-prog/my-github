import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

export async function POST(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    await fs.mkdir("/backup-control",{recursive:true});
    await fs.writeFile("/backup-control/trigger",new Date().toISOString()+"\n",{mode:0o600});
    await audit(user.id,"BACKUP_REQUESTED","platform","all");
    return NextResponse.json({ok:true},{status:202});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Backup trigger unavailable"},{status:503});
  }
}
