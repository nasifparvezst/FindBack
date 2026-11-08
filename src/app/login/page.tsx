import { DEMO_MODE } from "@/lib/config";
import DemoLogin from "@/components/demo-login";
import { CloudLogin } from "@/components/cloud-auth";
export default function LoginPage() { return DEMO_MODE ? <DemoLogin /> : <CloudLogin />; }
