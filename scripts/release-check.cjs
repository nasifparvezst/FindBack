const {loadEnvConfig}=require('@next/env');
const {inspectDeployment}=require('../.test-build/deployment.js');
try{
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--mode'||!['demo','cloud'].includes(args[1]))throw new Error('Use npm run release:check -- --mode demo|cloud.');
  loadEnvConfig(process.cwd(),false,{info(){},warn(){},error(){}});
  if(!process.env.NEXT_PUBLIC_DEMO_MODE)throw new Error('Set NEXT_PUBLIC_DEMO_MODE explicitly for deployment.');
  const result=inspectDeployment(process.env,true);
  if(result.mode!==args[1])throw new Error('Deployment mode does not match the requested release mode.');
  console.log(`Deployment configuration passed (${result.mode}). No credential values were printed.`);
  console.log('Configuration only: FINAL AUDIT, live Supabase/email checks and deployment verification remain required.');
}catch(error){console.error(error.message);process.exitCode=1;}
