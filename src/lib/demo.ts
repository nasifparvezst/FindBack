import type { DemoDB, Report, UserProfile } from "./types";
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const recent = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const demoUsers: UserProfile[] = [
  { id: "student-1", name: "Ayesha Rahman", email: "ayesha@seu.edu.bd", role: "student", joinedAt: recent(24 * 26) },
  { id: "student-2", name: "Tanvir Hasan", email: "tanvir@seu.edu.bd", role: "student", joinedAt: recent(24 * 20) },
  { id: "admin-1", name: "Campus Admin", email: "admin@seu.edu.bd", role: "admin", joinedAt: recent(24 * 35) },
];

type SeedReport = Omit<Report, "createdAt" | "updatedAt"> & { hours: number };
const raw: SeedReport[] = [
  { id:"2001", type:"lost", title:"iPhone 15 Pro", category:"Phone", brand:"Apple", color:"Natural Titanium", location:"Central Library", occurredOn:ago(1), description:"iPhone 15 Pro, natural titanium with a clear case and small blue sticker.", contactPhone:"01712345678", status:"open", ownerId:"student-1", hours:2 },
  { id:"2002", type:"found", title:"Apple iPhone 15 Pro", category:"Phone", brand:"Apple", color:"Natural Titanium", location:"Library Reading Area", occurredOn:ago(1), description:"An Apple iPhone 15 Pro with a clear case and blue sticker found on a reading desk.", contactPhone:"01723456789", status:"open", ownerId:"student-2", hours:3 },
  { id:"2003", type:"lost", title:"Black leather wallet", category:"Wallet", brand:"", color:"Black", location:"University Cafeteria", occurredOn:ago(2), description:"Black wallet with student cards and a silver zip inside.", contactPhone:"01712345678", status:"open", ownerId:"student-1", hours:8 },
  { id:"2004", type:"found", title:"Student ID card", category:"ID Card", brand:"SEU", color:"Blue", location:"Academic Building B", occurredOn:ago(2), description:"Blue campus student identity card in transparent holder.", contactPhone:"01723456789", status:"open", ownerId:"student-2", hours:15 },
  { id:"2005", type:"found", title:"Black leather wallet", category:"Wallet", brand:"", color:"Black", location:"Cafeteria Entrance", occurredOn:ago(2), description:"A black leather wallet with a silver zip, found near the cafeteria.", contactPhone:"01723456789", status:"open", ownerId:"student-2", hours:20 },
  { id:"2006", type:"lost", title:"Scientific Calculator", category:"Electronics", brand:"Casio", color:"Black", location:"Engineering Lab", occurredOn:ago(3), description:"Black Casio fx-991ES Plus calculator inside a transparent cover.", contactPhone:"01723456789", status:"open", ownerId:"student-2", hours:32 },
  { id:"2007", type:"found", title:"Silver keyring", category:"Keys", brand:"", color:"Silver", location:"Main Gate", occurredOn:ago(4), description:"Small silver keyring containing two keys near the campus main gate.", contactPhone:"01712345678", status:"returned", ownerId:"student-1", hours:72 },
  { id:"2008", type:"lost", title:"Navy blue backpack", category:"Bag", brand:"Nike", color:"Navy Blue", location:"Classroom 302", occurredOn:ago(1), description:"Nike navy backpack containing two books and a reusable bottle.", contactPhone:"01723456789", status:"open", ownerId:"student-2", hours:26 },
];
export function createDemoDB(): DemoDB {
  const reports: Report[] = raw.map(({ hours, ...r }) => ({ ...r, createdAt: recent(hours), updatedAt: recent(hours) }));
  return {
    users: demoUsers, reports, claims: [], messages: [],
    notifications: [{id:"welcome-1",userId:"student-1",title:"Welcome to FindBack 2.0",body:"Explore the new campus recovery experience.",href:"/browse",read:false,createdAt:recent(1)}],
    activity: [{id:"first",actorId:"admin-1",action:"Workspace initialized",subject:"FindBack 2.0 demo",createdAt:recent(24)}],
  };
}
