import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("restore"),backupId:z.number().int().positive(),kind:z.enum(["platform","forgejo"])}),
  z.object({action:z.literal("cleanup"),jobId:z.number().int().positive()})
]);

type Backup={id:number;snapshot_id:string|null;status:string};
type Job={id:number;snapshot_id:string;kind:string;status:string;database_name:string|null};

async function writeRequest(payload:Record<string,unknown>){
  const dir="/backup-control/restore-requests";
  await fs.mkdir(dir,{recursive:true});
  const file=dir+"/"+Date.now()+"-"+randomUUID()+".json";
  await fs.writeFile(file,JSON.stringify(payload)+"\n",{mode:0o600,flag:"wx"});
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid restore request"},{status:400});

  if(parsed.data.action==="restore"){
    const backup=await one<Backup>("SELECT id,snapshot_id,status FROM backups WHERE id=$1",[parsed.data.backupId]);
    if(!backup||backup.status!=="SUCCESS"||!backup.snapshot_id){
      return NextResponse.json({error:"Choose a successful backup with a snapshot id"},{status:400});
    }
    const job=await one<{id:number}>(
      "INSERT INTO restore_jobs(backup_id,snapshot_id,kind,status,requested_by) VALUES($1,$2,$3,'QUEUED',$4) RETURNING id",
      [backup.id,backup.snapshot_id,parsed.data.kind,user.id]
    );
    if(!job) return NextResponse.json({error:"Could not create restore job"},{status:500});
    try{
      await writeRequest({jobId:job.id,snapshotId:backup.snapshot_id,kind:parsed.data.kind,action:"restore"});
    }catch(error){
      await query("UPDATE restore_jobs SET status='FAILED',error=$1,finished_at=NOW() WHERE id=$2",[
        error instanceof Error?error.message:"Could not queue restore",job.id
      ]);
      return NextResponse.json({error:"Backup worker request queue is unavailable"},{status:503});
    }
    await audit(user.id,"RESTORE_DRILL_QUEUED","restore_job",job.id,{backupId:backup.id,kind:parsed.data.kind});
    return NextResponse.json({ok:true,jobId:job.id},{status:202});
  }

  const job=await one<Job>("SELECT id,snapshot_id,kind,status,database_name FROM restore_jobs WHERE id=$1",[parsed.data.jobId]);
  if(!job||job.status!=="READY"||!job.database_name){
    return NextResponse.json({error:"Only ready inspection databases can be cleaned up"},{status:400});
  }
  await query("UPDATE restore_jobs SET status='CLEANUP_QUEUED' WHERE id=$1",[job.id]);
  await writeRequest({jobId:job.id,snapshotId:job.snapshot_id,kind:job.kind,action:"cleanup"});
  await audit(user.id,"RESTORE_DRILL_CLEANUP_QUEUED","restore_job",job.id,{database:job.database_name});
  return NextResponse.json({ok:true},{status:202});
}
