const base=process.env.CI_CONTROL_URL||"http://127.0.0.1:3100";
const email=process.env.CI_BOOTSTRAP_EMAIL;
const password=process.env.CI_BOOTSTRAP_PASSWORD;

if(!email||!password) throw new Error("CI bootstrap credentials are required");

const unauth=await fetch(base+"/api/projects");
if(unauth.status!==401) throw new Error("Protected API should reject unauthenticated requests");

const login=await fetch(base+"/api/auth/login",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({email,password,otp:""})
});
if(!login.ok) throw new Error("Owner login smoke failed: "+login.status+" "+await login.text());

const cookie=login.headers.get("set-cookie");
if(!cookie) throw new Error("Login did not issue a session cookie");
const sessionCookie=cookie.split(";")[0];

const projects=await fetch(base+"/api/projects",{headers:{cookie:sessionCookie}});
if(!projects.ok) throw new Error("Authenticated project API failed: "+projects.status);

const status=await fetch(base+"/status");
if(!status.ok) throw new Error("Public status page failed: "+status.status);

console.log("Control-plane authentication smoke passed.");
