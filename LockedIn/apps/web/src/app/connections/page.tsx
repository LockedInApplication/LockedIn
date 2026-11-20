import {Suspense} from "react";
import ConnectionsPage from "@/features/discovery/ConnectionsPage";
export default function Page(){return <Suspense fallback={<p>Opening Inbox…</p>}><ConnectionsPage/></Suspense>;}
