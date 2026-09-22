import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const schema=z.object({
  kind:z.string().max(50).default("PLATFORM"),
  target:z.string().max(100).default("all"),
  status:z.enum(["SUCCESS","FAILED"]),
  snapshotId:z.string().max(200).optional(),
  location:z.string().max(1000).optional(),
  sizeBytes:z.number().int().nonnegative().optional(),
  error:z.string().max(2000).optional()
});

export async function POST(request:Request){
  const expected=process.env.INTERNAL_API_TOKEN;
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!expected || token!==expected) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid event"},{status:400});
  const d=parsed.data;
  await query("INSERT INTO backups(kind,target,status,snapshot_id,location,size_bytes,error) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [d.kind,d.target,d.status,d.snapshotId||null,d.location||null,d.sizeBytes||null,d.error||null]);
  return NextResponse.json({ok:true});
}
