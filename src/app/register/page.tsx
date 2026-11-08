import { DEMO_MODE } from "@/lib/config";
import DemoRegister from "@/components/demo-register";
import { CloudRegister } from "@/components/cloud-auth";
export default function RegisterPage() { return DEMO_MODE ? <DemoRegister /> : <CloudRegister />; }
