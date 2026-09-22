import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const schema=z.object({
  jobId:z.number().int().positive(),
  status:z.enum(["RESTORING","READY","FAILED","CLEANED"]),
  databaseName:z.string().max(100).optional(),
  error:z.string().max(2000).optional()
});

export async function POST(request:Request){
  const expected=process.env.INTERNAL_API_TOKEN;
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!expected||token!==expected) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid restore event"},{status:400});
  const d=parsed.data;

  if(d.status==="RESTORING"){
    await query("UPDATE restore_jobs SET status='RESTORING',started_at=NOW(),error=NULL WHERE id=$1",[d.jobId]);
  }else if(d.status==="READY"){
    await query("UPDATE restore_jobs SET status='READY',database_name=$1,finished_at=NOW(),error=NULL WHERE id=$2",[d.databaseName||null,d.jobId]);
  }else if(d.status==="CLEANED"){
    await query("UPDATE restore_jobs SET status='CLEANED',finished_at=NOW() WHERE id=$1",[d.jobId]);
  }else{
    await query("UPDATE restore_jobs SET status='FAILED',error=$1,finished_at=NOW() WHERE id=$2",[d.error||"Restore drill failed",d.jobId]);
  }
  return NextResponse.json({ok:true});
}
