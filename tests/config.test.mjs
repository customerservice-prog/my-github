import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("platform package and deployment files exist",()=>{
  const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
  assert.equal(pkg.private,true);
  assert.ok(pkg.scripts.build);
  assert.ok(pkg.scripts.worker);
  assert.ok(pkg.scripts.agent);
  for(const file of ["docker-compose.yml","Dockerfile.control","Dockerfile.worker","Dockerfile.agent","sql/001_init.sql","services/worker.mjs","services/agent.mjs"]){
    assert.equal(fs.existsSync(file),true,file+" should exist");
  }
});

test("example environment never contains a real secret",()=>{
  const env=fs.readFileSync(".env.example","utf8");
  assert.match(env,/replace-/);
  assert.doesNotMatch(env,/ghp_[A-Za-z0-9]{20,}/);
});
